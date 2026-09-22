# TravelNote

TravelNote 是一个离线优先的旅行记录工作台：网页端记录想去的地方、理由标签、位置、交通和日程，并通过二维码或 JSON 数据包交给手机端导入。网页端的“标签管理”支持手动维护自定义标签，标签会随数据包一起交换。

## Docker 本地运行

```bash
docker compose up --build
```

然后打开 <http://localhost:8080>。网页数据默认保存在浏览器本机，不写入服务器。

## CI/CD 发布方式

1. 在 Actions 中手动运行 `CI - Promote branch`，选择工作分支和目标分支（通常是 `main`）。
2. CI 会比较两个分支，使用 squash merge 把变更压成一个 commit，直接写入目标分支；出现冲突或目标分支已被其他提交更新时会停止。
3. `main` 更新后自动触发 `CD - Build deliverables`，构建并上传网页 ZIP、Docker 镜像包和 APK。
4. 推送 `web-v0.1.0` 或 `app-v0.1.0` 标签，或者手动选择发布时，CD 会创建 GitHub Release。

主分支不会被强制重写历史，只会保留每次 CI 合并产生的单一 squash commit。若 `main` 开启了分支保护，需要允许 Actions 写入，或改成由 CI 创建 Pull Request。
