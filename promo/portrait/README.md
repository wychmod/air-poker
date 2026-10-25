# 空气扑克：30 秒竖屏制作工具

**当前交付：中英文两版均保留原来的背景音乐与音效，不含人声旁白。** 使用已验证的 Portrait V1 成片：[中文视频](../releases/portrait-v1/zh/air-poker-douyin-30s.mp4) · [英文视频](../releases/portrait-v1/en/air-poker-tiktok-30s.mp4) · [配乐版预览](music.html)。

中文抖音版与英文 TikTok 版各 30 秒，1080×1920、9:16、30 fps。独立构图、独立本地化字幕与实机截图，带原创程序音乐和音效，无人声旁白。完整项目分析、双语分镜、节奏、口播稿与投稿文案见 [制作方案](../../doc/promo/portrait-production.md)，执行证据见 [验收记录](../../doc/promo/portrait-validation.md)。

历史试版 [中文旁白 V2](VOICE.md)与[同位置试听对比](audio-compare.html)：九句 AI 男声口播、分轨音乐和自动压低背景；本页默认命令生成当前需要的无旁白配乐版。

## 直接运行

在项目根目录执行，Node.js 22+、FFmpeg 及中文字体要求沿用 [环境说明](../README.md)。不需要给游戏添加生产依赖。

```sh
npm ci
npm --prefix promo ci
node promo/node_modules/playwright/cli.js install chromium
ffmpeg -version

# 完整制作：自动验证规则示例、采集手机素材、合成音轨并逐帧导出
npm run promo:portrait:render
npm run promo:portrait:render -- --lang en

# 验证两个成片，再检查预览播放器及安全区
npm run promo:portrait:verify
npm run promo:portrait:verify -- --lang en
npm run promo:portrait:check-browser
npm run check
```

FFmpeg 不在 PATH 时，在当前 PowerShell 会话设置路径：

```powershell
$env:FFMPEG_PATH = 'D:\tools\ffmpeg\bin\ffmpeg.exe'
```

默认优先 libx264；本机只有可用的 h264_nvenc，因此实际使用 NVIDIA 硬件编码。可指定 --encoder libx264 或 --encoder h264_nvenc；硬件不可用会在逐帧渲染前报错。独立锁定依赖为 Playwright 1.58.2，本次使用已安装的 1.62.1 / Chromium 151；后者通过 PLAYWRIGHT_MODULE 环境变量指定绝对包路径。跨系统字体、浏览器与重新截图的时间可能改变像素，需重做视觉验收。

## 交互预览与调试

```sh
# 仅准备素材，两个语言各执行一次
npm run promo:portrait:prepare
npm run promo:portrait:prepare -- --lang en
npm run promo:preview
```

打开 [中文版](http://127.0.0.1:4180/promo/portrait/?lang=zh) 或 [英文版](http://127.0.0.1:4180/promo/portrait/?lang=en)。支持播放、声音、拖动、空格、方向键、逐镜定位、全屏、字幕稿和平台 UI 遮挡模拟。默认暂停，减少动态效果时提供说明；隐藏页面停止预览。遮挡图层只用于预览，不进入 Canvas 导出。

```sh
# 重用截图，重画完整影片
npm run promo:portrait:render -- --skip-capture
npm run promo:portrait:render -- --lang en --skip-capture

# 导出 6 秒灾厄段，自动将字幕时间归零；360×640 便于手机尺寸检视
npm run promo:portrait:render -- --skip-capture --start 9.5 --end 15.5 --width 360 --name calamity-phone
npm run promo:portrait:verify -- --name calamity-phone

# 仅重新混音：同名 silent.mp4 与 render.json 必须存在且画幅/语言/时间段一致
npm run promo:portrait:render -- --audio-only

# 可选从 0 秒对齐的录制旁白；默认背景音固定衰减至 0.38 倍
npm run promo:portrait:render -- --skip-capture --voice "D:/audio/voice.wav" --name douyin-voice
npm run promo:portrait:verify -- --name douyin-voice
```

外部音乐用 --music 路径传入，可与 --voice 同时使用。音频不足 30 秒补静音，超出截断；替换音乐后需重新核对拍点。预览播放源 WAV；最终 MP4 已经响度归一化、限幅及 AAC 编码，音色/音量以最终文件为准。

## 输出与代码职责

中文默认 output/promo/portrait/zh/air-poker-douyin-30s.mp4，英文默认 output/promo/portrait/en/air-poker-tiktok-30s.mp4。该目录是忽略的制作缓存。同目录还生成 cover.png、SRT、8 镜 PNG 与 storyboard-contact.png、原始 score.wav、silent.mp4、实际 FFmpeg 命令清单 render.json、解码和响度报告 verified.json。最终交付另外复制至 [portrait-v1 归档](../releases/README.md)，不覆盖横屏 V1。

| 文件                                              | 负责内容                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| timeline.js                                       | 8 镜边界、30 秒、双语字幕、SRT 裁切、安全区                                              |
| film.js                                           | 绝对时间驱动的动态标题、五张牌、重叠连线、空气计数、圆环、转场、人物裁切、封面           |
| index.html / style.css / preview.js               | 竖屏播放器、键盘与拖动、文字稿、语言入口、平台遮挡模拟                                   |
| ../../scripts/promo/capture-portrait.js           | 正式游戏 390×844 / DPR 2 实际点击构牌、下注、摊牌，中英分别截图                          |
| ../../scripts/promo/audio-portrait.js             | 140 BPM 原创合成音乐与纸牌、气流、心跳音效；共享镜头时间                                 |
| ../../scripts/promo/compositions.js               | 选择横竖版、语言、尺寸、输出目录与范围校验                                               |
| ../../scripts/promo/render.js                     | Chromium 逐帧 JPEG → FFmpeg 管道，H.264 / Rec.709 编码，双遍响度、限幅、混音、AAC 与 MP4 |
| ../../scripts/promo/verify.js / check-portrait.js | 完整解码、900 帧、尺寸/帧率/时长、AAC 响度峰值，以及交互和安全区检查                     |

画面通过 renderAt(n / fps) 定位。源素材、字体与浏览器相同的情况下，倒序拖动也会重现相同像素。配乐与视觉以同一 0 秒为起点；逐帧导出速度不改变影片速度。规则示意来自正式纯函数，实机镜头为截图卡区放大，未改写截图里的数字，也未读取隐藏对手成手。

核心 FFmpeg 视频步骤相当于：

```sh
ffmpeg -f image2pipe -framerate 30 -vcodec mjpeg -i pipe:0 -an -vf "scale=1080:1920:flags=lanczos:in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p" -c:v libx264 -preset medium -crf 18 -g 60 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -movflags +faststart silent.mp4
```

随后先测 loudnorm，再把 measured_I、measured_TP、measured_LRA、measured_thresh 和 offset 回填。10 kHz 低通、192 kHz 过采样限幅并补偿前视延迟，恢复 48 kHz，竖屏母带补偿 0.8 dB，AAC 320k / 双声道；视频流复制并封装 faststart MP4。交付目标 −14 ±1 LUFS、编码后真峰值 ≤−1 dBTP。每条实际参数数组都在 render.json，避免复制简化命令时遗漏响度和同步步骤。

主信息预留在 x=72…882、y=180…1536，右侧和底部留给平台 UI。这是制作假设，平台 UI 会随设备和页面变化；最终投稿前仍需检查平台预览。工具不执行上传。
