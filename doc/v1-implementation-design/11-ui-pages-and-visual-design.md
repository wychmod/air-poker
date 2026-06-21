# 11. UI 页面与视觉实现设计

## 目标

在规则、状态机和交互实现稳定后，再实现页面布局和具体样式。本文件只依赖前面功能完成后的状态数据，不反向影响 domain 规则。

## 依赖

- `10-ui-interaction-design.md`

## 页面结构

V1 使用单页游戏界面，根据 `GameState.phase` 切换主要区域。

主要页面：

- StartScreen：起始页。
- GameScreen：牌局页。
- ResultScreen：结算页。
- RulesPanel：规则说明面板。
- SettingsPanel：设置面板。

GameScreen 中分区：

- 顶部状态栏：回合、双方 Air、seed 摘要、阶段提示。
- 左侧下层区：数字牌、目标值、AI 公开目标值。
- 右侧上层区：候选成手、暂定成手、推荐按钮。
- 底部 Bet 控制区：合法动作、金额输入、倒计时。
- 结算/摊牌浮层或阶段面板：双方成手、牌型、灾厄、Air 变化。

## 页面级契约

### `StartScreen`

输入数据：

- 最近一局摘要。
- 当前设置。

主要元素：

- 游戏标题。
- `开始新局` 主按钮。
- 规则入口。
- 设置入口。
- 最近一局摘要入口。

验收：

- 页面首屏不展示营销式说明卡片。
- `开始新局` 是最明显操作。
- 无最近一局时不展示空白摘要区域。

### `GameScreen`

输入数据：

- `GameState` 派生展示模型。

主要元素：

- 顶部状态栏。
- 阶段主区域。
- 底部操作区。
- 只读侧栏或弹窗。

验收：

- 任意阶段都能看到双方 Air、回合数和当前阶段。
- 当前可执行主操作在视觉上优先。
- 禁用操作必须能看到原因。

### `ResultScreen`

输入数据：

- 结果摘要。
- 回合历史。

主要元素：

- 胜负结果。
- 结束原因。
- 最终 Air。
- 回合摘要列表。
- 再来一局按钮。

验收：

- 玩家能看出为什么结束。
- 灾厄记录和 Bet 记录能从摘要进入详情。

## 设计 Token

V1 使用 CSS 变量，不引入组件库（不用 MUI / Chakra / Ant Design 等）。

钉死的 token：

```css
:root {
  /* 颜色 */
  --color-bg: #...;                   /* 页面背景 */
  --color-surface: #...;              /* 面板背景 */
  --color-text: #...;                 /* 主文本 */
  --color-muted: #...;                /* 次级文本 */
  --color-danger: #...;               /* 灾厄、fold、Air 危险 */
  --color-warning: #...;              /* 不可解、风险提示 */
  --color-success: #...;              /* 胜利或合法确认 */
  --color-card-red: #...;             /* 红色花色 */
  --color-card-black: #...;           /* 黑色花色 */
  --color-disabled-bg: #...;          /* 禁用按钮背景 */
  --color-disabled-text: #...;        /* 禁用按钮文本 */

  /* 间距 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* 圆角 */
  --radius-card: 6px;                 /* 卡牌圆角 */
  --radius-panel: 6px;                /* 面板圆角（V1 钉死） */
  --radius-button: 4px;               /* 按钮圆角 */

  /* 字号（V1 钉死关键值） */
  --font-number-card: clamp(24px, 4vw, 48px);
  --font-card-rank: 14px;
  --font-button: 14px;
  --font-body: 16px;
  --font-title: 20px;
  --font-phase-title: 18px;

  /* 倒计时颜色（30s -> 0s） */
  --color-timer-safe: #...;           /* 30-10s 绿 */
  --color-timer-warn: #...;           /* 10-5s 黄 */
  --color-timer-danger: #...;         /* 5-0s 红 */

  /* 动效时长 */
  --duration-fast: 100ms;
  --duration-base: 200ms;
  --duration-slow: 500ms;
  --easing-default: cubic-bezier(0.2, 0.0, 0.0, 1.0);

  /* 断点 */
  --breakpoint-mobile: 768px;
}
```

**禁用状态颜色**（V1 钉死）：按钮 `disabled` 用 `var(--color-disabled-bg)` 背景 + `var(--color-disabled-text)` 文本 + `opacity: 0.5`；hover 不变色（`pointer-events: none` 或 `:hover` 覆盖）。

约束：

- 不使用大面积单一紫蓝渐变。
- 不使用装饰性渐变光球。
- 工具型面板不做嵌套卡片（避免"卡片套卡片"的视觉混乱）。

