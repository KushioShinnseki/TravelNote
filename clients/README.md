# 手机客户端

按应用类型和使用方式组织：

```text
clients/
├── apps/
│   ├── receiver/     原 Android 扫码接收版
│   └── local/        独立 Android 本地规划版
└── miniapps/
    ├── receiver/     原扫码接收小程序（wechat / alipay）
    └── local/        本地规划小程序（shared / wechat / alipay）
```

Android 两个版本使用不同包名，可同时安装。小程序两个版本分别维护独立项目配置。本地版详细说明见 [Android 本地版](apps/local/README.md)、[本地小程序](miniapps/local/README.md)。

以下命令均在仓库根目录执行：

```sh
npm run build:local
npm run test:local
gradle -p clients/apps/receiver assembleRelease
gradle -p clients/apps/local assembleRelease
npm run build:miniapps-local
```

小程序 ZIP 仍在本机通过 `scripts/package-miniapps.ps1`、`scripts/package-local-miniapps.ps1` 生成，不通过 CD 发布。目录整理不会改变包名、应用数据或发布产物名称。
