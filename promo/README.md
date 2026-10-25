# 空气扑克宣传片制作工具

72 秒中文音乐预告片，1920×1080 / 30 fps，HTML Canvas 逐帧绘制、FFmpeg 合成。完整分析、分镜、字幕、音乐与投稿包装见 [制作方案](../doc/promo/production.md)。本工具独立于正式游戏，不进入发布包。

新增 [30 秒抖音 / TikTok 竖屏工具](portrait/README.md)：中英两版、9:16 构图、手机实机卡区、平台遮挡预览。横屏与竖屏使用同一导出器，通过 --format portrait 选择竖屏；默认仍为本页 72 秒横屏。

## 环境准备

- Node.js 22+，与游戏开发工具一致。
- FFmpeg：包含 image2pipe、H.264（libx264 或 h264_nvenc）、AAC、scale、loudnorm 滤镜。无 libx264 时默认尝试 NVIDIA 编码器；没有 NVIDIA 硬件的机器应使用带 libx264 的 FFmpeg。
- Chromium 和 Playwright 仅用于离线制作。依赖位于本目录，不增加游戏运行时依赖。
- 本机中文字体：优先宋体、微软雅黑，回退 Noto Serif/Sans CJK SC。字体未打包；不同系统字形可能不同，应重做分镜检查。

在项目根目录运行：

```sh
npm ci
npm --prefix promo ci
node promo/node_modules/playwright/cli.js install chromium
ffmpeg -version
```

若 FFmpeg 不在 PATH，在当前 PowerShell 会话指定其可执行文件（无需改全局设置）：

```powershell
$env:FFMPEG_PATH = 'D:\tools\ffmpeg\bin\ffmpeg.exe'
```

也可将 PLAYWRIGHT_MODULE 设为已安装的 playwright 包绝对目录。本次环境使用 Codex 随附 Playwright 1.62.1 / Chromium 151 和本机剪映随附 FFmpeg 的 h264_nvenc；默认独立安装锁定 Playwright 1.58.2，最终浏览器版本会写入清单。锁定安装版本的运行尚未在本次环境另装验证。

## 预览与导出

```sh
# 校验规则示例、生成音轨、实际操作游戏并截取素材
npm run promo:prepare

# 交互预览；打开 http://127.0.0.1:4180/promo/
npm run promo:preview

# 完整导出（默认重新采集实机截图）
npm run promo:render

# 已准备素材后，快速重新导出
npm run promo:render -- --skip-capture

# 9 秒灾厄区间，适合调色与混音检查；字幕自动归零
npm run promo:render -- --skip-capture --start 35 --end 44 --width 1280 --fps 30 --name calamity-preview

# 只改混音时，复用同名无声母版与现有清单（不更新画面）
npm run promo:render -- --audio-only

# 验证完整成片
npm run promo:verify
npm run promo:check-browser
npm run check
```

播放器支持空格播放/暂停、方向键前后 5 秒、镜头定位、拖动、音频开关与全屏。默认暂停，隐藏页面也暂停。桌面无须真实录屏，导出直接按 n / fps 求出画面，所以机器慢只影响渲染耗时，不影响成片节奏。

## 可选配音与配乐

默认成片使用原创程序音乐与音效，**没有人声旁白**。可选口播稿在制作方案分镜表中。准备从 0 秒对齐、最长 72 秒的配音 WAV 后：

```sh
npm run promo:render -- --skip-capture --voice "D:/audio/voice.wav" --name air-poker-voice
npm run promo:render -- --skip-capture --music "D:/audio/licensed-score.wav" --name air-poker-custom-score
npm run promo:verify -- --name air-poker-voice
```

voice 与 music 可以同时提供。配音模式将背景音乐降至 0.38 倍后混合；这是固定衰减，不是智能逐句压低。缺失的音频尾部补静音，超过 72 秒截断。全片归一化目标 −14 LUFS（交付容差 ±1 LU）、真峰值 −1.5 dBTP，最终 AAC 允许不高于 −1 dBTP 的编码余量。区间导出先裁剪再做两遍测量。替换配乐不会自动重配拍点，修改音乐节奏时也应调整 timeline / audio 中的事件。

