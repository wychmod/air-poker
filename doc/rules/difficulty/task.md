# 三档难度与融合对手策略 Tasks

状态：用户已于 2026-11-05 批准并完成实施。依据为 [Spec](spec.md) 与 [Plan](plan.md)；自动检查已完成，真人验收状态见 [Checklist](checklist.md)。

历史方案说明：本任务拆解初稿曾按独立挑战入口、展开/收起契约选项和默认无契约规划。后续需求取代了这组界面与验收步骤；保留其余有效任务记录，当前实现和验收采用新手→`none`、中等→`comeback`、困难→`perfect` 的固定映射。`no-fold` 仅兼容旧记录，旧 `air-poker-contract` 偏好不影响新局。

## 文件清单

| 操作      | 文件                                                                                                                                                                                        | 职责                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 新建      | `game/difficulty.js`                                                                                                                                                                        | 难度 ID、默认值、兼容归一化与冻结策略预算  |
| 新建      | `game/ai-observation.js`                                                                                                                                                                    | 公开下注观察与平滑行为统计                 |
| 修改      | `game/ai-planning.js`                                                                                                                                                                       | 三档构牌候选与固定预算的困难深化           |
| 修改      | `game/ai-betting.js`                                                                                                                                                                        | 三档下注尺寸、收益约束与公开行为适应       |
| 修改      | `game/opponents.js`、`game/engine.js`、`game/ai.js`                                                                                                                                         | 对手装配、接受动作观察、策略兼容接口       |
| 修改      | `app.js`、`ui/modes.js`、`ui/pages.js`、`ui/battle.js`                                                                                                                                      | 偏好迁移、设定入口和当前模式显示           |
| 修改      | `ui/record.js`、`ui/review.js`、`ui/share.js`                                                                                                                                               | 归档、复盘、导出与分享保持本局模式         |
| 修改      | `styles/narrative.css`、`styles/battle.css`                                                                                                                                                 | 三档说明、内置目标和窄屏模式标签           |
| 修改      | `scripts/harness/config.js`                                                                                                                                                                 | 登记层级、依赖和格式目标（若规则检查需要） |
| 修改      | `scripts/strategy/simulate.js`、`scripts/evaluate-strategy.js`                                                                                                                              | 难度基准比较、种子与报告                   |
| 新建/修改 | `tests/difficulty.test.js`、`tests/ai-observation.test.js`、`tests/opponents.test.js`、`tests/ai-strategy.test.js`、`tests/engine.test.js`、`tests/modes-ui.test.js`、`tests/share.test.js` | 纯函数、引擎、兼容和模式回归               |
| 新建/修改 | `e2e/difficulty.spec.js`                                                                                                                                                                    | 首页、三档、契约和归档/分享浏览器流程      |
| 修改      | `README.md`、`doc/README.md`、`doc/harness/architecture.md`、`doc/harness/acceptance.md`、`doc/rules/strategy/results.md`                                                                   | 同步用户说明、边界、覆盖和基准证据         |

## 有序任务包

下面的 T1–T12 是便于分工的任务包；每个编号步骤是按 2–5 分钟目标拆分的工作单元，依次完成并执行本包对应检查。若某步仍超过该粒度，再按「先增加一条行为断言、再完成最小实现」拆小，沿用父任务的文件、接口与需求范围，不合并成一次大改。

### T1：定义难度配置与兼容归一化

**文件：** `game/difficulty.js`、`tests/difficulty.test.js`、`scripts/harness/config.js`

**依赖：** 无。

**步骤：**

1. 定义 `beginner`、`medium`、`hard` 与默认 `medium`，导出 ID 检查和冻结配置。
2. 将 `analyst`、`abyss`、`mirror`、未知值和空值归一化到新局 `medium`；保留历史显示责任给 UI。
3. 写纯函数测试，覆盖合法 ID、旧 ID、大小写错误及不可变配置。
4. 登记新层及确切依赖，不扩大平台豁免。

**验证：** `node --test tests/difficulty.test.js` 与 `npm run check:architecture` 通过；新模块不导入其他运行模块。

### T2：实现公开行动观察和统计

