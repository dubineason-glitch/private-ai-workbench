# YUY 小玉主题 v4.0 — 海报复刻版

本版本直接以用户确认的 YUY 小玉 UI 海报为视觉基准，实际修改 React 应用代码，而不是生成静态效果图。

## 视觉复刻策略
- 从确认海报中裁切角色、头像、欢迎横幅、日历伙伴和底部导航图标，作为 PNG 资源直接进入应用。
- 背景采用奶油纸张质感、粉色描边、花朵/粉彩配色。
- 聊天页顶部始终显示“小玉 + 伙伴 + 今天也要元气满满哦”的海报横幅。
- AI 回复头像直接使用海报中的小玉角色头像。
- 日历页保留彩色日程点、日程卡片、左滑删除、右滑完成、撤销删除。
- 底部导航完整复刻为：聊天 / 日程 / 发现 / 助手 / 我的，并使用从海报裁切的图片图标。
- 发现连接长期记忆，助手连接五角色快速入口，我的连接设置。
- 原 AI、D1、长期记忆、模型/API 设置逻辑全部保留。

## 关键图片资源
public/yuy-app-icon.png
public/yuy-hero.png
public/yuy-chat-banner.png
public/yuy-calendar-dog.png
public/yuy-footer-strip.png
public/yuy-nav-chat.png
public/yuy-nav-calendar.png
public/yuy-nav-discover.png
public/yuy-nav-assistant.png
public/yuy-nav-me.png

## 部署
覆盖仓库后提交到 main，Deploy Cloudflare Workflow 会自动部署。
Web/PWA 更新不需要重新编译 IPA；只有想同步 iPhone 桌面 App 图标时才需要重新打一次壳。
