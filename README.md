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

首次启动会从本机 `.env` 自动创建一个初始账号。账号密码不写入 README；需要修改时编辑 `.env`，已存在的账号不会被启动脚本覆盖。网页现在支持注册新账号和登录后修改密码，所有旅行数据 API 都需要当前账号的登录会话，不同账号之间不会共享数据。

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

## 使用建议

TravelNote 记录的地点、出发地、交通路线、日程和二维码数据包可能包含个人行程信息，建议仅在本机或私有网络中配置使用。

不建议直接部署到公开地址，也不要将包含真实旅行数据的 JSON、二维码或浏览器数据提交到公开仓库。若必须对外提供访问，请先增加身份验证、访问控制、HTTPS 和数据加密，并确认数据不会被搜索引擎或第三方服务收集。
