# 实施任务

| 任务 | 文件                                                    | 验证                                               |
| ---- | ------------------------------------------------------- | -------------------------------------------------- |
| T1   | game/records.js、tests/records.test.js                  | 逐笔重放、守恒、隐私与快照独立                     |
| T2   | game/engine.js                                          | 普通、灾厄、退款、双失败、超时、死亡与重开记录完整 |
| T3   | browser/record-store.js、tests/record-store.test.js     | 正常、损坏、旧版、不可用、配额失败                 |
| T4   | ui/record.js、app.js、ui/render.js、index.html、i18n.js | 当前 / 最近局、明细、语言及导出真实浏览器          |
| T5   | harness 配置、AGENTS、README、规则与验收                | npm run check、git diff --check，记录未执行项      |

执行顺序 T1 → T2 → T3 → T4 → T5；先实现记录，禁止用七条日志推算丢失事实。

## 完成状态

T1–T5 已完成。自动检查 66 / 66 通过，真实五轮对局、刷新 / 重开保留、英文及实际 JSON 下载通过。详细证据与未执行项见 [验收](checklist.md)。本轮按用户要求分阶段提交，未推送。
