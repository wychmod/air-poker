# Portrait V3：无声字幕版

2026-10-26 的无声试版，现仅保留历史归档。用户已澄清为“保留背景音乐，不要人声”；[当前交付](../README.md)使用中英文 Portrait V1 配乐字幕版。

- [中文抖音版](zh/air-poker-douyin-30s-silent.mp4)
- [英文 TikTok 版](en/air-poker-tiktok-30s-silent.mp4)
- [无声预览页](../../portrait/silent.html)

两版均为 30 秒、1080×1920、30 fps、900 帧，保留硬字幕。直接复制 H.264 视频流，移除全部音轨，没有重新压缩画面。FFmpeg 完整解码通过，输入输出视频包 SHA-256 一致，输出没有任何 Audio 流。尺寸、帧数、哈希和实际命令记录于 [manifest.json](manifest.json)。

在仓库根目录可重新执行（FFmpeg 需在 PATH，或替换为可执行文件绝对路径）：

```sh
ffmpeg -y -i promo/releases/portrait-v2/zh/air-poker-douyin-voice-v2.mp4 -map 0:v:0 -c:v copy -an -movflags +faststart promo/releases/portrait-v3-silent/zh/air-poker-douyin-30s-silent.mp4
ffmpeg -y -i promo/releases/portrait-v1/en/air-poker-tiktok-30s.mp4 -map 0:v:0 -c:v copy -an -movflags +faststart promo/releases/portrait-v3-silent/en/air-poker-tiktok-30s-silent.mp4
```

启动 npm run promo:preview 后打开 /promo/portrait/silent.html。源动画与历史音频工具仍可复现旧版本，当前交付以成片归档首页的配乐字幕版为准。
