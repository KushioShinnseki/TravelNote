# 小程序本地打包与整体产物说明

## 小程序只支持本地打包

微信和支付宝小程序源码需要保留在 Git 中，位置为：

```text
miniapps/wechat/
miniapps/alipay/
```

但是小程序 ZIP 不通过 CI/CD 构建、上传或发布。小程序只能在本地打包，再使用对应平台的开发者工具导入和发布。

Windows PowerShell 执行：

```powershell
.\scripts\package-miniapps.ps1
```

生成文件：

```text
artifacts/travelnote-wechat-miniapp.zip
artifacts/travelnote-wechat-miniapp.zip.sha256
artifacts/travelnote-alipay-miniapp.zip
artifacts/travelnote-alipay-miniapp.zip.sha256
```

`artifacts/` 已加入 `.gitignore`，这些 ZIP 和校验文件不会提交到 Git，也不会进入 CI/CD Release。

导入平台开发者工具：

1. 解压对应 ZIP。
2. 微信使用微信开发者工具导入，支付宝使用支付宝小程序开发者工具导入。
3. 填写自己的 AppID。
4. 检查扫码权限和基础库版本。
5. 后续上传、审核和发布由开发者手动完成。

小程序不会直接访问 TravelNote API。它们只扫描网页端二维码，二维码包含当前账号的 `accountId`；首次扫描绑定账号，之后只接受相同账号 ID 的数据。地点和日程按照记录 ID 处理新建、更新和删除，设置页的清空按钮只删除手机本地缓存。

## CI/CD 负责的内容

工作流文件：

```text
.github/workflows/cd-build.yml
```

CI/CD 不处理小程序，只负责 Web Docker 部署包和 Android APK：

```text
触发工作流
  ├─ main 分支 push
  ├─ web-v* / app-v* 标签 push
  └─ 手动 workflow_dispatch
        ↓
CI 手动 Promote 成功推送 main 后，会显式 dispatch CD
        ↓
构建 Web + API + PostgreSQL Docker 栈
        ↓
健康检查、登录检查、工作区 API 检查
        ↓
保存 Web/API/PostgreSQL 镜像
        ↓
生成完整 Web Docker ZIP
        ↓
使用签名 Secrets 构建 Android APK
        ↓
上传 GitHub Actions Artifact
        ↓
满足条件时创建 GitHub Release
```

CI Promote 成功后会自动将 CD 的 `publish_release` 设置为 `true`。CD 成功后会按上海时区生成 Release 标签，格式为 `YYYYMMDD_XXXX`，其中 `XXXX` 从当天已有标签中检测最大序号后递增，例如 `20260923_0001`、`20260923_0002`。生成标签指向本次 CD 构建的提交，不会覆盖同日已有 Release。

### Web Docker 产物

`travelnote-web.zip` 包含：

- Web 页面 `dist/`
- API 服务 `server/`
- Nginx 配置 `deploy/`
- Ubuntu 启停脚本 `deploy/start.sh`、`deploy/stop.sh`
- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- Web、API、PostgreSQL 镜像包

### Android 产物

CI 使用 Java 17 和 Gradle 8.7 构建自签名 APK，需要配置：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

APK 和校验文件只作为 Artifact/Release 附件，keystore 和密码不会进入 Git。

### Artifact 和 Release

- 每次成功运行都会上传 Web Docker 包和 APK Artifact。
- 推送匹配版本标签，或手动运行时选择创建 Release，才会生成 GitHub Release。
- GitHub Release 不包含微信或支付宝小程序 ZIP。
- 小程序 ZIP 只在本地 `artifacts/` 生成，不能通过 Git 提交或 CI/CD 发布。
