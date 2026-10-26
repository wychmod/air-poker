# 浏览器回归与分享功能

## 使用与验收

```sh
npm ci
npx playwright install chromium
npm run check
npm run check:browser
```

Linux CI 使用 `npx playwright install --with-deps chromium`。浏览器开发依赖固定为 Playwright Test 1.62.1，三个项目分别是 390×844 手机根路径、320×844 手机项目子路径、1280×800 桌面子路径。所有测试打开实际构建产物；`check:browser` 自动先构建，专用服务固定使用 127.0.0.1:4185，拒绝复用未知服务。

现有单元与 harness 检查继续由 `npm run check` 执行。浏览器回归是独立命令，CI 与 Pages 在发布前都执行这两个门槛。浏览器报告位于 `output/e2e/report/`，机器结果为 `output/e2e/results.json`，失败时保留截图与 trace。工作流上传报告 14 天。

测试覆盖真实点击/手机触控、自由构牌、推荐、换牌、合法加注及导出账目核对、语言切换保留草稿与截止时间、五轮和耐息终局、复盘及刷新归档、教学纠错、双语分享、图片下载和不支持分享/剪贴板时的降级。可重复随机源只用于测试发牌，不暴露或替换浏览器中的正式引擎。胜负平分享夹具通过真实引擎生成并校验；进行中成手不进入分享模型。

## 分享入口

- 终局页点击「分享战报」，或从首页「最近完成局」打开记录，再点击「分享战报」。未完成/损坏记录不能生成战报。
- 弹窗提供中英文预览、1080×1440 PNG 下载、试玩链接复制；具备 Web Share 的设备还提供由用户点击触发的系统分享。生成图片先于点击，避免移动端用户激活权限过期。
- 不支持文件分享时改分享文字及链接；没有系统分享时保留 PNG 下载。剪贴板失败会选中链接供手动复制。取消系统分享不会丢失图片。
- 分享模型只保留结果、轮数、账目趋势、烧毁和时长等公开完成局事实，不包含牌面、未公开数字、动作历史或本地记录 ID。每轮趋势从逐笔账目重建；图表明确区分轮末储备与终局储备。
- 中文元信息在 index.html；构建从相同入口生成静态英文 en.html，抓取器无需执行 JS 即可读取摘要、canonical、Open Graph 和大图卡片。实际平台是否展示卡片取决于平台规则，未将本地校验描述为已发布或已被平台抓取。
- 分享图沿用白纸黑墨，保留迫稔雄《噬谎者》第 40–43 卷「空气扑克」篇来源。官方试玩地址沿用项目 README 中的 GitHub Pages 地址。

## 素材与性能

`assets/generated/` 保留原始 PNG，供编辑和宣传视频继续使用；`assets/runtime/` 是发布用 WebP；`assets/share/` 保存分享封面和图标。构建按明确文件清单发布，不复制历史整页效果图或视频。

可重建素材：

```sh
# 可选源素材工具，要求 Python 3 + Pillow；普通构建不需要 Python。
python scripts/prepare-runtime-assets.py
# 使用已安装的 Chromium 和本机中英文字体生成两张 1200×630 封面。
npm run assets:share
```

封面 PNG 和 WebP 已随源码管理，CI 不依赖生成字体或 Python。透明胜利图保留 alpha。首屏通过带 media 的 preload 提前请求手机或桌面背景；手机图片约 69 KB，桌面约 180 KB。发布总量预算 4 MB、运行插画预算 2 MB、首屏单图预算 300 KB，`npm run check` 会检查。

手机编辑器固定显示目标/点数和、时限和锁定按钮，完整牌库仍可逐张选择。推荐前移并横向切换，不改变候选算法。首页、介绍、教学仅使用空闲视图快照，点击开始才建立第一局；之后 reset 保持动作序号跨局递增。练习使用正式手牌草稿/校验/绘制函数，但独立于正式时钟与账户。

## 实施与依据

需求、设计、任务和逐项验收分别见 [spec](spec.md)、[plan](plan.md)、[task](task.md)、[checklist](checklist.md)。具体验证记录见 [results](results.md)。

本轮 Context7 不可用，使用 Playwright 官方 [CI](https://playwright.dev/docs/ci-intro)、[webServer](https://playwright.dev/docs/test-webserver)、[Clock](https://playwright.dev/docs/clock) 与 [MDN Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share) 文档，并以锁定版本运行实测。