**文件：** `game/ai-observation.js`、`tests/ai-observation.test.js`、`scripts/harness/config.js`

**依赖：** T1 可并行；本模块自身不依赖 difficulty。

**步骤：**

1. 仅从显式传入的行动前标识、合法选项、已接受下注事件与超时标志构造白名单观察对象。
2. 对主动加压、面对跟额后的继续/弃牌、无跟额时过牌分别计算机会分母及先验平滑比例。
3. 排除对手行动、超时和不具备相应合法选项的动作；以 `action` 与 `toCallBefore` 分类，不用 `event.called` 代替真实行动。
4. 覆盖空样本、少量样本、不同机会分母、异常输入不被读取、输入不变等测试。

**验证：** `node --test tests/ai-observation.test.js` 与 `npm run check:architecture` 通过；观察对象不含 state、手牌或目标数组引用。

### T3：扩展三档构牌预算

**文件：** `game/ai-planning.js`、`tests/ai-strategy.test.js`、`scripts/harness/config.js`

**依赖：** T1。

**步骤：**

1. 为现有规划器增加可选 policy；未传时保留当前候选数、utility、随机调用顺序和返回结构。
2. 实现新手当前牌力选择与近优变化，仍只从有效候选中选择。
3. 实现困难最多四根分支、最多三后继代表、最多 256 次缓存未命中的深化预算。
4. 缓存按目标、排序实体 ID 和上限区分；所有根候选先有基础分，同深度深化完整时才应用深化结果，否则统一回退根基础分。
5. 测试难度差异、实体身份、后续可解性、预算耗尽回退为有效根候选及旧路径逐种子等价。

**验证：** `node --test tests/ai-strategy.test.js` 通过；使用测试侧诊断计数证明单次决策不超过 256 次缓存未命中，不为计数在生产对手输入中引入回调或平台 API。旧路径同时比较固定种子的输出和随机源调用次数。

### T4：实现三档下注与收益门槛

**文件：** `game/ai-betting.js`、`tests/ai-strategy.test.js`、`scripts/harness/config.js`

**依赖：** T1、T2。

**步骤：**

1. 为当前纯下注策略增加可选 policy 和可选观察数组；未传 policy 时保持旧语义、模型候选数和随机顺序。
2. 实现新手仅小幅合法尺寸、中等沿用现有候选尺寸、困难增加有限尺寸并在最终适应模型上执行非负收益门槛。
3. 困难从平滑公开统计调整模型权重及接近收益时的尺寸/风险，不虚构弃牌收益；中等仅用当前轮压力，新手不读跨轮观察。
4. 覆盖强弱牌、高成本、灾厄、低储备、下注上限、无手牌回退、超时排除和隐藏字段不影响结果。

**验证：** `node --test tests/ai-strategy.test.js tests/ai-observation.test.js` 通过；每档在下注状态机选项矩阵上的输出均被 `applyBetAction` 接受或按合同返回 `null`。

### T5：绑定难度并在引擎收集已接受动作

**文件：** `game/opponents.js`、`game/engine.js`、`game/ai.js`、`tests/opponents.test.js`、`tests/engine.test.js`

**依赖：** T1–T4。

**步骤：**

1. `createOpponent` 将三个新 ID 绑定相应构牌/下注预算；旧 ID 保持旧策略映射供兼容调用，不列入首页。
2. 保持引擎调用自定义 `choosePlay` 的四参数与 `chooseBet(input, random)` 的接口兼容，通过工厂闭包传预算。
3. `resolveBet` 在 `applyBetAction` 成功前捕获动作标识和旧选项，拒绝动作直接返回；成功后记录白名单观察，再走原记录器与结算。
4. 最多保留 64 个观察；按 session 与旧 turn 去重。`reset()` 清空；CPU 得到副本；超时由计时路径明确标注。
5. 对每个难度跑完整引擎动作、固定随机流、旧注入接口、拒绝/重复 turn、观察上限和重开清空回归；由测试 spy opponent 在下一次 `chooseBet` 接口捕获副本，不给正式界面新增调试数据。

