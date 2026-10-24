# 实施任务

| 顺序 | 文件                                                  | 验证                                           |
| ---- | ----------------------------------------------------- | ---------------------------------------------- |
| T1   | game/breathing.js、tests/breathing.test.js            | 气罐打开即不能下注、300 秒边界、缺氧与分步等价 |
| T2   | game/cards.js、game/ai.js、game/engine.js、tests/     | 完整成手校验、失败结算、重做、耐息与账目       |
| T3   | browser/match-clock.js、browser/turn-clock.js、tests/ | 跨阶段编号、绝对时间、后台及旧回调             |
| T4   | app.js、ui/render.js、i18n.js                         | 真实浏览器验证新入口、时钟、快进及结果         |
| T5   | scripts/harness/config.js、README、AGENTS、doc/       | 新层与发布、规则说明、完整 check 和证据        |

按顺序实施，需求变化同步本目录文件，不扩展 UI 风格和原作人物残气模拟。

T1–T5 已完成。实际命令、浏览器证据和未执行边界见 [验收记录](checklist.md)；新逻辑保留工作区，不混入前面已推送的三次提交。
