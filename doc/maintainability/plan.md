# 维护性改造设计

## 模块

- app.js：浏览器入口、事件委托、语言存储、页面切换、倒计时与过场生命周期。
- game/cards.js：实体牌、固定目标集、候选构造，确保点数和与唯一性。
- game/rules.js：不含 DOM、语言与计时器的纯牌型比较、用过牌过滤和资金结算。
- game/engine.js：createGame() 提供 getState() 快照、dispatch(action) 与 reset()；私有状态仅通过合法动作修改。
- ui/render.js：createRenderer() 接收游戏快照与视图状态，按需生成模板并更新 DOM；通过 data-action 触发入口事件。
- i18n.js：文案与 translate()/pageCopy()，牌型仅保存 key，在渲染时翻译。
- styles/base.css、pages.css、game.css：按职责整理，styles.css 统一导入；明确页面显示和背景覆盖。
- tests/：Node 内置测试运行器；package.json 只增加 Prettier 开发依赖，不增加运行依赖或构建步骤。

## 关键行为

- UI 通过 dispatch 发送动作，成功后刷新快照；游戏代码不访问 document/window/localStorage。
- 底注与加注按双方可匹配空气封顶，简化玩法不引入边池。扣呼吸成本后若空气归零，直接进入总结。
- 弃牌可选但失效；仅有效牌参与牌型、重叠和本轮弃牌。灾厄仅对非平局败者扣减额外下注，空气下限为零。
- 每次阶段改变统一停止/启动倒计时；重开清理过场与倒计时。
- ES modules 通过 HTTP 运行；GitHub Pages 原样发布。
