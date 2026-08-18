# 私人 AI 工作台

一个部署在 Cloudflare Workers + D1 上的单用户长期 AI 工作台，并提供 GitHub Actions 自动构建未签名 iOS IPA。

## 五个角色

- 新媒体运营助手
- 健康咨询师
- 日常助理
- 软装学习伙伴
- 随笔记录员

所有输入从同一个入口进入，由模型自动判断主归属。每条对话会同时写入：

1. 原始对话记录
2. 时间线摘要
3. 可复用长期记忆
4. 可选的结构化指标

## 架构

- Web UI: React + Vite
- API / Hosting: Cloudflare Worker + Workers Static Assets
- Database: Cloudflare D1
- AI: Cloudflare Workers AI（默认）/ OpenAI Responses API（可选）
- iOS: Capacitor 8
- CI/CD: GitHub Actions

## 一、部署 Cloudflare

### 1. GitHub Secrets

在仓库 `Settings -> Secrets and variables -> Actions` 添加：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `APP_TOKEN`：你自己的长随机私人访问口令

默认直接使用 Cloudflare Workers AI，不需要 OpenAI API Key。

如果以后想切换到 OpenAI：

- 再添加可选 Secret：`OPENAI_API_KEY`
- 把 `wrangler.jsonc` 中 `AI_PROVIDER` 改成 `openai`
- 可按需修改 `OPENAI_MODEL`

Cloudflare API Token 建议至少包含 Workers Scripts 写入/编辑权限与 D1 写入（D1 Edit/Write）权限，并只作用于这个 Cloudflare Account。Workers AI 通过 Worker binding 在运行时调用。

### 2. 推送到 main

`Deploy Cloudflare` 工作流会：

1. 安装依赖
2. 构建网页
3. 检查 `private-ai-workbench` D1 是否存在，不存在则在 APAC 创建
4. 临时写入 D1 UUID
5. 应用 migrations
6. 部署 Worker + 静态资源
7. 将 APP_TOKEN 写入 Worker Secret；如配置了 OpenAI Key，也会一并写入

首次部署完成后，记下 Cloudflare 给你的 URL。

## 二、构建 iOS IPA

打开 GitHub `Actions -> Build Unsigned iOS IPA -> Run workflow`。

输入：

- `api_url`: 你的 Cloudflare URL
- `bundle_id`: 可保持默认，也可以改成你自己的唯一 Bundle ID

工作流会使用 macOS 26 + Xcode 26.6、Capacitor 8 自动生成 iOS 工程，编译真机 Release `.app`，然后打包成：

`PrivateAIWorkbench-unsigned.ipa`

它是**未签名 IPA**，适合你下载后自行用你熟悉的自签工具重签安装。

## 三、本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
# 先把 wrangler.jsonc 中 D1 database_id 替换为真实 UUID
npm run cf:migrate:local
npm run cf:dev
```

如果只调 UI：

```bash
npm run dev
```

## 数据表

- `entries`: 原始输入 + AI 回复 + 摘要 + 分类
- `memories`: 稳定偏好、目标、项目状态、长期事实
- `metrics`: 可追踪的数值/状态指标

## 安全建议

- 默认模型运行在 Cloudflare Workers AI；如启用 OpenAI，`OPENAI_API_KEY` 只放 Worker Secret，不进入前端。
- `APP_TOKEN` 不要写死在源码；由 GitHub Secret 注入。
- 当前是单用户私人模式，前端把 APP_TOKEN 保存在设备 localStorage。
- 后续如需要更强认证，可升级为 Cloudflare Access / Apple Sign In。
- 健康角色用于一般性信息、生活方式建议和趋势整理，不替代线下医疗诊断。

## 下一阶段可加

- 每日/每周自动总结
- 提醒与日程
- 图片、语音、文件输入
- 新媒体账号数据看板
- 健康指标趋势图
- 软装案例图库与标签体系
- 随笔全文搜索
- Vectorize 语义检索
- 推送通知
