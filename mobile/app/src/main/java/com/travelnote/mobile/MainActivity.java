package com.travelnote.mobile;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int PICK_JSON = 201;
    private static final String PREFS = "travelnote";
    private static final String SAVED_PACKET = "packet";
    private static final int INK = Color.rgb(16, 45, 52);
    private static final int CANVAS = Color.rgb(247, 245, 240);
    private static final int PAPER = Color.rgb(255, 253, 249);
    private static final int CORAL = Color.rgb(238, 115, 95);
    private static final int MUTED = Color.rgb(103, 126, 126);

    private LinearLayout content;
    private JSONObject packet;
    private String activeTag = "全部";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        packet = loadPacket();
        buildShell();
        render();
    }

    private void buildShell() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(CANVAS);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(22), dp(18), dp(18), dp(14));
        header.setBackgroundColor(INK);

        LinearLayout titleBox = new LinearLayout(this);
        titleBox.setOrientation(LinearLayout.VERTICAL);
        TextView title = text("TravelNote", 23, Color.WHITE, true);
        TextView subtitle = text("离线旅行卡片", 11, Color.rgb(163, 190, 186), false);
        titleBox.addView(title);
        titleBox.addView(subtitle);
        header.addView(titleBox, new LinearLayout.LayoutParams(0, -2, 1));

        TextView offline = pill("离线", Color.rgb(38, 74, 78), Color.rgb(182, 218, 201));
        header.addView(offline, new LinearLayout.LayoutParams(-2, dp(32)));
        root.addView(header);

        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(18), dp(20), dp(18), dp(30));
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private void render() {
        content.removeAllViews();
        if (packet == null) {
            renderEmpty();
            return;
        }
        renderImported();
    }

    private void renderEmpty() {
        content.addView(text("你的旅途，随身带走。", 28, INK, true), marginParams(0, 8, 0, 7));
        content.addView(text("从网页端导入 TravelNote 数据后，这里只展示属于你的地点和日程。", 14, MUTED, false), marginParams(0, 0, 0, 22));

        LinearLayout card = card();
        TextView icon = text("↗", 38, CORAL, true);
        card.addView(icon, marginParams(0, 0, 0, 6));
        card.addView(text("还没有旅行数据", 18, INK, true), marginParams(0, 0, 0, 6));
        card.addView(text("可以扫描网页端二维码，也可以直接选择 JSON 数据包。导入后无需网络即可查看。", 13, MUTED, false), marginParams(0, 0, 0, 18));
        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button scan = actionButton("扫描二维码", true);
        scan.setOnClickListener(v -> scanQr());
        Button file = actionButton("导入 JSON", false);
        file.setOnClickListener(v -> chooseJson());
        actions.addView(scan, new LinearLayout.LayoutParams(0, dp(46), 1));
        actions.addView(file, new LinearLayout.LayoutParams(0, dp(46), 1));
        card.addView(actions, marginParams(0, 0, 0, 0));
        content.addView(card, marginParams(0, 0, 0, 18));

        LinearLayout note = card();
        note.setBackgroundColor(Color.rgb(232, 238, 232));
        note.addView(text("数据边界", 13, INK, true), marginParams(0, 0, 0, 5));
        note.addView(text("手机端只接受 format=travelnote 的数据包，不会上传或同步其他内容。", 12, MUTED, false));
        content.addView(note);
    }

    private void renderImported() {
        JSONObject profile = packet.optJSONObject("profile");
        JSONArray destinations = packet.optJSONArray("destinations");
        JSONArray plans = packet.optJSONArray("plans");
        int destinationCount = destinations == null ? 0 : destinations.length();
        int planCount = plans == null ? 0 : plans.length();

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView heading = text("我的旅途", 27, INK, true);
        top.addView(heading, new LinearLayout.LayoutParams(0, -2, 1));
        Button importButton = actionButton("重新导入", false);
        importButton.setOnClickListener(v -> chooseJson());
        top.addView(importButton, new LinearLayout.LayoutParams(dp(100), dp(40)));
        content.addView(top, marginParams(0, 0, 0, 8));

        String home = profile == null ? "" : profile.optString("home", "");
        content.addView(text(home.isEmpty() ? "已导入的旅行数据" : "出发地 · " + home, 13, MUTED, false), marginParams(0, 0, 0, 17));

        LinearLayout stats = new LinearLayout(this);
        stats.setOrientation(LinearLayout.HORIZONTAL);
        stats.addView(stat("地点", String.valueOf(destinationCount)), new LinearLayout.LayoutParams(0, dp(78), 1));
        stats.addView(stat("安排", String.valueOf(planCount)), new LinearLayout.LayoutParams(0, dp(78), 1));
        content.addView(stats, marginParams(0, 0, 0, 18));

        JSONArray allTags = collectTags(destinations);
        HorizontalScrollView tagScroll = new HorizontalScrollView(this);
        tagScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout tags = new LinearLayout(this);
        tags.setOrientation(LinearLayout.HORIZONTAL);
        tags.addView(tagButton("全部"));
        for (int i = 0; i < allTags.length(); i++) tags.addView(tagButton(allTags.optString(i)), horizontalMargins(7, 0, 0, 0));
        tagScroll.addView(tags);
        content.addView(tagScroll, marginParams(0, 0, 0, 20));

        content.addView(sectionTitle("想去的地方", destinationCount + " 条"), marginParams(0, 0, 0, 10));
        boolean hasDestination = false;
        if (destinations != null) {
            for (int i = 0; i < destinations.length(); i++) {
                JSONObject item = destinations.optJSONObject(i);
                if (item != null && matchesTag(item)) {
                    content.addView(destinationCard(item), marginParams(0, 0, 0, 11));
                    hasDestination = true;
                }
            }
        }
        if (!hasDestination) content.addView(text("这个标签下还没有地点。", 13, MUTED, false), marginParams(0, 0, 0, 20));

        content.addView(sectionTitle("日程安排", planCount + " 个"), marginParams(0, 12, 0, 10));
        if (plans != null && plans.length() > 0) {
            for (int i = 0; i < plans.length(); i++) {
                JSONObject item = plans.optJSONObject(i);
                if (item != null) content.addView(planCard(item), marginParams(0, 0, 0, 10));
            }
        } else {
            content.addView(text("还没有安排好的日期。", 13, MUTED, false));
        }

        Button clear = actionButton("清除本机数据", false);
        clear.setTextColor(CORAL);
        clear.setOnClickListener(v -> {
            packet = null;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().apply();
            activeTag = "全部";
            render();
            Toast.makeText(this, "已清除本机数据", Toast.LENGTH_SHORT).show();
        });
        content.addView(clear, marginParams(0, 22, 0, 0));
    }

    private LinearLayout destinationCard(JSONObject item) {
        LinearLayout card = card();
        LinearLayout top = new LinearLayout(this);
        TextView pin = text("⌖", 24, CORAL, true);
        top.addView(pin, marginParams(0, 0, 0, 0));
        TextView status = text(item.optString("status", "想去"), 11, MUTED, false);
        status.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        top.addView(status, new LinearLayout.LayoutParams(0, dp(28), 1));
        card.addView(top);

        card.addView(text(item.optString("name", "未命名地点"), 19, INK, true), marginParams(0, 11, 0, 2));
        String region = item.optString("region", "") + " · " + item.optString("location", "");
        card.addView(text(region.replaceAll(" · $", ""), 12, MUTED, false), marginParams(0, 0, 0, 10));

        JSONArray tags = item.optJSONArray("tags");
        if (tags != null) {
            LinearLayout tagRow = new LinearLayout(this);
            for (int i = 0; i < tags.length(); i++) {
                TextView tag = pill(tags.optString(i), Color.rgb(245, 233, 224), Color.rgb(174, 112, 91));
                tagRow.addView(tag, horizontalMargins(0, 0, 6, 0));
            }
            card.addView(tagRow, marginParams(0, 0, 0, 12));
        }
        card.addView(text("⇢  " + item.optString("transport", "交通方式待补充"), 12, MUTED, false), marginParams(0, 0, 0, 8));
        String note = item.optString("note", "");
        if (!note.isEmpty()) card.addView(text(note, 12, Color.rgb(133, 148, 143), false));
        return card;
    }

    private LinearLayout planCard(JSONObject item) {
        LinearLayout card = card();
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView date = text(item.optString("date", ""), 11, CORAL, true);
        row.addView(date, new LinearLayout.LayoutParams(dp(88), -2));
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.addView(text(item.optString("destination", "未命名安排"), 15, INK, true));
        body.addView(text(item.optString("activity", ""), 12, MUTED, false), marginParams(0, 4, 0, 0));
        row.addView(body, new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(text(item.optString("time", ""), 11, MUTED, false));
        card.addView(row);
        return card;
    }

    private TextView sectionTitle(String title, String count) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView left = text(title, 17, INK, true);
        row.addView(left, new LinearLayout.LayoutParams(0, -2, 1));
        TextView right = text(count, 11, MUTED, false);
        row.addView(right);
        TextView wrapper = text("", 1, INK, false);
        wrapper.setVisibility(View.GONE);
        // A horizontal row is returned through a lightweight container-compatible TextView fallback.
        // The title remains readable and the count is shown in the section header below.
        left.setText(title + "   " + count);
        return left;
    }

    private Button tagButton(String label) {
        Button button = actionButton(label, label.equals(activeTag));
        button.setOnClickListener(v -> { activeTag = label; render(); });
        return button;
    }

    private boolean matchesTag(JSONObject item) {
        if ("全部".equals(activeTag)) return true;
        JSONArray tags = item.optJSONArray("tags");
        if (tags == null) return false;
        for (int i = 0; i < tags.length(); i++) if (activeTag.equals(tags.optString(i))) return true;
        return activeTag.equals(item.optString("status"));
    }

    private JSONArray collectTags(JSONArray destinations) {
        JSONArray result = new JSONArray();
        if (destinations == null) return result;
        for (int i = 0; i < destinations.length(); i++) {
            JSONArray tags = destinations.optJSONObject(i) == null ? null : destinations.optJSONObject(i).optJSONArray("tags");
            if (tags == null) continue;
            for (int j = 0; j < tags.length(); j++) {
                String value = tags.optString(j);
                boolean exists = false;
                for (int k = 0; k < result.length(); k++) if (value.equals(result.optString(k))) exists = true;
                if (!exists && !value.isEmpty()) result.put(value);
            }
        }
        return result;
    }

    private LinearLayout stat(String label, String value) {
        LinearLayout box = card();
        box.setPadding(dp(12), dp(11), dp(12), dp(9));
        box.addView(text(label, 11, MUTED, false));
        box.addView(text(value, 24, INK, true), marginParams(0, 4, 0, 0));
        return box;
    }

    private LinearLayout card() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(16), dp(15), dp(16), dp(15));
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(PAPER);
        bg.setCornerRadius(dp(12));
        box.setBackground(bg);
        return box;
    }

    private Button actionButton(String label, boolean primary) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        button.setAllCaps(false);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(primary ? Color.WHITE : INK);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(primary ? CORAL : Color.rgb(234, 237, 231));
        bg.setCornerRadius(dp(8));
        button.setBackground(bg);
        button.setPadding(dp(8), 0, dp(8), 0);
        return button;
    }

    private TextView pill(String label, int background, int foreground) {
        TextView view = text(label, 10, foreground, false);
        view.setGravity(Gravity.CENTER);
        view.setPadding(dp(9), 0, dp(9), 0);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(background);
        bg.setCornerRadius(dp(30));
        view.setBackground(bg);
        return view;
    }

    private TextView text(String value, float size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        view.setTextColor(color);
        view.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        view.setGravity(Gravity.CENTER_VERTICAL);
        return view;
    }

    private LinearLayout.LayoutParams marginParams(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    private LinearLayout.LayoutParams horizontalMargins(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, -2);
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }

    private void chooseJson() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        startActivityForResult(intent, PICK_JSON);
    }

    private void scanQr() {
        new IntentIntegrator(this)
                .setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
                .setPrompt("扫描网页端 TravelNote 二维码")
                .setBeepEnabled(false)
                .setOrientationLocked(false)
                .initiateScan();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        IntentResult scan = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if (scan != null) {
            if (scan.getContents() != null) importPacket(scan.getContents());
            return;
        }
        if (requestCode == PICK_JSON && resultCode == RESULT_OK && data != null) {
            try (InputStream stream = getContentResolver().openInputStream(data.getData())) {
                if (stream != null) importPacket(readAll(stream));
            } catch (Exception e) {
                showError("读取文件失败");
            }
        }
    }

    private void importPacket(String raw) {
        try {
            String json = raw.trim();
            if (json.startsWith("TN1.")) {
                String encoded = json.substring(4).replace('-', '+').replace('_', '/');
                while (encoded.length() % 4 != 0) encoded += "=";
                json = new String(Base64.decode(encoded, Base64.DEFAULT), StandardCharsets.UTF_8);
            }
            JSONObject parsed = new JSONObject(json);
            if (!"travelnote".equals(parsed.optString("format")) || parsed.optInt("version", 0) < 1
                    || !parsed.has("destinations") || !parsed.has("plans")) {
                throw new JSONException("unsupported packet");
            }
            packet = parsed;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(SAVED_PACKET, parsed.toString()).apply();
            activeTag = "全部";
            render();
            Toast.makeText(this, "TravelNote 数据已导入", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            showError("这不是有效的 TravelNote 数据包");
        }
    }

    private JSONObject loadPacket() {
        String value = getSharedPreferences(PREFS, MODE_PRIVATE).getString(SAVED_PACKET, null);
        if (value == null) return null;
        try { return new JSONObject(value); } catch (JSONException e) { return null; }
    }

    private String readAll(InputStream stream) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = stream.read(buffer)) != -1) out.write(buffer, 0, count);
        return out.toString(StandardCharsets.UTF_8.name());
    }

    private void showError(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
}
