# YUY 小玉 v5.0 — 参考图像素重构版

本版本以用户确认的 YUY UI 参考图为唯一视觉基准，对真实应用进行重构，不是静态效果图。

## 重构原则
- 聊天页顶部直接使用参考图裁切的 YUY 小玉主视觉，保证角色、花朵、排版、色彩与参考图一致。
- 日历页顶部直接使用参考图裁切的“日程 + 小狗 + 新建按钮”视觉。
- 底部导航直接使用参考图裁切的聊天态 / 日历态导航条，透明热区承载真实交互。
- 小玉用户头像和小狗 AI 头像直接来自参考图裁切素材。
- 动态聊天消息、动态月历、日程数据仍由 React / D1 驱动，样式按参考图重建。
- 日历继续支持：彩色日期点、左滑删除、右滑完成、删除撤销、新建/编辑。
- AI、长期记忆、模型/API 设置、导出数据、30 天免密等原功能全部保留。

## 关键参考素材
- public/yuy-chat-header-exact.png
- public/yuy-calendar-header-exact.png
- public/yuy-nav-chat-exact.png
- public/yuy-nav-calendar-exact.png
- public/yuy-user-avatar-exact.png
- public/yuy-dog-avatar-exact.png
- public/yuy-app-icon-exact.png

## 说明
固定视觉元素直接使用参考图 PNG，因此这些区域可以做到与确认图高度一致。
动态内容（聊天文字、日期、真实日程）不能使用整张静态截图，否则功能会失效，因此采用相同尺寸比例、字体、圆角、颜色和间距进行动态重构。
