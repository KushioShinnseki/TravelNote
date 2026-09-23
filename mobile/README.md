# TravelNote Android

当前目录已经包含一个最小可构建的 Android App，负责离线导入并展示 TravelNote 数据。二维码和 JSON 数据包必须包含 `accountId`；首次导入绑定账号，后续只接受同一账号的数据，并按地点/日程记录 ID 统计新建、更新和删除。工程结构：

```text
mobile/
  settings.gradle.kts
  build.gradle.kts
  app/
```

GitHub Actions 会在推送 `app-v*` 标签时自动准备 Gradle 8.7，执行 `assembleRelease`，将 APK 和 SHA-256 校验文件发布到同名 GitHub Release。

建议使用 Android Studio 的标准 Gradle Wrapper，并把签名配置放在 GitHub Actions Secrets 中，不要把 keystore 或密码提交到仓库。

## 自签名配置

CI 使用自签名证书构建 release APK。先在安全的本机生成一次 keystore：

```bash
keytool -genkeypair -v \
  -keystore travelnote-release.keystore \
  -alias travelnote \
  -keyalg RSA -keysize 2048 -validity 10000
```

然后把以下内容配置为 GitHub Actions Secrets：

- `ANDROID_KEYSTORE_BASE64`：keystore 文件的 Base64 内容
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`：例如 `travelnote`
- `ANDROID_KEY_PASSWORD`

PowerShell 可这样生成 Base64：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("travelnote-release.keystore"))
```

keystore 不要提交到 Git。它必须长期安全保存，因为后续 APK 更新必须使用同一个签名文件。

地点和日程的补充说明支持常用 Markdown（标题、加粗、斜体、列表、行内代码、链接和换行）。数据包仍保存原始 Markdown 文本，手机端默认折叠说明，点击后才进行格式化展示。
