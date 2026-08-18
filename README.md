# 私人 AI 工作台 v1.0

一个单用户、长期积累的私人 AI 工作台：Cloudflare Worker + D1 + React Web App，配一个可长期复用的原生 iOS WebView 壳。

## 核心思路

**Web 才是产品本体，IPA 只是一层安全壳。**

- Web：功能、UI、AI 配置、记忆逻辑都部署在 Cloudflare，更新网页不需要重新安装 IPA。
- iOS 壳：首次输入工作台域名和访问口令，验证后用 Keychain 保存，30 天免密；随后全屏加载远端工作台。
- GitHub：`main` 每次提交自动部署 Cloudflare；iOS 壳只在你手动触发时编译一次。

## 五个自动角色

- 新媒体运营
- 健康咨询
- 日常助理
- 软装学习
- 随笔记录

用户无需手动切角色。AI 自动判断主归属，并把值得长期保留的信息写进 D1。

## AI 提供商

网页「设置 → AI 模型」支持：

1. **Cloudflare Workers AI**：默认，无额外 API key。
2. **OpenAI Responses API**：默认 API 地址 `https://api.openai.com/v1`，模型名称可自由填写。
3. **OpenAI 兼容 API**：可填写自定义 HTTPS Base URL、API key、模型名称；后端使用 `/chat/completions`。

API key 不回传到前端。保存时由 Worker 使用 APP_TOKEN 派生 AES-GCM 密钥，加密后写入 D1。

> 如果你更换 GitHub Secret `APP_TOKEN`，此前加密保存的第三方 API key 将无法解密，需要在设置中重新填写一次。

## GitHub Secrets

仓库 `Settings → Secrets and variables → Actions`：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `APP_TOKEN`

Cloudflare Token 至少需要：

- Account → Workers Scripts → Edit
- Account → D1 → Edit

可选：在 GitHub `Variables` 中增加：

- `APP_PUBLIC_URL=https://db.dubin.cc.cd`

这样部署后的 Smoke Test 会直接验证你的自定义域名；不填则验证 workers.dev 地址。

## Cloudflare 部署

工作流：`.github/workflows/deploy-cloudflare.yml`

它会自动完成：

1. npm install
2. TypeScript typecheck
3. Vite 构建
4. 创建/解析 D1
5. 执行全部 migrations
6. 部署 Worker + Static Assets
7. 验证网页首页
8. 验证错误口令必须返回 401
9. 验证 `/api/health`
10. 验证 D1 `/api/overview`
11. 验证 AI 设置接口

## iOS 壳

工作流：`.github/workflows/build-ios.yml`

手动运行 `Build iOS Shell IPA` 即可。它不需要填写 Cloudflare URL，因为域名在 App 首次启动时输入。

首次启动：

1. 输入 `https://db.dubin.cc.cd`（或未来的新域名）
2. 输入 APP_TOKEN 对应的私人访问口令
3. App 请求 `/api/health` 验证
4. 验证成功后把口令写入 iOS Keychain
5. 30 天内免密，全屏进入远端 Web 工作台

Web 端「设置 → 修改 App 连接」会触发 `workbench://shell-settings`，回到原生连接页，可更换域名或重新登录。

## 数据

- `entries`：完整记录与 AI 回复
- `memories`：长期记忆
- `metrics`：可追踪指标
- `ai_settings`：AI 提供商、API 地址、模型、加密 API key

设置页可导出 JSON；导出中不会包含 API key 明文或密文。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run cf:migrate:local
npm run cf:dev
```
