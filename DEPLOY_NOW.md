# 现在怎么更新

## 1. 覆盖 GitHub 仓库

把本版本 ZIP 解压后，完整覆盖仓库根目录并提交到 `main`。

## 2. 等 Deploy Cloudflare 全绿

`Actions → Deploy Cloudflare`

如果你已经绑定自定义域名 `https://db.dubin.cc.cd`，Cloudflare 会继续保留该路由。

## 3. 网页里配置 AI

打开：

`https://db.dubin.cc.cd`

进入：

`设置 → AI 模型`

选择提供商，填写模型/API 地址/API key，先「测试连接」，成功后「保存」。

## 4. iOS 壳只编译一次

`Actions → Build iOS Shell IPA → Run workflow`

下载 Artifact：

`PrivateAIWorkbench-Shell-unsigned-ipa`

自签安装后，首次启动输入：

- 工作台地址：`https://db.dubin.cc.cd`
- 访问口令：GitHub Secret `APP_TOKEN` 对应的值

验证成功后 30 天免密。以后网页功能更新只需要 GitHub push → Cloudflare 自动部署，不需要重新编译或重装 IPA。
