# 多轮下注实现计划

## 方案与选择

采用独立纯下注转换模块 + 引擎动作 + 浏览器行动时钟。直接把所有规则与时钟继续塞进入口会难以验证；只修改按钮而保留自动匹配则无法满足应跟压力。选择按职责拆分，沿用现有 ES modules 与资源发布方式。

## 模块和接口

- game/betting.js：getBetOptions(state, actor)、applyBetAction(state, actor, action, amount)。纯计算合法动作、资源、连续过牌、下一行动方和结束结果，返回新状态，不修改输入。
- game/engine.js：betting={first, turn, turnId, checks, history}，firstBettor 记录本轮首动。dispatch 接收玩家 bet、cpu-bet、bet-timeout，均必须携带当前 turnId。序号跨重开继续递增，屏蔽陈旧动作。公开 legalBets 由快照派生。
- game/ai.js：新增 chooseCpuBet，仅接收自己的成手与公开数据，不能传入整个对局状态；以公开目标的最强可组成牌型作参考，结合跟注压力作启发式决策，不宣称精确胜率。
- browser/turn-clock.js：createTurnClock，注入时钟/调度器供测试；sync(snapshot)、suspend()、clear()。按 turnId 保存绝对截止时间，玩家 30 秒、CPU 600ms；onTick/onPlayerTimeout/onCpuTurn 由入口处理。
- app.js：引擎动作后同步行动时钟；事件携带按钮 turnId；超时根据引擎动作处理；pagehide 挂起调度，pageshow 使用原截止时间恢复。
- ui/render.js 与 i18n.js：显示投入、应跟和范围，区分思考/本人行动；旧按钮无法重复生效，折叠方正确显示；沿用样式。

## 下注公式与结算

应跟额 c=max(对方已投−己方已投,0)。双方可匹配总投入上限 M=min(己方已投+己方剩余,对方已投+对方剩余)。当前较高投入 H=max(双方已投)。最大加注增量=min(floor((底池+c)/2),M−H)，最小增量固定 1。

加注付款=c+增量；跟注付款=c。可匹配全押付款=M−己方已投，只有其额外加注不超过上述上限时可用。跟注清除连续过牌数，换人继续；连续两次过牌才结束。双方投入已相等且一方剩余为零则直接结束。弃牌允许投入不相等，胜者收回整个实际底池，不追加灾厄。

引擎保留 folded 布尔，并新增 foldedBy 区分玩家/CPU。普通结算和灾厄继续使用 settleBets，摊牌后实际完成轮数只增加一次。

## 依赖与发布

betting 层无运行模块依赖；AI 接收纯下注规则计算的 options；engine 依赖 betting；browser 层负责调度，不进入 game；app 依赖 browser。新增目录同步加入发布、语法、架构检查与本地服务白名单，补检查器反例。

## 验证设计

纯规则复现 1→2→4 加注、双过牌、跟注继续、双方弃牌、资源封顶；引擎验证交替首动、独立私牌、旧序号、CPU 响应和整局账目；假时钟验证语言等同序号同步、跨后台截止与旧回调；真实浏览器走下注和结果闭环。