## 视觉优先级

优先保证信息密度和可读性，不做复杂动画。V1 的视觉重点：

- Air 是生命值和筹码，必须始终可见。
- 当前阶段必须清楚。
- 可点击和不可点击状态必须明显。
- 用过牌失效状态必须明显。
- 灾厄触发必须有强提示。

## 数字牌样式

数字牌应区别于普通扑克牌：

- 独立竖牌。
- 中心显示大数字。
- 不显示花色。
- 已使用数字牌置灰或移入已公开区。
- 不可解数字牌禁用，并显示原因。

桌面建议（V1 钉死区间，使用 `clamp`）：

- 宽度：`clamp(72px, 8vw, 88px)`。
- 高度：`clamp(104px, 12vw, 128px)`。
- 数字字号：`clamp(32px, 4vw, 48px)`（约占牌高 32%-40%）。

移动建议（V1 钉死区间）：

- 宽度：`clamp(56px, 14vw, 64px)`。
- 高度：`clamp(80px, 18vw, 96px)`。
- 数字字号：`clamp(24px, 6vw, 32px)`。

断点：`@media (max-width: 768px)` 切换为移动尺寸。桌面和移动都用 CSS 变量驱动，便于未来调整。

## 扑克牌样式

实体牌显示：

- 花色和 rank。
- 用过牌显示灰色、斜线或失效标记。
- 有效牌正常显示。
- 灾厄重叠牌使用警戒色描边。

不要只靠颜色表达状态；失效牌和重叠牌需要有图标、线条或文字辅助。

## Bet 控制样式

- `check / call / raise / fold / all-in` 使用按钮（V1 钉死 5 个按钮固定排列）。
- `bet / raise` 金额使用**步进器 + 数字输入框联动**（V1 钉死）：
  - 步进器 `-` `+` 按钮步进 1 Air；长按 500ms 后加速到步进 5。
  - 数字输入框：受控，可直接输入整数，回车提交。
  - 输入框 + 步进器右侧展示 `minAmount - maxAmount` 提示。
  - 移动端只展示步进器（输入框折叠为点击数字弹起小键盘），节省空间。
- `fold` 和 `all-in` 使用模态二次确认（V1 钉死用原生 `<dialog>` element + 自定义 close 逻辑；不引入 UI 库）。
- **当前非法动作不隐藏，优先禁用并给 tooltip 或短提示**——`title` 属性（鼠标 hover）+ 按钮下方小字（移动端长按显示），原因文本来自 `legalActions[i].disabledReason`。
- 倒计时：30s 圆形进度环 + 数字秒数。
  - 位置：紧贴 Bet 动作区上方居中。
  - 颜色：30-10s `--color-timer-safe` 绿，10-5s `--color-timer-warn` 黄，5-0s `--color-timer-danger` 红。
  - 倒计时 < 5s 时环旋转 360° 闪一次（500ms `--duration-slow` 缓动）。
- 30s 倒计时期间打开只读面板（如弃牌区）**不**暂停倒计时（详见 10 文档）。

## 响应式布局

V1 响应式断点（钉死）：

- 桌面：`min-width: 769px`。
- 移动：`max-width: 768px`。

桌面布局：

- 左右两栏展示下层和上层。
  - 左栏：LowerPanel（数字牌、目标值、AI 公开目标值）。
  - 右栏：UpperPanel（候选成手、暂定、推荐）。
- 顶部状态栏：回合、双方 Air、seed 摘要、阶段提示（高度固定 56px）。
- 底部固定 Bet 控制区（BettingPanel 高度 200-240px）。
- 摊牌和结算用居中浮层（`position: fixed; inset: 0; background: rgba(0,0,0,0.5)`）+ 卡片面板。

移动布局：

- 使用纵向分段（`flex-direction: column`）。
- 顶部状态栏固定（高度 48px，比桌面略矮）。
- 主区域：下层（LowerPanel）→ 上层（UpperPanel）→ Bet（BettingPanel），按 phase 切换显示。
- 阶段切换不切屏（同屏内切换主区域内容，避免跳转感）。
- Bet 控制区保持在底部，5 个按钮等宽分布，按钮最小宽度 64px 防挤压。
- 摊牌和结算用全屏浮层（`position: fixed; inset: 0`），不保留背景模糊（移动端性能考虑）。

## 结果页

`ResultScreen` 展示：

