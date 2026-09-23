# TravelNote

TravelNote 是一个离线优先的旅行记录工作台：网页端记录想去的地方、理由标签、位置、交通和日程，并通过二维码或 JSON 数据包交给手机端导入。网页端的“标签管理”支持手动维护自定义标签，标签会随数据包一起交换。

## Docker 本地运行

```bash
docker compose up --build
```

然后打开 <http://localhost:8080>，使用本地账号登录。数据库会保存到 Docker volume `travelnote-db`，账号密码只以 bcrypt 哈希形式保存；出发地、标签、旅行地点、交通、旅行安排、地点补充说明、日程和日程补充说明都会按账号保存到 PostgreSQL。

`travelnote-web.zip` 是完整 Web Docker 部署包，包含 `dist` 页面、`server` API、Nginx 配置、Docker Compose 配置、`.env.example` 以及 Web/API/PostgreSQL 镜像。解压后填写 `.env`，可先加载镜像再启动：

```bash
docker load < docker-images/travelnote-docker-images.tar.gz
docker compose up -d --no-build
```

Ubuntu 服务器也可以使用 ZIP 中的脚本启动和停止服务：

```bash
chmod +x deploy/start.sh deploy/stop.sh
./deploy/start.sh
./deploy/stop.sh
```

脚本固定使用 Compose 项目名 `travelnote`，只操作该项目的 Web、API、PostgreSQL 容器和网络，不会停止服务器上的其他 Docker Compose 项目，也不会删除数据库 volume。需要使用其他环境文件或项目名时，可设置 `TRAVELNOTE_ENV_FILE` 或 `TRAVELNOTE_COMPOSE_PROJECT`。

首次启动会从本机 `.env` 自动创建一个初始账号。账号密码不写入 README；需要修改时编辑 `.env`，已存在的账号不会被启动脚本覆盖。网页现在支持注册新账号和登录后修改密码，所有旅行数据 API 都需要当前账号的登录会话，不同账号之间不会共享数据。

## 环境文件和敏感配置

项目中的环境文件用途如下：

- `.env.example`：可提交的配置模板，只包含示例值，不放真实密码和密钥。
- `.env`：本机 Docker Compose 使用的真实配置，已被 `.gitignore` 忽略，不要提交到 Git。
- `.env.*`：其他本地环境配置也会被忽略；Docker Compose 默认只读取 `.env`，使用其他文件时显式指定 `--env-file`。

首次配置可以复制模板：

```powershell
Copy-Item .env.example .env
```

主要变量：

| 变量 | 用途 |
| --- | --- |
| `POSTGRES_DB` | PostgreSQL 数据库名 |
| `POSTGRES_USER` | PostgreSQL 用户名 |
| `POSTGRES_PASSWORD` | PostgreSQL 数据库密码 |
| `JWT_SECRET` | Web 登录会话签名密钥 |
| `SEED_ADMIN_USERNAME` | 首次启动时创建的初始账号 |
| `SEED_ADMIN_PASSWORD` | 首次启动时创建的初始账号密码 |

`.env` 中的初始账号只在账号不存在时创建，后续不会覆盖已有账号密码。`.env` 不会被复制进 Docker 镜像或完整 Web ZIP，发布包只包含 `.env.example`。本项目按本地/私有网络使用设计，不要把示例密码和弱密钥用于公开部署。

Android 签名使用的 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS` 和 `ANDROID_KEY_PASSWORD` 是 Gradle/构建环境变量，不是网页 Docker 的 `.env` 配置。keystore 和这些密码只应保存在本机安全环境或 GitHub Actions Secrets 中，不要提交到 Git。

微信和支付宝小程序不读取 `.env`，它们只在本地开发者工具中填写各自的 AppID；小程序 ZIP 也只允许本地脚本生成。

旅游点和日程的“补充说明”支持 Markdown。网页端会安全地渲染常用语法，原始 Markdown 会随 JSON、二维码和账号数据一起保存；例如：

```markdown
## 预约信息
- **集合时间**：09:00
- [官方预约页面](https://example.com)
```

支持标题、加粗、斜体、行内代码、列表、链接和换行。Markdown 只用于补充说明，地点名称、交通和日程正文仍按普通文本处理。

## 账号数据 API

当前账号登录后，Web 端使用以下 API 读写自己的工作区：

- `GET /api/workspace`：读取出发地、标签、旅行地点和日程。
- `PUT /api/workspace`：事务性替换当前账号的完整工作区，用于新增、编辑、删除和导入数据。
- `GET /api/auth/me`：检查当前登录会话。
- `POST /api/auth/register`：注册账号并自动登录。
- `POST /api/auth/login`、`POST /api/auth/logout`：登录和退出。
- `POST /api/auth/change-password`：登录后使用当前密码修改密码。

数据库使用 `account_id` 隔离 `profiles`、`tags`、`destinations`、`destination_tags` 和 `plans` 表；没有当前账号的 HttpOnly 会话时，工作区 API 会返回 `401`。密码始终以 bcrypt 哈希形式保存。

写请求支持 `Idempotency-Key`。重试时使用相同的 Key 和请求内容会返回第一次请求的结果；同一个 Key 搭配不同内容会返回 `409`，避免重复注册、重复改密或重复写入。

## 小程序

仓库提供两套离线小程序源码：

- `miniapps/wechat`：微信小程序，使用微信开发者工具导入。
- `miniapps/alipay`：支付宝小程序，使用支付宝小程序开发者工具导入。

小程序通过“扫码同步数据”读取网页端二维码，不直接访问网络。二维码包含当前登录账号的 `accountId`；首次扫描绑定账号，后续只接受同一账号的数据。地点和日程按记录 ID 计算新建、更新和删除，网页端删除的记录会在下一次同步时从小程序本地删除。

## 使用建议

TravelNote 记录的地点、出发地、交通路线、日程和二维码数据包可能包含个人行程信息，建议仅在本机或私有网络中配置使用。

不建议直接部署到公开地址，也不要将包含真实旅行数据的 JSON、二维码或浏览器数据提交到公开仓库。若必须对外提供访问，请先增加身份验证、访问控制、HTTPS 和数据加密，并确认数据不会被搜索引擎或第三方服务收集。
