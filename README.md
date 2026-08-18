# DB 私人 AI 工作台 v2.0

一个以 **聊天 + 日历** 为核心的单用户私人 AI 工作台。产品本体运行在 Cloudflare，iOS IPA 只是长期复用的 WebView 安全壳。

## v2.0 信息架构

底部只保留两个一级入口：

- **聊天**：打开应用直接进入。AI 自动判断新媒体、健康、日常、软装、随笔五种主角色，并持续读取长期记忆和近期日程。
- **日历**：月历 + 当日日程。日期下方用不同颜色的小圆点标识日程类型；点击日期展开当天内容。

设置、AI 模型、长期记忆、指标、数据导出全部收进右上角设置，不再占一级导航。

## 日历交互

日程分类：

- 工作：粉色
- 学习：紫色
- 生活：蓝色
- 健康：绿色
- 灵感：橙色
- 其他：灰色

日程卡片支持：

- 左滑：删除
- 右滑：完成；已完成再次右滑可恢复待办
- 删除后 5 秒内可撤销
- 点击卡片：编辑标题、日期、时间、全天、分类、备注
- 点日期右侧 `+`：手动添加日程

聊天与日历打通：AI 可以读取近期日程；当用户明确说“明天下午三点提醒我…… / 加到日历 / 安排……”时，模型可输出结构化日程动作，由 Worker 真正写入 D1。完成或删除日程时，AI 只能引用上下文中真实存在的 event_id，无法唯一判断时会追问，不会猜。

## 五个自动角色

- 新媒体运营
- 健康咨询
- 日常助理
- 软装学习
- 随笔记录

角色在后台自动路由，不需要用户手动选择。

## AI 提供商

设置页支持：

1. Cloudflare Workers AI
2. OpenAI Responses API
3. OpenAI 兼容 API

第三方 API key 不回传到浏览器；Worker 使用 APP_TOKEN 派生 AES-GCM 密钥，加密后写入 D1。

## 数据表

- `entries`：聊天记录
- `memories`：长期记忆
- `metrics`：指标
- `ai_settings`：AI 配置
- `calendar_events`：日程

`calendar_events` 使用软删除，支持撤销删除。

## GitHub Secrets

仓库 `Settings → Secrets and variables → Actions`：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `APP_TOKEN`

Cloudflare API Token 至少需要：

- Account → Workers Scripts → Edit
- Account → D1 → Edit

建议 GitHub Variables 增加：

`APP_PUBLIC_URL=https://db.dubin.cc.cd`

这样部署后的 Smoke Test 会直接验证自定义域名。

## 自动部署

`.github/workflows/deploy-cloudflare.yml` 会自动：

1. 安装依赖
2. TypeScript 检查
3. 构建 React SPA
4. 准备 D1
5. 执行全部 migrations
6. 部署 Worker + Static Assets
7. 验证网页
8. 验证 401 鉴权
9. 验证 AI / D1
10. 实际创建、完成、软删除一条 Smoke Test 日程

## iOS 壳

`.github/workflows/build-ios.yml` 使用 SwiftUI + WKWebView + XcodeGen 编译独立壳，不使用 Capacitor。

首次安装输入：

- 域名，例如 `https://db.dubin.cc.cd`
- APP_TOKEN 对应访问口令

验证成功后：

- 域名保存在 UserDefaults
- 口令保存在 iOS Keychain
- 30 天免密
- Web 业务更新无需重新编译 IPA

只有将来增加 Face ID、推送、相机、系统分享等原生能力时才需要更新壳。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run cf:migrate:local
npm run cf:dev
```
