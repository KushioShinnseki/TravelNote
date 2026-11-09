# TravelNote 本地版（独立 Android App）

本地版直接在手机上管理景点、标签、交通、补充说明、出行计划和多天日程。每条日程可以选择多个景点并调整游览顺序，时间可留空表示全天。应用首次打开即显示出行计划，不需要网页、登录或服务器。

与原版分开：

|版本|Android 项目|包名|发布文件|
|---|---|---|---|
|原版扫码接收端|`mobile/`|`com.travelnote.mobile`|`travelnote-release.apk`|
|独立本地规划端|`mobile-local/`|`com.travelnote.local`|`travelnote-local-release.apk`|

两者可以同时安装。图标沿用 TravelNote 图形，桌面名称为“TravelNote 本地版”。本地版没有网络权限；业务数据通过原子写入保存在应用私有目录 `files/workspace.json`，系统文件选择器负责备份导入导出，不申请存储权限。升级安装保留数据，卸载或清空应用数据会移除本地文件。

## 开发与本机编译

在仓库根目录执行：

```sh
npm ci
npm run test:local
npm run dev:local
npm run build:local
```

使用 Java 17、Gradle 8.7+、Android SDK 35，然后执行：

```sh
gradle -p mobile-local assembleDebug
gradle -p mobile-local assembleRelease
```

发布签名使用现有的 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。未配置发布签名时，只使用 Debug 包测试，或自行签署 Release 包。打包前必须执行 `npm run build:local`，所有页面、脚本、字体和样式均随 APK 内置，加载时不会访问远程服务器。

## 直接查看与 JSON 交换

出行计划与日程在手机中直接查看和编辑，只有“备份与恢复”使用导出、导入。可将完整 JSON 备份单独保存，也可把网页导出的完整、单次出行或单日程 JSON 导入手机。本地版导出的 JSON 带有 `source: travelnote-local`；网页会提示将数据写入当前登录账号，经确认后才导入。完整备份替换全部内容，局部数据包只更新对应范围。

导入前建议保留旧备份；本地文件大小限制为 8 MB，超限或写入失败不会覆盖之前保存的文件。读取损坏的数据会保留原文件并提示恢复，不自动清空。

## 小屏与发布

按 320×568 CSS 像素设计，覆盖 iPhone 5 尺寸的小屏布局，并支持横屏、手机和平板。表单单列滚动，按钮至少 44px，底部导航与弹窗不会相互遮挡。Android 端最低 Android 8.0，建议使用更新的 Android System WebView；这是 Android APK，不是 iOS 安装包。

CD 在现有构建流程中同时生成原版 APK 和本地版 APK 及各自 SHA-256 文件，沿用现有签名 Secrets；不会自动安装到设备。对应本地小程序见 `miniapps-local/`，只在本机生成和打包，不由 CD 发布。
