# 实施设计

1. 使用锁定版本的 Playwright Test 作为开发依赖，在 e2e/ 编写实际 DOM 操作与断言。单元测试继续 node --test，显式限定 tests/，避免互相发现。专用静态测试服务只提供 dist/site，支持 / 和 /air-poker/，失败保留报告。
2. ui/share.js 将经过 records 校验的完成局映射到有限的分享模型并生成 SVG 战报。browser/share.js 只负责 SVG 转 PNG、预览、下载、Clipboard 和 Web Share；app 负责快照、事件及语言。增加精确的 share-ui 层，不扩大 game 权限。
3. 使用纸白黑墨、少量暗红、醒目结果与双线空气图。静态 1200×630 中英封面和 favicon 进入 assets/share；战报为 1080×1440 PNG。官方试玩地址来自现有 README： https://wychmod.github.io/air-poker/ 。分享不上传记录。
4. 运行图转换成 assets/runtime 中的 WebP，发布白名单只包含运行资源；更新资源检查与本地服务。保留 assets/generated 原图用于编辑及视频。
5. 手机编辑器改为紧凑的顶部/底部操作区、提前出现的推荐与完整手选牌库。页面时钟只更新同一时限的显示。
6. app 延迟创建正式游戏，首页、介绍、教学渲染支持无对局快照；第一次开始创建，后续重开 reset，保持 session/turn 标识规则。
7. 独立教学复用纯草稿/实体牌校验，练习状态与正式引擎隔离。

文档依据：Playwright 官方 CI、webServer、Clock 与 MDN Web Share；Context7 本轮不可用，原文存 output/harness/optimization-docs/。
