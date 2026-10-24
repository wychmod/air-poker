# 实现计划

## 模块

- game/records.js：不依赖平台，保存顺序事件、轮次事实和五个账户（双方未开、底池、已开、烧毁）；生成只读快照与账目审计，校验归档结构及账目连续性。
- game/engine.js：在已校验动作与实际资金变化处写事实，记录器不决定牌局。getRecord() 返回脱敏独立快照，getState() 仅加轻量账目摘要。终局揭示实际已锁定信息；不记录 CPU 未来数字。
- browser/record-store.js：只负责最近一个完整记录的读写与异常降级，使用 records 的校验，不持有对局状态。
- ui/record.js：将记录渲染为现有规则浮层样式，按轮次与时间线查看全部事件及空气转移；所有外来字符串转义。
- app.js：控制只读查看、最新快照、一次性保存与导出。新局不清除旧归档；导出使用显示的冻结快照。

## 数据

记录含 schemaVersion、rulesVersion、matchId、initialAir、accounts、events、ledger、rounds、status、result。事件有递增 id、elapsedMs、round、type、details；ledger 用事件 id 关联 from / to / amount / reason 与前后账户快照。呼吸长时间快进拆为实际开罐时刻，时间步长不影响记录。

轮次含 startedAtMs、airBefore、discardBefore、targets、attempts、actions、settlement、endedAtMs、airAfter、discardAfter。重做保留同一轮并增加尝试，作废和中断使用独立 status。有效成手记录实际实体与牌型；比较记录完整踢脚向量，不用 SCORE 替代。

## 顺序

纯记录与账目 → 引擎写入点 → 回归与隐私边界 → 归档 → 查看和导出 → 完整检查与浏览器验收。新增 records 和 archive 层，保持 game 无平台 API，时钟层不依赖引擎。
