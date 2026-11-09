# TravelNote 本地规划小程序

此目录与原扫码接收小程序 `miniapps/` 分开。本地规划版可在手机中直接创建、修改和删除景点、标签、出行计划及多天多景点日程，不依赖网页 API 或账号。数据只写入当前微信/支付宝小程序存储，两个平台的存储互不相通。补充说明支持 Markdown，点击后展开。

`shared/` 是共用页面、样式和本地数据模型；`wechat/`、`alipay/` 保存独立项目配置。构建命令生成可直接导入开发者工具的完整项目：

```sh
npm ci
npm run build:miniapps-local
```

输出目录：

- `artifacts/travelnote-local-wechat/`：微信开发者工具导入此目录，再填写自己的 AppID。
- `artifacts/travelnote-local-alipay/`：支付宝开发者工具导入此目录，再配置自己的应用。

源码编译为 ES2015，样式使用 CSS px 和单列可滚动表单，最低布局宽度 320px，面向 iPhone 5 尺寸的小屏，也会适配宽屏。屏幕适配不代表绕过微信/支付宝客户端对旧版 iOS 的支持限制。

本机打包（PowerShell）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-local-miniapps.ps1
```

会生成独立的 `travelnote-local-wechat-miniapp.zip`、`travelnote-local-alipay-miniapp.zip` 及校验和。小程序不加入 CD 发布；上传、审核和平台发布由使用者自行操作。

在“备份”页生成完整 JSON 文本，可复制到安全位置独立保存，也可以粘贴网页或本地 App 的完整 JSON 备份恢复。只接受完整备份；恢复前会确认，写入失败会保留之前数据。小程序存储容量受平台限制，空间不足时会提示保存失败。卸载、清理小程序数据或更换手机可能丢失规划，请定期备份。