**验证：** `node --test tests/opponents.test.js tests/engine.test.js tests/records.test.js` 通过；隐藏对手私有数字、证明成手和玩家未公开选牌不可从观察输入访问。

### T6：添加新旧模式文案转换

**文件：** `ui/modes.js`、`tests/modes-ui.test.js`、`tests/modes.test.js`

**依赖：** T1。

**步骤：**

1. 增加三档中英文名称与说明，并保留精密、深渊、镜像旧文案。
2. 让模式摘要兼容旧 `{ opponent, contract }` 字段形状并增加 `kind`；旧归档依据原 ID 显示人格，新局依据 difficulty ID 显示难度。
3. 覆盖中英、新旧 ID、缺失 mode、未知 ID及契约计算仍基于完成事实。

**验证：** `node --test tests/modes.test.js tests/modes-ui.test.js` 通过；历史人格文本不被新难度文案替换。

### T7：首页对局设定和偏好迁移

**文件：** `app.js`、`ui/pages.js`、`styles/narrative.css`、`tests/modes-ui.test.js`

**依赖：** T1、T5、T6；静态首页排版可以在 T5 完成前准备，创建真实对局的验证等待 T5。

**步骤：**

1. 将首页三个人格按钮替换为三个难度选项，默认中等；使用 `choose-difficulty`、`aria-pressed` 和委托事件。
2. 写入 `air-poker-difficulty`；新键优先，旧 `air-poker-opponent` 缺失或旧 ID 映射为中等，存储不可用时本次页面选择仍可用。旧 `air-poker-contract` 不读取、不写入。
3. 固定映射新手→`none`（标准对局）、中等→`comeback`（逆风翻盘）、困难→`perfect`（全胜压制）；不提供独立契约选择或挑战展开状态。`no-fold` 只保留给旧记录。
4. 启动局时将难度固定写入现有 mode 字段并创建对应策略，重开仍使用当前难度与契约。
5. 测试模式快照与委托事件、中英文说明、缺失/非法/旧难度偏好，以及旧契约偏好不会改变固定映射。

**验证：** `node --test tests/modes-ui.test.js` 通过；开始后查看页面与 `getRecord()` 能读到同一难度/契约，切语言不改变选择。

### T8：贯通开场、牌桌、结果、档案与战报

**文件：** `app.js`、`ui/battle.js`、`ui/pages.js`、`ui/record.js`、`ui/review.js`、`ui/share.js`、`tests/battle-ui.test.js`、`tests/review-ui.test.js`、`tests/share.test.js`

**依赖：** T6、T7。

**步骤：**

1. 开场和牌桌使用当前局锁定难度，不读取首页后续选择；展示对手标签和难度。
2. 结果、最近完成记录与只读复盘按被查看记录的 mode 决定标题和难度/旧人格，不受当前首页设置影响。
3. JSON 保持 mode 字段原值；`app.js` 构造分享元数据时一并传递模式类别，让 `ui/share.js` 将新档位标为「难度 / DIFFICULTY」，旧人格仍标为「对手 / OPPONENT」，保留原 opponent/contract 元数据形状。
4. 覆盖进行中、胜负平、损坏或缺失旧 mode；新难度、旧人格、无 mode 三类记录逐一做中英文模板断言。首页换新档位后查看旧归档，显示与导出仍保持旧人格/契约。

**验证：** `node --test tests/battle-ui.test.js tests/review-ui.test.js tests/modes-ui.test.js tests/share.test.js` 通过；旧记录导出 JSON 不被改写。

### T9：完成难度相关视觉布局

**文件：** `styles/narrative.css`、`styles/battle.css`、`e2e/difficulty.spec.js`

**依赖：** T7、T8。

**步骤：**

1. 在现有纸白与墨色系统中呈现三档选中态及各档目标。
2. 控制首页纵向高度；英文档位说明和已完成记录入口在窄屏可读、可换行。
3. 确保牌桌、结果、复盘和分享中的新难度标签不遮挡关键操作、倒计时、牌面或账目。
4. 增加真实操作回归：三档选择与刷新、旧偏好迁移、中英文切换、固定目标映射、各难度开始和完成局、旧归档查看及分享导出；通过下载 JSON 核对实际模式，不暴露生产调试入口。

