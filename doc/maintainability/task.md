# 维护性改造任务

1. 建立 cards/rules 回归测试并迁移纯规则，覆盖目标和、实体唯一性、A 边界、有效牌与资金结算。验证：node --test tests/cards.test.js tests/rules.test.js。
2. 实现私有状态引擎和动作检查，覆盖重复调用、无效参数、资源边界与完整回合。验证：node --test tests/engine.test.js。
3. 迁移文案与界面，移除 inline onclick 与 window 全局函数；入口集中管理事件和计时器。验证：真实浏览器走完主要流程与语言切换。
4. 拆分并格式化 CSS/HTML/JS，去掉重复字体加载和追加式覆盖。验证：Prettier 检查，桌面与移动视口检查。
5. 更新 Pages 工作流、启动说明与格式化脚本。验证：npm test、npm run format:check，以及模拟部署目录后 HTTP 加载。
