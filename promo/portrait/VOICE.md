# 中文旁白 V2 制作与试听

[旁白版 MP4](../releases/portrait-v2/zh/air-poker-douyin-voice-v2.mp4) · [纯音频 M4A](../releases/portrait-v2/zh/voice-v2-preview.m4a) · [评审与迭代记录](../../doc/promo/audio-iteration-v2.md)。

本版沿用 30 秒竖屏画面，新增云希 AI 男声旁白、120 BPM 原创配乐、独立音效和自动压低背景的混音。只更新中文版。视频流直接复制，未重复压缩画面。V1 和 V2 以独立目录保存。

## 试听与对比

```sh
npm run promo:preview
```

打开 [新旧版同位置对比](http://127.0.0.1:4180/promo/portrait/audio-compare.html)。两个版本可保留当前进度切换，默认匹配最终积分响度。播放器不自动发声。若使用升级前已经启动的预览服务，请重启服务，使 byte range 支持生效。

## 从头制作

沿用 [主工具环境要求](README.md)：Node.js 22+、FFmpeg；浏览器验收另需 Playwright / Chromium。语音生成还需要 Python 3.10+，本次实测为 3.12.14。依赖仅安装到忽略的制作缓存，不改变游戏运行依赖。

```sh
python -m pip install --target output/promo/voice-v2/python-packages -r promo/voice-requirements.txt
npm run promo:voice:render
npm run promo:voice:verify
npm run promo:voice:check-browser
npm run check
```

首次合成将这九句公开宣传文案发送至 Microsoft Edge 在线语音服务，通过社区 edge-tts 7.3.1 工具生成。需要可访问服务的网络；语音音色和在线服务可用性可能随上游变化。已有 MP3 按文案、音色、语速与音调指纹复用。用 --refresh 明确重新生成；归档的 narration.wav 可用于离线重混，避免依赖未来在线输出。

如果可执行文件不在 PATH，在当前 PowerShell 会话设置：

```powershell
$env:FFMPEG_PATH = 'D:\tools\ffmpeg\bin\ffmpeg.exe'
$env:PYTHON_BIN = 'D:\tools\python\python.exe'
```

TTS_PACKAGES 可设置为已安装 edge-tts 的包目录；默认 output/promo/voice-v2/python-packages。本次运行使用独立缓存安装的 edge-tts 7.3.1；依赖声明见 ../voice-requirements.txt。

```sh
# 单独准备旁白；窗口长度由 voice-timeline.js 定义
npm run promo:voice:prepare

# 已有旁白后重新混音，不再次访问语音服务
npm run promo:voice:render -- --skip-tts

# 更换库存音色时会重新合成，需要重新核对每句时长
npm run promo:voice:prepare -- --voice zh-CN-YunyangNeural --rate "+8%" --pitch "-2Hz"
```

工具只采用服务原有库存音色，不复制特定人物声音。句子过长时会报错；优先修改措辞，不以截断或大幅加速解决。语音服务输出 MP3 解码成 48 kHz，去首尾静音并保留内部停顿，拼入精确时间窗，导出 30 秒旁白 WAV。

## 直接使用已归档旁白离线重混

在项目根目录执行：

```powershell
New-Item -ItemType Directory -Force -Path 'output/promo/voice-v2' | Out-Null
Copy-Item -LiteralPath 'promo/releases/portrait-v2/zh/narration.wav' -Destination 'output/promo/voice-v2/narration.wav'
Copy-Item -LiteralPath 'promo/releases/portrait-v2/zh/narration.json' -Destination 'output/promo/voice-v2/narration.json'
Copy-Item -LiteralPath 'promo/releases/portrait-v2/zh/air-poker-douyin-voice-v2.narration.srt' -Destination 'output/promo/voice-v2/narration.srt'
npm run promo:voice:render -- --skip-tts
npm run promo:voice:verify
```

此路径无需 Python 或在线语音服务，只需 Node.js / FFmpeg。重混会校验缓存旁白与当前口播稿一致，避免换过台词后继续使用旧音频。

## 文件职责与产物

| 代码                               | 职责                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- |
| scripts/promo/voice-timeline.js    | 九句文案、分镜窗口、语速保护                                               |
| scripts/promo/narration.js         | 库存音色合成、缓存指纹、边缘静音裁切、逐句对齐与 SRT                       |
| scripts/promo/wave.js              | 48 kHz PCM 读写、无声检测、溢出和非有限数保护                              |
| scripts/promo/audio-voice-score.js | 120 BPM 音乐 / 音效分轨、和声、纸牌声、气流、心跳、留白                    |
| scripts/promo/voice-remix.js       | 实际口播时间驱动的音乐衰减、音效侧链、人声混音、双遍响度、限幅与视频流复制 |
| scripts/promo/check-voice.js       | 浏览器定位、版本切换、响度匹配、手机布局与播放检查                         |
| promo/portrait/audio-compare.*     | 同位置、同积分响度的新旧版试听                                             |

上述路径相对仓库根目录。制作缓存为 output/promo/voice-v2/：clips/、narration.wav/json/srt、music.wav、fx.wav、music-ducked.wav、voice-mix.wav、mix-report.json、score-events.json。最终视频位于 output/promo/portrait/zh/air-poker-douyin-voice-v2.mp4，校验文件同名 .verified.json。

交付另归档至 promo/releases/portrait-v2/zh/。其中 .srt 是原有画面字幕，.narration.srt 是实际口播稿。成片已经带硬字幕，普通观看不需要加载额外 SRT。

验收读取最终 AAC 的 input_i 与 input_tp，目标 −14 ±1 LUFS、真峰值 ≤−1 dBTP。人声与配乐的分轨 RMS 差也写入报告，但不把它当成主观听感评分。FFmpeg 的全部实际参数数组保存在 .render.json；对比页使用归档实测值做音量匹配。
