package com.travelnote.local;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.JsPromptResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String HOST = "local.travelnote.invalid";
    private static final int EXPORT = 10, IMPORT = 11;
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private WebView web;
    private AtomicFile workspace;
    private String pendingExport;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        workspace = new AtomicFile(new File(getFilesDir(), "workspace.json"));
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setSupportZoom(false);
        web.addJavascriptInterface(new Storage(), "TravelNoteLocal");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())) return blocked();
                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                if (path.contains("..")) return blocked();
                String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : "text/html";
                try { return new WebResourceResponse(mime, "UTF-8", getAssets().open(path.substring(1))); }
                catch (Exception error) { return blocked(); }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton(android.R.string.ok, (d,w) -> result.confirm()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton(android.R.string.ok, (d,w) -> result.confirm()).setNegativeButton(android.R.string.cancel, (d,w) -> result.cancel()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
            @Override public boolean onJsPrompt(WebView view, String url, String message, String value, JsPromptResult result) {
                EditText input = new EditText(MainActivity.this); input.setText(value);
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setView(input).setPositiveButton(android.R.string.ok, (d,w) -> result.confirm(input.getText().toString())).setNegativeButton(android.R.string.cancel, (d,w) -> result.cancel()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
        });
        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime());
                root.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
        }
        setContentView(root);
        web.loadUrl("https://" + HOST + "/index.html");
    }
    private WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0])); }

    public final class Storage {
        @JavascriptInterface public synchronized String readWorkspace() {
            try { return new String(workspace.readFully(), StandardCharsets.UTF_8); }
            catch (java.io.FileNotFoundException missing) { return ""; }
            catch (Exception error) { return "{\"unreadable\":"; } // Let the UI report recovery; never overwrite.
        }
        @JavascriptInterface public synchronized boolean writeWorkspace(String json) {
            FileOutputStream stream = null;
            try {
                byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
                if (bytes.length > MAX_BYTES) return false;
                JSONObject value = new JSONObject(json);
                if (!value.has("destinations") || !value.has("plans")) return false;
                stream = workspace.startWrite(); stream.write(bytes); workspace.finishWrite(stream); return true;
            } catch (Exception error) { if (stream != null) workspace.failWrite(stream); return false; }
        }
        @JavascriptInterface public void exportBackup(String json, String name) {
            if (json.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) return;
            runOnUiThread(() -> {
                pendingExport = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(intent, EXPORT); } catch (Exception error) { toast("无法打开文件选择器"); }
            });
        }
        @JavascriptInterface public void importBackup() { runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
            try { startActivityForResult(intent, IMPORT); } catch (Exception error) { toast("无法打开文件选择器"); }
        }); }
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) { if (code == EXPORT) pendingExport = null; return; }
        Uri uri = data.getData();
        if (code == EXPORT && pendingExport != null) {
            try (java.io.OutputStream output = getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new java.io.IOException();
                output.write(pendingExport.getBytes(StandardCharsets.UTF_8)); toast("备份已保存");
            } catch (Exception error) { toast("备份保存失败"); } finally { pendingExport = null; }
        } else if (code == IMPORT) {
            try (InputStream input = getContentResolver().openInputStream(uri); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                if (input == null) throw new java.io.IOException();
                byte[] bytes = new byte[8192]; int count;
                while ((count = input.read(bytes)) != -1) { if (buffer.size() + count > MAX_BYTES) throw new java.io.IOException(); buffer.write(bytes, 0, count); }
                String json = buffer.toString("UTF-8");
                web.evaluateJavascript("window.travelNoteImport(" + JSONObject.quote(json) + ")", null);
            } catch (Exception error) { toast("无法读取备份，文件可能损坏或超过 8 MB"); }
        }
    }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(function(){var b=document.querySelector('.modal-backdrop .close-button');if(b){b.click();return true;}return false;})()", result -> {
            if (!"true".equals(result)) super.onBackPressed();
        });
    }
    @Override protected void onDestroy() { web.removeJavascriptInterface("TravelNoteLocal"); web.destroy(); super.onDestroy(); }
}
