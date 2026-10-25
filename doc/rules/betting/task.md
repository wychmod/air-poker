# 多轮下注任务

## 文件清单与顺序

| 任务 | 文件                                                                                        | 操作与验证                                                       |
| ---- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| T1   | game/betting.js、tests/betting.test.js                                                      | 新增纯下注转换；先验证原作示例、资金和合法动作                   |
| T2   | game/engine.js、game/ai.js、tests/engine.test.js、tests/deal-ai.test.js                     | 接入交替回合、对手响应、序号与双向弃牌；验证私牌隔离和整局       |
| T3   | browser/turn-clock.js、tests/turn-clock.test.js                                             | 新增可注入时钟；验证新行动、超时、后台、旧回调                   |
| T4   | app.js、ui/render.js、i18n.js                                                               | 接入时钟与动作序号，更新投入、范围和禁用状态；浏览器验证         |
| T5   | scripts/harness/config.js、scripts/serve.js、tests/harness.test.js                          | 新目录加入明确依赖与发布范围，反向依赖仍失败；运行架构与资源检查 |
| T6   | README.md、AGENTS.md、doc/README.md、doc/harness/、doc/rules/current.md、doc/rules/audit.md | 更新实现事实，保留上一项历史证据；完整 check 与浏览器验收        |

按 T1→T2→T3→T4→T5→T6 执行。规则来源和边界以 spec.md 为准；完成状态与证据写到 checklist.md。上一项独立持牌修改已存在于工作区，本次继续修改关联文件，不覆盖待评审页面提案。
