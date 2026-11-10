# 八页漫画界面运行素材

这些文件按用户本轮指定从本地素材库复制，裁切、灰阶、遮罩与构图在 CSS 中完成；并非本轮 AI 生成的新插画。

- tutorial.png：assets/reference/usogui-air-poker/去文字背景.png
- defeat.png：assets/reference/usogui-air-poker/去文字背景3.png
- victory.png：assets/reference/usogui-air-poker/img_sub.png

原始参考图仅保留在本地，不随仓库分发。

首页与介绍继续使用 air-poker-v1/usogui-page-assets 下的无 UI 背景。按钮、卡牌、数字、墨弧、气泡和资金路径由代码渲染。此次为本地实现和验收，未执行远程发布。

## README 品牌素材

`doc/assets/brand/` 与 `doc/assets/readme/` 只服务于仓库文档，不进入发布产物：

- `brand/logo.svg`、`brand/banner.svg`：为本项目手写的矢量图形，沿用纸白 `#FAF9F6`、墨黑 `#171717` 与网点语言；不含任何原作画面。
- `readme/zh/`、`readme/en/`：由真实页面在 1440×900（2 倍像素密度）下截取后再缩放到 1680px 宽，中文与英文界面各一套，未使用示例数据或整页合成图。
- `readme/demo.gif`：Playwright 录制的真实对局（构建 → 锁牌 → 下注 → 摊牌），经 ffmpeg 抽帧压缩，未剪辑拼接其他素材。
