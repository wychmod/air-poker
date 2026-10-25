# Portrait V4：开场来源标注版

2026-10-26，按最新要求，游戏来源从第 0 帧就完整显示，覆盖开场 0–2.5 秒；封面同样带来源标注。

- 中文：游戏改编自迫稔雄《噬谎者》。[视频](zh/air-poker-douyin-30s.mp4) · [成片首帧](zh/first-frame-phone.png)
- 英文：Game based on USOGUI (噬谎者)。[视频](en/air-poker-tiktok-30s.mp4) · [成片首帧](en/first-frame-phone.png)

两版仍为 30 秒、1080×1920、30 fps / 900 帧，使用原来的背景音乐与音效，没有人声旁白。原版与本版的 AAC 音频包 SHA-256 完全相同。来源横幅位于画面上方安全区，中文 46 px、英文 38 px，不使用延迟入场或淡入；片尾原作卷数和改编信息继续保留。

验证包括：浏览器分别检查 0、0.5、2.49 秒来源文字与安全区；抽取最终 MP4 首帧，以 360×640 手机尺寸检视；两版完整解码、900 帧与 30 秒检查；响度 −14.21 LUFS、真峰值 −3.38 dBTP；两版各 9 项播放器与布局检查通过。文件哈希、来源文字和音频一致性记录于 [manifest.json](manifest.json)。

从项目根目录重新制作：

```sh
npm run promo:portrait:render -- --skip-capture
npm run promo:portrait:render -- --lang en --skip-capture
npm run promo:portrait:verify
npm run promo:portrait:verify -- --lang en
```

需先按 [工具说明](../../portrait/README.md)准备依赖与截图。预览入口为 [music.html](../../portrait/music.html)。
