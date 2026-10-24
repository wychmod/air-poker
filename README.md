# AIR POKER

纯原生 JavaScript 单人空气扑克原型，可直接部署到静态托管服务。

## 本地运行

使用 Node.js 22 或更新版本：

```sh
npm ci
npm start
```

打开 <http://127.0.0.1:4173>。浏览器通过 HTTP 加载 ES modules；直接双击 HTML 文件不适用。
可用 `AIR_POKER_PORT` 环境变量更改端口。页面本身没有第三方运行依赖，也没有构建步骤。

## 检查与格式化

```sh
npm test
npm run check
npm run format:check
npm run format
```

测试使用 Node 内置测试运行器，覆盖牌型、候选、结算、阶段限制和完整对局的资源不变量。
Prettier 仅用于开发时格式化源码。

`npm run check` 顺序运行语法、架构、回归测试、格式、静态产物与 HTTP 资源检查，失败即停止。
最近一次结果保存在忽略目录 `output/harness/latest.json`。单独检查产物时先执行 `npm run build`，再执行 `npm run check:smoke`。
HTTP 检查不运行页面脚本；交互改动仍需浏览器验收。

协作约束见 [AGENTS.md](AGENTS.md)，文档入口见 [doc/README.md](doc/README.md)，完整工程说明见 [Harness](doc/harness/README.md)。

## 代码组织

| 路径                    | 职责                                             |
| ----------------------- | ------------------------------------------------ |
| `app.js`                | 浏览器入口、事件委托、页面切换、倒计时与语言存储 |
| `game/data.js`          | 固定花色与点数定义                               |
| `game/cards.js`         | 实体牌和合法候选生成                             |
| `game/deal.js`          | 独立数字牌生成与来源证明                         |
| `game/ai.js`            | 独立选牌及仅凭己方私牌与公开信息下注             |
| `game/betting.js`       | 合法下注、应跟额、半池上限和纯状态转换           |
| `browser/turn-clock.js` | 按行动编号计时、CPU 调度、后台恢复               |
| `game/rules.js`         | 牌型比较、有效牌过滤、结算计算                   |
| `game/engine.js`        | 私有对局状态和动作合法性                         |
| `ui/render.js`          | 从游戏快照与视图状态生成界面                     |
| `i18n.js`               | 中英文文案；渲染时按 key 翻译                    |
| `styles/`               | 基础、页面、牌桌样式；`styles.css` 统一导入      |
| `tests/`                | 无浏览器依赖的规则和引擎回归测试                 |

`createGame()` 返回 `getState()`、`dispatch(action)` 和 `reset()`。`getState()` 返回独立快照，隐藏 CPU 未公开数字与摊牌前私牌；
调用者通过动作更新对局，错误阶段、参数或重复提交返回 `false`，不修改状态。
游戏模块不访问 DOM、浏览器存储、翻译或计时器。

## 当前玩法范围

双方开局各持五张独立数字牌，整局逐张消耗；CPU 在玩家选择前凭自身数字和公共弃牌预先锁定。实体牌基于同一共享剩余牌库，每个目标显示至多三个合法完整五张推荐成手，已用牌不可复用。

下注采用双方交替行动，支持应跟压力、连续两次过牌结束、跟注后继续、半池加注上限和双方弃牌；首轮小数字先动，之后逐轮交替。CPU 使用启发式下注策略，每次玩家行动有新的 30 秒，超时按压力过牌或弃牌。下注按双方可匹配资源封顶，不设边池；每次进入下一轮双方各扣 1 AIR，底注为回合数。最多五轮，AIR 耗尽或一方无合法目标时提前结算，按剩余 AIR 比较胜负。

完整可玩行为见 [当前数字版规则](doc/rules/current.md)，原作资料、早期文档偏差与未实现项见 [联网规则核对](doc/rules/audit.md)。上层失败判例、真实呼吸和原作最终耐息机制尚未实现，不能称为完整复刻。下注本轮记录见 [验收](doc/rules/betting/checklist.md)。历史模块拆分记录见 doc/maintainability/。

## 部署

`npm run build` 按白名单将 HTML、JS 模块、CSS 和生成图片复制到 `dist/site/`，没有代码编译步骤。
Pull request 与 main 推送运行完整 harness 检查；GitHub Pages 发布前使用同一检查命令，再上传 `dist/site/`。
开发依赖、本地服务器、测试、工程文档和待评审设计预览不进入部署产物。