## 输出

制作产物默认写入忽略目录 output/promo/。正式交付的 V1 视频、封面、字幕与校验信息另存于 [releases/v1/](releases/README.md)，按用户要求纳入 Git 管理；中间母版、音轨、截图和日志仍作为本地制作缓存。

| 文件                                | 内容                                               |
| ----------------------------------- | -------------------------------------------------- |
| air-poker-bilibili-72s.mp4          | 最终有声 MP4，H.264 / AAC / 48 kHz / 30 fps        |
| air-poker-bilibili-72s.silent.mp4   | 无声中间母版                                       |
| air-poker-bilibili-72s.srt          | 独立中文字幕；成片已有硬字幕，避免播放器再叠加一份 |
| cover.png                           | 1920×1080 封面                                     |
| storyboard-contact.png、storyboard/ | 12 镜接触表与单镜 PNG                              |
| score.wav                           | 48 kHz 双声道原创程序音轨                          |
| facts.json                          | 经正式规则函数验证的示例                           |
| captures/、capture-manifest.json    | 本次真实游戏截图及浏览器信息                       |
| asset-sources.json                  | 素材路径、来源和 SHA-256                           |
| *.render.json                       | 尺寸、时长、帧数、浏览器、编码器、全部 FFmpeg 参数 |
| *.verified.json、browser-check.json | 解码、响度与预览检查结果                           |

命令会覆盖同名制作产物；用 --name 保存多个剪辑版本。区间导出只裁时间，不重新设计横竖构图。全片使用 2160 帧；区间时长必须是整帧倍数。width 必须形成偶数尺寸的 16:9 画幅。

## 文件职责

- timeline.js：镜头边界、字幕与 SRT 输出。
- film.js：画面、卡牌、文字、水纹、转场；renderAt(seconds) 为确定性渲染入口。
- preview.js、index.html、style.css：预览播放器。
- ../scripts/promo/prepare.js：真实规则示例和素材来源。
- ../scripts/promo/capture.js：通过真实应用按钮走局、截取构牌/摊牌/复盘。
- ../scripts/promo/audio.js：固定种子声效与乐曲，声画共用绝对时间。
- ../scripts/promo/render.js：逐帧管道、编码、两遍响度、合成与导出。
- ../scripts/promo/verify.js、check-browser.js：媒体和浏览器验收。

预览页通过 globalThis.promo 暴露制作接口；它不被正式 index.html 导入，不属于游戏入口。无第三方远程字体、配乐下载或上传。已有漫画素材的署名保留在片尾和文档中。

## FFmpeg 命令等价关系

渲染器按平台参数数组启动进程，不拼接 shell 命令，路径含空格亦可。以下仅展示软件编码的核心形式，实际命令在 *.render.json：

```sh
ffmpeg -f image2pipe -framerate 30 -vcodec mjpeg -i pipe:0 -an -vf "scale=1920:1080:in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p" -c:v libx264 -preset medium -crf 18 -g 60 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -movflags +faststart silent.mp4
ffmpeg -i score.wav -af "loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json" -f null -
```

第二遍之后增加 10 kHz 低通及 192 kHz 过采样限幅，显式关闭自动补偿增益并补偿 5 ms 前视延迟，压住 AAC 对瞬态噪声产生的额外峰值；最终恢复 48 kHz。预览播放制作源 WAV，最终交付以归一化和限幅后的 MP4 音轨为准。

第二遍将第一遍 JSON 中 measured_I / measured_LRA / measured_TP / measured_thresh / offset 带回 loudnorm，视频流 copy、音频编码 AAC，再封装 MP4。不要用单遍命令替代项目实际执行的双遍实现。

官方技术依据与查询限制见 [资料来源](../doc/promo/sources.md)。