**验证：** `npm run check:syntax` 与 `npm run check:browser` 通过；Playwright 覆盖的 320、390 与 1280 CSS 视口无横向溢出，关键按钮在视口内。

### T10：扩展整局策略评估

**文件：** `scripts/strategy/simulate.js`、`scripts/evaluate-strategy.js`、`tests/strategy-simulation.test.js`、`doc/rules/strategy/results.md`

**依赖：** T5。

**步骤：**

1. 在既有真实引擎模拟器中通过 `createGame({ opponent: createOpponent(difficulty) })` 加入三档对手，不改变发牌生成和独立的 playerPolicy。`evaluate-strategy` 新增 `--mode difficulty`，现有 baseline/full 参数和组合保持兼容。
2. 每个种子执行原持牌与交换持牌，隔离发牌和策略随机流，输出以对手视角统计的胜平负、AIR 收益、无解、灾厄与决策计数。
3. 开发集合使用 1–100；调整后冻结，独立集合使用 10001–10100，对 `legacy` 与冻结的 `current` 玩家各测三档和换边，共 1,200 局。
4. 报告 Node/浏览器条件、每种策略时间、样本区间、源码哈希与机器人基准限制；哈希列表增加 difficulty/opponents/ai-observation。若档位排序证据不足则继续用新的未用种子和回归修订，不将加注频率称为难度。

**验证：** `npm run evaluate:strategy -- --mode difficulty --seeds 100 --start-seed 1` 与 `npm run evaluate:strategy -- --mode difficulty --seeds 100 --start-seed 10001` 生成可复现报告；每个模拟动作结束均为 50 AIR 守恒，完成局通过记录校验。

### T11：同步架构、用户说明与验收入口

**文件：** `scripts/harness/config.js`、`doc/harness/architecture.md`、`doc/harness/acceptance.md`、`doc/README.md`、`README.md`、`doc/rules/strategy/results.md`、本目录 `spec.md` / `plan.md` / `task.md` / `checklist.md`

**依赖：** T1–T10。

**步骤：**

1. 同步模块依赖、三档选择、公开信息边界与兼容规则；历史策略报告明确历史人格与基准用途。
2. 将失败、人工真人挑战感、真机性能和桌面/手机浏览器矩阵的未执行项分别标出，自动检查结果不冒充人工验证。
3. 更新目录索引和 README 首页设定/开局介绍，使用当前功能事实，不描述尚未验证的排名结论。

**验证：** `npm run format:check`、`npm run check:architecture` 通过；文档中的命令与实际 package scripts 一致，所有验收需求都能追溯到测试或浏览器场景。

### T12：全量回归与真人试玩验收

**文件：** 上述实现文件、`e2e/difficulty.spec.js`、`doc/harness/acceptance.md`、`doc/rules/difficulty/checklist.md`

**依赖：** T1–T11。

**步骤：**

1. 运行完整 `npm run check` 与 `npm run check:browser`，修复回归后分别读取机器报告。
2. 桌面与窄屏操作三档、切语言、核对固定目标、开始、比赛、查看结果/复盘/分享；检查历史档案人格保持。
3. 测试时钟、后台恢复、关闭动效和重开不改变真实引擎时限与样本边界。
4. 记录实际人工浏览器、视口、真机、系统减少动态与真人挑战反馈；未执行项保持未勾选，不以机器人报告替代。

**验证：** 工程检查无失败；e2e 三项目无失败；资金与记录性质由自动断言验证；人工检查按获批 checklist 逐项记录结果。

## 执行顺序

```text
T1 + T2 → T4
T1      → T3
T1–T4   → T5 → T10
T1      → T6
T5 + T6 → T7 → T8 → T9
T1–T10  → T11 → T12
```

上述顺序记录了原任务的实施依赖；T1–T12 已完成，清单记录了自动、浏览器和仍待真人/真机补充的证据。早期独立挑战入口、契约展开与默认无契约步骤已由固定映射方案取代，不是当前待办。
