# 制作资料与事实来源

核对日期：2026-10-25（用户时区 Asia/Shanghai）。

当前会话无 Context7 resolve-library-id / query-docs 可调用工具，因此没有宣称已查询 Context7。技术资料直接查询官方来源，并结合本机可执行文件帮助和真实试渲染核验：

- [FFmpeg image2 demuxer](https://github.com/FFmpeg/FFmpeg/blob/master/doc/demuxers.texi)：framerate 默认 25，因此本项目显式指定 30；同一流的图像尺寸/格式一致。
- [FFmpeg image2 / image2pipe](https://github.com/FFmpeg/FFmpeg/blob/master/doc/muxers.texi)：序列图像与管道形式。
- [FFmpeg loudnorm](https://github.com/FFmpeg/FFmpeg/blob/master/doc/filters.texi)：支持单遍和双遍、I/LRA/TP；线性模式必须提供测量值，条件不满足会回退动态模式；显式 -ar 48000 避免动态过采样改变交付采样率。
- [Playwright Page API](https://playwright.dev/docs/api/class-page)：已实际访问官方 API 页面；浏览器执行、截图、视口和真实按钮操作均通过本机试运行验证。
- 本机 FFmpeg -version / -encoders / -h filter=loudnorm 的实际输出，以及 0.1 秒 NVENC 编码探测。使用本机可用 h264_nvenc；无 libx264 的机器不会伪称软件编码成功。

玩法以 game/cards.js、rules.js、breathing.js、engine.js、ui/pages.js 和可执行回归为依据。宣传中的 24 点例子复用教学的合法实体牌组合，prepare.js 再次调用正式函数校验。真实截图来自本次浏览器操作，capture-manifest.json 记录采集方法。

B 站风格判断为针对推理/策略兴趣受众的创作选择；没有读取用户画像、实时热点或流量数据，没有“平台观众最喜欢”或传播效果保证。分区与投稿参数应以实际投稿时页面为准；本次没有投稿。

## 2026-10-26 旁白与混音补充

- [edge-tts 7.3.1 发布说明与 README](https://pypi.org/project/edge-tts/7.3.1/)：从 PyPI JSON 的 description 核对 --voice、--rate、--pitch、--write-media；实际安装版本与 --help 一致。GitHub 原始 README 获取超时，未声称完成该请求。Context7 工具仍不可用。
- 本机 FFmpeg -h filter=sidechaincompress 核对阈值、ratio、attack、release、makeup；实际混音与最终 AAC 检测已执行。
- 语音源为 Microsoft Edge 在线库存云希音色；服务通过社区工具调用。仅发送九句公开游戏宣传文案，不使用声音克隆。
