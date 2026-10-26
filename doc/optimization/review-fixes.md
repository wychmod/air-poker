# UI 评审反馈修复（2026-10-26）

范围：修复反馈 #1、#2、#4、#5。#3 的弃牌入口只在对局内出现，当前正常流程不可达，不为它修改游戏状态结构或规则。

## 先复现，再修复

在未修复的构建产物上运行新增浏览器用例，390×844 Chromium 下 7 项中 6 项失败、1 项通过。失败分别对应刷新后的语言选择、缺少 randomUUID、缺少 crypto、教学选中态、分享换图等待期和分享更新失败。存储被拒绝时的当次语言切换原本正常。

- #1：打开 en.html，点“中”，当次变中文；刷新后按钮重新选中 EN。renderer 本来会同步 html.lang，但刷新仍重载静态英文入口，因此必须调整初始化优先级。
- #2：移除浏览器 randomUUID 或整个 crypto 能力后，点击开始仍停留首页，脚本报告 TypeError。修复后实际完成五轮、归档校验并重新开始，原完成局保留。
- #4：点击示例确实填入五张牌，但按钮没有 aria-pressed 或 is-selected；“三条”是牌型，不是只填三张牌。
- #5：暂缓真实 PNG 编码回调，稳定观察到旧预览 src 被清除、hidden 变为 true；不依赖人眼捕捉几十毫秒的空白。

原始失败日志在 output/harness/review-fixes-before.log；失败报告、截图和 trace 保留在 output/harness/review-fixes-before/。

## 实现

1. app.js：合法已存语言优先；没有偏好、值无效或存储被拒绝时使用当前 HTML 的默认语言，不强制跳转 URL。
2. app.js：crypto.randomUUID 可用时优先使用，否则用时间和随机后缀生成本地记录 ID。该标识不作为认证凭据；项目仍通过 HTTP 加载 ES modules，不新增 file:// 支持。
3. ui/tutorial.js：从 draft.candidateIndex 渲染示例选中样式和 aria-pressed；移除无人消费的 selected 字段。筛选和语言切换保留选中，手动改牌或清空后取消选中。
4. browser/share.js：保留旧预览，SVG 编码及新 PNG 解码完成后再替换；生成期间禁用导出，避免把旧语言图误存为新语言。失败时保留旧预览并明确说明，链接继续可用。generation 隔离乱序完成和关闭后的旧任务；新旧对象 URL 在替换、失败或关闭时分别释放。

## 验证

- 新增用例：e2e/review-fixes.spec.js，7 类场景 × 3 个视口/路径，共 21 项通过。修复后日志：output/harness/review-fixes-after.log。
- 语言覆盖中文/英文入口、双向切换后刷新、无效偏好和拒绝存储；首次访问仍按入口默认语言显示。
- 分享覆盖 PNG 待完成时保留旧图、乱序完成、最新语言下载、关闭期间异步完成、重新打开和编码失败。
- 完整工程检查通过：134 项回归、语法、架构、格式、构建、资源预算、48 个资源的根路径/子路径 HTTP 检查；日志 output/harness/review-fixes-check.log。
- 完整浏览器回归通过：原有 36 项加新增 21 项，共 57 项，无失败、跳过或重试成功项；日志 output/harness/review-fixes-browser-full.log，报告 output/e2e/report/。
- 额外验证非 localhost HTTP 来源：浏览器实际判定 isSecureContext=false、randomUUID=undefined；旧 app.js 点击开局停在首页并报 TypeError，修复后正常进入构牌且无脚本错误。测试域名的直接请求被本机代理返回 502，因此将该来源的静态请求映射到本地服务；没有把这项结果表述为另一台实体设备的局域网实测。证据 output/harness/review-fixes-insecure-http.json。
- 已目视检查教学示例选中边框，截图 output/playwright/review-fixes/tutorial-selected.png；等待换图时的旧预览截图保存在对应 e2e 用例输出目录。

设备边界：手机视口使用 Chromium 模拟；未把这些结果当作 Safari、实体手机或系统分享面板的实测。
