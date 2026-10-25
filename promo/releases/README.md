# 宣传片成片归档

本目录按用户要求纳入 Git 版本管理，保存可直接播放的正式交付文件。制作中间文件仍位于忽略目录 output/promo/，不进入游戏静态发布包。

## Portrait V2 · 2026-10-26

- [中文旁白升级版](portrait-v2/zh/air-poker-douyin-voice-v2.mp4) · [纯音频试听](portrait-v2/zh/voice-v2-preview.m4a)：30 秒，云希 AI 男声，独立音乐/音效和自动压低背景；视频画面与中文 V1 相同。
- [实际口播字幕](portrait-v2/zh/air-poker-douyin-voice-v2.narration.srt) · [配音源 WAV](portrait-v2/zh/narration.wav) · [混音与电平报告](portrait-v2/zh/mix-report.json) · [文件清单](portrait-v2/manifest.json)。
- [新旧试听页](../portrait/audio-compare.html) · [制作与离线重混说明](../portrait/VOICE.md) · [迭代评审记录](../../doc/promo/audio-iteration-v2.md)。英文版保留 V1。

## Portrait V1 · 2026-10-25

- [中文抖音版](portrait-v1/zh/air-poker-douyin-30s.mp4)：30 秒、1080×1920、30 fps，约 16.8 MiB。
- [英文 TikTok 版](portrait-v1/en/air-poker-tiktok-30s.mp4)：独立英文文案与真实英文游戏截图，同规格，约 16.9 MiB。
- 中文：[封面](portrait-v1/zh/cover.png) · [SRT](portrait-v1/zh/air-poker-douyin-30s.srt) · [分镜总览](portrait-v1/zh/storyboard-contact.png)。
- 英文：[封面](portrait-v1/en/cover.png) · [SRT](portrait-v1/en/air-poker-tiktok-30s.srt) · [分镜总览](portrait-v1/en/storyboard-contact.png)。
- [SHA-256 与源文件清单](portrait-v1/manifest.json) · [制作说明](../portrait/README.md) · [完整分镜方案](../../doc/promo/portrait-production.md) · [验收记录](../../doc/promo/portrait-validation.md)。

双版均为原创程序音乐、音效与硬字幕版本，无人声旁白。各自目录保留实际 FFmpeg 参数、媒体检查及真实截图采集信息。竖屏后续版本使用 portrait-v2 等独立目录。

## V1 · 2026-10-25

- [宣传视频](v1/air-poker-bilibili-72s.mp4)：《这局扑克，赌的是呼吸》，72 秒、1920×1080、30 fps，H.264 / AAC，约 37.1 MiB。
- [封面](v1/cover.png) · [中文字幕](v1/air-poker-bilibili-72s.srt)。成片已带硬字幕，播放器无需重复叠加 SRT。
- [文件清单与 SHA-256](v1/manifest.json) · [媒体验证结果](v1/verification.json)。归档复制已与制作输出逐一核对哈希。
- 当前版本为原创程序配乐与字幕版，没有人声旁白。沿用项目现有漫画资产，片尾保留迫稔雄《噬谎者》第 40–43 卷「空气扑克」篇的来源信息。

[制作说明](../README.md)包含依赖、预览、导出和验收命令；[完整方案](../../doc/promo/production.md)包含分析、脚本、分镜与投稿文案。

后续交付版本使用 v2、v3 等新目录；日常试渲染继续写入 output/promo/。本仓库使用普通 Git 管理该 MP4，并通过 .gitattributes 将其声明为二进制，不引入 Git LFS 配置。