- 胜负结果（`outcome`）。
- 结束原因（`endReason`）。
- 最终 Air（`finalPlayerAir` / `finalAiAir`）。
- 累计赢得底池（`playerPool` / `aiPool`）。
- seed（用于调试复现）。
- 回合摘要列表（`roundHistory`）：
  - 每项：`roundNumber`、玩家数字牌、AI 数字牌、玩家成手与牌型、AI 成手与牌型、Bet 动作、灾厄触发、Air 变化。
- 弃牌区摘要（每回合移入的 ID 数量）。
- AI 调试信息（仅 `settings.showAIDebug === true` 时显示）：每回合 LowerAI / UpperAI / BettingAI 的 `reason` 摘要。

操作：

- 再来一局（`commands.restartGame()`，强制新 seed）。
- 查看完整回合记录（`commands.openPanel("history")`）。
- 返回起始状态（同一屏内的关闭按钮，等同 `commands.restartGame()`）。
- 调整设置（`commands.openPanel("settings")`）。

## 可访问性

V1 钉死：

- 所有按钮有明确文本或 `aria-label`（仅 emoji-only 按钮必须配 `aria-label`）。
- 禁用动作提供原因：`aria-disabled="true"` + `aria-describedby` 指向原因文本。
- 牌面信息不能只依赖颜色——花色 + rank + 数值多重信息；状态（用过 / 失效 / 重叠）必须有图标或文字辅助。
- 弹窗可用 `Escape` 关闭，**危险确认除外**（fold / all-in 二次确认必须显式点击确认或取消，Esc 只关闭普通模态）。
- 键盘焦点顺序：顶部状态栏 → 主操作按钮 → 次要操作按钮。
- 只读面板打开时焦点移入面板内（`panel.firstFocusable.focus()`），关闭后回到原焦点（保存 `document.activeElement`）。
- `showAIDebug` 调试面板默认隐藏，仅 `showAIDebug === true` 时显示。
- 数字牌 `aria-label` 含数值 + 状态，如"数字牌 18，未用过，可点击"。
- Bet 按钮 `aria-label` 含动作 + 金额，如"加注 5 Air（共 10 Air）"。

## 国际化

V1 简体中文 only。label 字符串集中在 `src/ui/i18n/zh-CN.ts`，便于未来加 i18n 库。V1 不引入 i18next / react-intl，**不**为单语言游戏增加依赖。

## 触摸交互

移动端补充规则：

- 按钮按下时缩放 `transform: scale(0.98)`，200ms 缓动。
- 触摸设备 hover 状态用 `:focus` + `:active` 替代（hover 在 touch 设备上无意义）。
- 步进器按钮最小点击区 44x44px（iOS HIG）。
- 数字牌点击区不小于 56x80px。
- 长按 500ms 触发数字牌 proofHand 详情（调试场景，正式版可关闭）。

## 测试要求

- Chrome 桌面能打开并显示起始页。
- 开始新局后能看到双方 Air、回合、数字牌。
- 不可解数字牌有禁用态，hover 显示原因。
- 上层候选组合可暂定，进入 Bet 后变为只读。
- Bet 控制只启用合法动作，禁用按钮显示原因。
- 摊牌后能看到双方成手、牌型和回合结果。
- 结算页能展示胜负原因和回合摘要。
- 倒计时颜色按时切换（30-10s 绿、10-5s 黄、5-0s 红）。
- 30s 超时自动触发合法动作（`getTimeoutBetAction`）。
- 移动端断点（`<= 768px`）切换为纵向布局。
- `axe-core` 跑 Playwright 测试，0 violation（自动可访问性检查）。
- 调试 seed 复现：URL 含 `?debug=1&seed=test-seed-001` 时，StartScreen 提供"使用此 seed 复现"入口（V1 钉死，仅在 debug 模式下可见）。

## 实现注意

- 不要在视觉层重写规则判断；胜负、可解性、合法性一律从 selector 拿。
- 不要为了动画延迟状态机推进；动画只表现已确定状态。V1 动画白名单（其它动画不实现）：
  - 数字牌翻牌 200ms（`--duration-base`）。
  - 暂定组合高亮 100ms（`--duration-fast`）。
  - 倒计时环 1s 线性（剩余秒数）。
  - 灾厄警示 500ms 闪烁 3 次（仅 `triggered === true` 时）。
- 页面切换无过渡动画（StartScreen ↔ GameScreen ↔ ResultScreen 直接替换）。
- 优先完成可用界面，再增加表现细节。
- 所有视觉状态对应 `state` 的明确字段，**不**靠组件内 useState 维护业务相关状态。
- 颜色选择必须满足 WCAG AA 对比度（正文 4.5:1，大字号 3:1）。
