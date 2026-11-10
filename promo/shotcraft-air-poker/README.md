# 空气扑克宣传片

独立 Remotion 工程，使用 video-shotcraft 自主自由创作流程。成片为中文、1920×1080、30 fps、30 秒，共六个镜头；白纸黑墨、宋体和少量暗红延续产品视觉。

## 交付

- `out/air-poker-promo.mp4`：原创氛围配乐版。
- `out/air-poker-promo-clean.mp4`：无配乐版，本片没有 SFX，因此该版无音轨。
- 两版视频来自同一条时间线；无配乐版以视频流复制封装，900 帧完全一致。
- 交付副本和海报位于仓库的 `output/shotcraft-promo/`，自动验证见 `out/verification/report.json`，工作台导入对照见 `out/parity/report.json`。

画面使用真实按钮操作后的本地演示截图，素材已冻结并记录哈希。采集脚本固定随机种子，但实时对局计时仍会影响重新采集的结果，不能承诺每次重新采集都得到同一局。18→12 AIR 单独标明“规则示例 · 非本局记录”，由现有游戏规则函数验证。

配乐由 `scripts/audio.mjs` 原创合成，无外部采样；Freesound 搜索限流，本片未采用外部音效。音频已做输出响度、峰值与解码验证，主观试听未验证。漫画来源与非官方改编说明保留在成片中。

## 复现

需要 Node.js 22+、FFmpeg/ffprobe；验证接触表需要 Python/Pillow。项目可复用仓库 Playwright 的 Chromium，也可设置当前进程的 `REMOTION_BROWSER_EXECUTABLE`。不需要修改游戏运行依赖。

```powershell
npm ci
npx tsc --noEmit
npm run render
npm run verify
```

`render` 先渲染900帧，再裁齐AAC到30秒并生成静音版；视频流不重新编码。已有带声成片时，`npm run render:clean` 可单独生成静音版。`src/props-clean.json` 保留供直接 Remotion 无BGM预览使用。

只在需要更新真实游戏素材时执行 `npm run capture`（先在4180端口启动游戏）。不要为了重新输出视频而重新采集素材。

## 动效工作台

本机工作台地址：<http://localhost:5198/?import=project>。工程按镜头、字幕、音乐分轨；可改片名、各镜头标题、CTA、字幕、位置与速度，再点“导出成片”。镜头内部的相机动作随其镜头整体保留。工作台预览额外留1秒余量，精确导出仍为30秒。

导入同一工程后，可运行 `node scripts/parity.mjs` 检查工作台与原片的13个代表帧；默认工作台路径可由 `SHOTCRAFT_WORKBENCH` 覆盖。像素容差为每通道2，不同像素比例必须低于0.1%。

此机器的工作台 Remotion 配置已补上从链接工程寻找现有 Playwright Chromium 的逻辑，避免导出时重复下载浏览器；原配置备份在 `out/workbench-remotion-config.original.ts`。该配置属于本地技能工作台，不进入游戏发布产物。

独立审片已完成，无必须修复项；报告位于 `../../output/shotcraft-promo/independent-review.md`。

## 制作与验证资料

- [制作说明](design-spec.md)：产品目标、视觉方向、六镜头分镜及最终参数。
- [来源清单](source-manifest.json)：镜头卡、准确 demo 和 Gallery 参考样片。
- [截图记录](public/captures/capture-manifest.json)、[规则示例](public/captures/rule-facts.json)、[音频记录](public/audio/audio-manifest.json)。
- Context7 当前未开放；库用法依据固定版本 Remotion 4.0.484 的本地源码/types 与技能范例，未声称在线文档查询。

本工程与渲染文件不进入静态游戏发布包。游戏玩法和运行UI未改；仓库 harness 只精确排除了视频工程的依赖、缓存、输出目录，并有回归测试证明其余源码仍被扫描。
