# 任务与验证

- T1：package.json/lock、e2e/、scripts/浏览器测试服务、CI。先建立能复现现状的真实操作测试，运行浏览器命令。
- T2：ui/share.js、browser/share.js、app.js、index.html、样式、assets/share。完成合法记录模型、SVG/PNG、预览与用户主动分享，补模型与浏览器测试。
- T3：assets/runtime、发布配置、服务与资源检查。更新引用和首图加载策略，测量发布体积并验证根/子路径。
- T4：构牌布局、首次初始化、教学。分别验证可见操作区、无首页求解、草稿与时钟、教学完整流程。
- T5：验收脚本、工程文档与双语 README。运行 npm run check 和浏览器回归，检查实际下载战报及中英封面，完成故障注入验证测试门槛，记录未测真实设备边界。

依赖：T1 → T2；T3/T4 完成后统一 T5。仅编辑本任务范围，保留 .workbuddy/。
