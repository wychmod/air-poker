# Air Poker V1 视觉素材图需求与 image2 提示词清单

日期：2026-06-22  
用途：汇总 Air Poker V1 可能需要的原创视觉素材图，并为每张素材给出可直接用于 image2 的生成提示词。

## 1. 扫描依据

本清单基于以下项目内容整理：

- `doc/2026-06-18-air-poker-v1-design.md`
- `doc/2026-06-20-air-poker-v1-user-flow.md`
- `doc/2026-06-21-air-poker-v1-architecture.md`
- `doc/2026-06-21-air-poker-v1-ai-development-quality-harness.md`
- `doc/v1-implementation-design/10-ui-interaction-design.md`
- `doc/v1-implementation-design/11-ui-pages-and-visual-design.md`
- 当前 `src/` 代码与现有素材引用扫描
- `assets/reference/usogui-air-poker/` 下的本地参考图与 README

当前代码状态：生产代码尚未引用正式图片资源，`assets/reference/usogui-air-poker/` 仅作为 moodboard / 风格参考，不建议直接发布使用。

## 2. 参考风格提炼

参考图可提炼的方向：

- 深色水下空间：低饱和蓝黑、蓝绿、玻璃水箱、水面线、气泡和冷光。
- 赌博压迫感：对峙构图、低角度、中央赌桌、强烈明暗对比。
- 漫画线稿感：高反差墨线、细密排线、半写实角色/物件渲染。
- 空气资源：气泡、氧气舱、刻度、压力警告。
- 数字牌：金属竖牌、刻印数字、冷光边缘。
- 灾厄：紫黑裂纹、强警戒色、空气消失、重叠牌高亮。

版权边界：

- 只参考气氛、材质、构图语言，不复刻原图、人物、服装、发型、台词、分镜或封面。
- 生成素材应为原创，不要出现可识别的《噬谎者》角色、标志或日文漫画文字。
- 正式发布素材应放在后续的生产素材目录中，不要直接消费 `assets/reference/`。

## 3. 生成通用约束

建议 image2 生成时统一追加以下约束：

```text
Original artwork for a browser card game. High-contrast psychological gambling manga mood, cinematic underwater pressure, dark navy and blue-green palette, cold rim light, detailed ink linework, semi-realistic colored illustration. Do not copy any existing manga panel, character, cover, logo, or composition. No text, no letters, no numbers unless explicitly requested, no watermark, no signature, no UI labels.
```

透明或叠加类素材如果 image2 不支持原生透明，建议先生成在纯色背景上，再本地抠图：

```text
Place the subject on a perfectly flat solid #00ff00 chroma-key background. No shadows, no gradients, no floor plane, no texture in the background. Do not use #00ff00 inside the subject.
```

## 4. 建议素材目录

后续真正落地时，建议使用类似目录：

```text
assets/generated/air-poker-v1/
  backgrounds/
  cards/
  effects/
  icons/
  results/
  rules/
```

本次只新增文档，不创建生产素材目录。

## 5. P0：首版最小可用素材包

P0 素材用于支持 StartScreen、GameScreen、UpperPanel、BettingPanel、ShowdownPanel 和灾厄反馈。建议先生成这些，再开始 UI 视觉实现。

### P0-01 `backgrounds/start-screen-underwater-chamber.png`

用途：起始页背景。  
建议规格：`2048x1152`，16:9。  
透明：否。

中文提示词：

```text
为浏览器卡牌游戏起始页绘制一张原创的电影感水下赌博房间背景，中央是一张空的金属扑克桌，四周是玻璃水箱墙体，深海军蓝与蓝绿色水体，少量氧气泡，顶部冷白光束，黄铜工业框架细节，高反差心理赌博漫画氛围，细密墨线，半写实彩色插画。画面上方中央保留足够负空间用于放置 UI 标题和按钮。不要人物，不要文字，不要 Logo，不要水印，不要基于任何现有漫画分镜或封面。
```

英文提示词：

```text
Original cinematic underwater gambling chamber for a browser card game start screen, an empty metal poker table in the center, glass tank walls, dark navy and blue-green water, sparse oxygen bubbles, cold white overhead beams, brass industrial frame details, high-contrast psychological gambling manga mood, detailed ink linework, semi-realistic colored illustration, strong negative space in the upper center for UI title and buttons, no characters, no text, no logos, no watermark, not based on any existing manga panel or cover.
```

### P0-02 `backgrounds/game-table-wide.png`

用途：主牌局 GameScreen 背景，可在其上覆盖左右面板和底部下注区。  
建议规格：`2048x1152`，16:9。  
透明：否。

中文提示词：

```text
为水下扑克游戏 UI 绘制一张原创宽屏背景底图：略微俯视的水下玻璃房间和空矩形牌桌，深蓝水体，细微气泡，冷色边缘光，低饱和黄铜和钢结构。画面中央对比度要低，便于叠加可读 UI 面板；左右预留卡牌面板安全区；底部预留下注控制区安全区。高反差青年漫画风格墨线，半写实上色。不要人物，不要可读文字，不要 Logo，不要水印，不要复制现有漫画构图。
```

英文提示词：

```text
Original wide background plate for an underwater poker game UI, submerged glass chamber with an empty rectangular card table viewed from a slight top-down angle, dark blue water, subtle bubbles, cold rim lighting, muted brass and steel structure, low-contrast center area for readable UI panels, left and right safe zones for card panels, bottom safe zone for betting controls, high-contrast seinen manga-inspired ink rendering, semi-realistic color, no characters, no readable text, no logos, no watermark, do not copy any existing manga composition.
```

### P0-03 `backgrounds/showdown-stage.png`

用途：摊牌阶段或摊牌浮层背景。  
建议规格：`2048x1152`，16:9。  
透明：否。

中文提示词：

```text
为水下卡牌对决绘制一张原创戏剧化摊牌背景：窄束聚光灯照在空扑克桌上，两侧各有一个空座位，画面中有明显水位线，悬浮气泡和水压雾气，中央有轻微紫色紧张裂纹光效但不要文字。深海军蓝与黑色调，冷蓝高光，高反差漫画墨线，电影感构图，中央桌面区域保持清晰，便于放置双方手牌。不要人物，不要 Logo，不要水印，不要复制漫画分镜。
```

英文提示词：

```text
Original dramatic showdown background for an underwater card duel, empty poker table under a narrow spotlight, two opposing empty seats, a visible waterline across the scene, suspended bubbles and pressure haze, faint purple tension crack light in the center without text, dark navy and black palette with cold blue highlights, high-contrast manga-style ink linework, cinematic composition, leave central table area clear for two hands of cards, no people, no logos, no watermark, no copied manga panel.
```

### P0-04 `backgrounds/dark-diamond-pattern-seamless.png`

用途：页面底纹、面板底纹、牌背局部纹理。  
建议规格：`1024x1024`，无缝平铺。  
透明：否。

中文提示词：

```text
为扑克主题水下 UI 设计一张无缝深色菱格纹理，低对比度海军蓝与近黑色小丑菱格图案，带细微织物纹理和水压颗粒感，优雅克制，可完美平铺。不要中心物体，不要文字，不要 Logo，不要水印，作为平面纹理素材，不基于任何现有受版权保护图案。
```

英文提示词：

```text
Seamless dark diamond pattern texture for a poker-themed underwater UI, low-contrast navy blue and near-black harlequin diamonds, subtle fabric and water-pressure grain, elegant but restrained, designed to tile perfectly, no center object, no text, no logo, no watermark, flat texture asset, not based on any existing copyrighted pattern.
```

### P0-05 `cards/number-card-metal-blank.png`

用途：数字牌基础牌面，数字由 CSS/HTML 覆盖，不建议为每个数字单独生成。  
建议规格：`512x768`，2:3 竖版。  
透明：建议透明；若不能透明，生成纯色背景后抠图。

中文提示词：

```text
绘制一张单独的空白竖版金属数字牌素材，正面居中正交视角，深色枪铁与旧黄铜材质，刻蚀边框，细微冷青色边缘光，水下划痕金属质感，中心保持干净空白以便后续由 UI 渲染大数字。不要数字，不要字母，不要花色符号，不要 Logo，不要水印。轮廓清晰、留白充足，高反差漫画风材质渲染；如果无法透明输出，请放在纯色 #00ff00 抠图背景上。
```

英文提示词：

```text
Single blank vertical metal number card asset, centered orthographic front view, dark gunmetal and worn brass material, engraved border, subtle cold cyan edge glow, scratched underwater metal texture, empty clean center area for a large UI number to be rendered later, no digits, no letters, no suit symbols, no logo, no watermark, crisp silhouette with generous padding, high-contrast manga-inspired material rendering, on a perfectly flat solid #00ff00 chroma-key background if transparency is not available.
```

### P0-06 `cards/playing-card-front-blank.png`

用途：普通扑克牌正面模板，rank 和 suit 由 UI 渲染。  
建议规格：`512x768`，2:3 竖版。  
透明：建议透明或纯白/象牙底。

中文提示词：

```text
绘制一张普通扑克牌正面空白模板，用于浏览器游戏 UI，居中正交视角，象牙色纸面，带轻微水下磨损，细黑色墨线边框，四角有很小的装饰框区域，但不要点数、不要花色、不要字母、不要数字、不要文字、不要 Logo。中心干净可读，略带粗粝高反差墨线质感，作为精致游戏素材，留白充足，不要水印。
```

英文提示词：

```text
Blank front face of a physical poker card for a browser game UI, centered orthographic view, ivory paper with subtle underwater wear, thin black ink border, tiny ornamental corner frame areas but no rank, no suit, no letters, no numbers, no text, no logo, clean readable center, slightly gritty high-contrast ink texture, polished game asset, generous padding, no watermark.
```

### P0-07 `cards/playing-card-back-air-poker.png`

用途：牌背、未公开 AI 成手、牌堆。  
建议规格：`512x768`，2:3 竖版。  
透明：建议透明或平面牌面。

中文提示词：

```text
为原创水下赌博浏览器游戏设计一张扑克牌背面，居中正交卡牌素材，深海军蓝菱格纹，细微氧气泡图案，薄黄铜边框，冷青色高光，高反差墨线，优雅且紧张。不要字母，不要数字，不要可读符号，不要 Logo，不要水印，不要受版权保护图案，边缘清晰、留白充足。
```

英文提示词：

```text
Back design of a poker card for an original underwater gambling browser game, centered orthographic card asset, dark navy diamond pattern, subtle oxygen bubble motif, thin brass border, cold cyan highlights, high-contrast ink linework, elegant and tense, no letters, no numbers, no readable symbols, no logo, no watermark, no copyrighted pattern, crisp edges and generous padding.
```

### P0-08 `cards/deck-stack-icon.png`

用途：共享牌库摘要图标、牌库剩余数量旁边的图形。  
建议规格：`512x512`。  
透明：建议透明。

中文提示词：

```text
绘制一个小尺寸 UI 可读的扑克牌堆图标素材，三分之四俯视角，一小叠扑克牌，深海军蓝牌背，带细微菱格纹，黄铜边缘高光，水滴和小气泡。高反差墨线插画风，小尺寸下轮廓清楚。不要文字，不要数字，不要 Logo，不要水印，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Icon-like game asset of a small stack of poker cards seen from a three-quarter top-down angle, dark navy card backs with subtle diamond pattern, brass edge highlights, underwater droplets and tiny bubbles, readable silhouette at small UI sizes, high-contrast inked illustration style, no text, no numbers, no logos, no watermark, isolated on transparent or flat #00ff00 background.
```

### P0-09 `cards/discard-pile-icon.png`

用途：弃牌区入口、回合摘要中的已用牌提示。  
建议规格：`512x512`。  
透明：建议透明。

中文提示词：

```text
绘制一个小尺寸 UI 可读的弃牌堆图标素材，几张散落的已用扑克牌，灰化处理并带斜线标记，湿润磨损纸边，深海军蓝阴影，细微气泡，高反差心理漫画墨线渲染。不要可读点数或花色，不要文字，不要 Logo，不要水印，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Icon-like game asset of a scattered discard pile of used poker cards, several greyed cards with diagonal slash marks, worn wet paper edges, dark navy shadows, subtle bubbles, high-contrast manga-inspired ink rendering, readable at small UI sizes, no readable ranks or suits, no text, no logos, no watermark, isolated on transparent or flat #00ff00 background.
```

### P0-10 `icons/air-bios-bubble.png`

用途：Air 数值、Air-BIOS 资源图标、变化提示。  
建议规格：`512x512`。  
透明：建议透明。

中文提示词：

```text
绘制一个代表 Air-BIOS 资源的单个氧气泡图标，透明玻璃质感球体，青色边缘光，内部小高光，轻微水压涟漪，深蓝反射，圆形轮廓清晰，高质量游戏 UI 图标。不要文字，不要数字，不要 Logo，不要水印，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Single stylized oxygen bubble icon representing Air-BIOS resource, transparent glassy sphere with cyan rim light, tiny internal highlights, faint pressure ripple, dark blue reflection, crisp circular silhouette, high-quality game UI icon, no text, no numbers, no logo, no watermark, isolated on transparent or flat #00ff00 background.
```

### P0-11 `icons/air-bet-token.png`

用途：下注筹码、Bet 区金额显示、底池显示。  
建议规格：`512x512`。  
透明：建议透明。

中文提示词：

```text
绘制一个原创 Air-BIOS 下注筹码，用于扑克游戏 UI。圆形金属与玻璃混合筹码，内部封存一个小氧气泡，深枪铁外圈，黄铜刻度，但不要数字；中心有青色内发光，水下湿润高光，高反差墨线半写实游戏素材。不要文字，不要数字，不要 Logo，不要水印，居中图标，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Original Air-BIOS betting token for a poker game UI, round metal-and-glass chip containing a small trapped oxygen bubble, dark gunmetal rim, brass tick marks, cyan inner glow, underwater wet highlights, high-contrast inked semi-realistic game asset, no text, no numbers, no logo, no watermark, centered icon, transparent or flat #00ff00 background.
```

### P0-12 `effects/calamity-purple-crack.png`

用途：灾厄触发、重叠牌、危险动作视觉反馈。  
建议规格：`1024x1024`。  
透明：必须透明或可抠图。

中文提示词：

```text
绘制一个用于水下扑克游戏灾厄触发的紫黑色爆裂裂纹特效，锯齿状墨迹裂痕，带电光般紫色辉光，锐利放射爆发，适合作为透明叠加层。不要人物，不要文字，不要符号，不要 Logo，不要水印，高反差漫画冲击特效，透明背景或纯色 #00ff00 抠图背景，留白充足，不要投影。
```

英文提示词：

```text
Explosive purple-black fracture effect for a calamity trigger in an underwater poker game, jagged ink-like cracks with electric violet glow, sharp radial burst, transparent center-friendly overlay, no characters, no text, no symbols, no logo, no watermark, high-contrast manga impact effect, isolated on transparent or perfectly flat #00ff00 chroma-key background, generous padding, no cast shadow.
```

### P0-13 `effects/air-loss-bubble-burst.png`

用途：灾厄额外 Air 消失、输家空气释放、水中气泡喷散。  
建议规格：`1024x1024`。  
透明：必须透明或可抠图。

中文提示词：

```text
绘制一团水下惩罚特效：大量氧气泡快速向上逃逸并散开，用于表现 Air 流失。冷青色高光，深蓝边缘，动态但轮廓干净，适合作为 UI 叠加层。高反差墨线和水体渲染。不要人物，不要文字，不要 Logo，不要水印，透明背景或纯色 #00ff00 抠图背景，不要地面，不要阴影。
```

英文提示词：

```text
Burst of escaping oxygen bubbles for an underwater card game penalty effect, many bubbles rapidly rising and dispersing, cold cyan highlights, dark blue edges, dynamic but clean overlay shape, high-contrast ink-and-water rendering, no characters, no text, no logos, no watermark, isolated on transparent or perfectly flat #00ff00 chroma-key background, no floor, no shadows.
```

### P0-14 `effects/overlap-warning-ring.png`

用途：标记灾厄重叠牌、危险牌高亮边框。  
建议规格：`512x512`。  
透明：必须透明或可抠图。

中文提示词：

```text
绘制一个用于卡牌 UI 的圆形警告环叠加素材，锯齿状红紫色危险轮廓，混合水波扭曲，线条足够细，可以框住一张扑克牌但不遮挡内容，高反差漫画冲击风格，中心透明。不要文字，不要数字，不要 Logo，不要水印，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Circular warning ring overlay for a card UI, jagged red-violet hazard outline mixed with water ripple distortion, thin enough to frame a playing card without covering it, high-contrast manga impact styling, transparent center, no text, no numbers, no logo, no watermark, isolated on transparent or flat #00ff00 background.
```

## 6. P1：提升完成度的视觉素材

P1 素材用于增强阶段反馈、结果页和 UI 细节。P0 完成后再生成。

### P1-01 `cards/number-card-metal-used.png`

用途：已使用数字牌的独立变体；也可由 P0-05 通过 CSS 灰阶实现。  
建议规格：`512x768`。  
透明：建议透明。

中文提示词：

```text
绘制一张已使用状态的空白竖版金属数字牌变体，居中正交正面视角，氧化灰色枪铁材质，暗淡黄铜边框，带对角划痕和磨损表面，中心保持空白用于 UI 渲染数字。不要数字，不要字母，不要花色符号，不要文字，不要 Logo，不要水印。轮廓清晰，高反差墨线材质风格，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Used variant of a blank vertical metal number card asset, centered orthographic front view, oxidized grey gunmetal, muted brass border, diagonal scratch marks and dull worn surface, empty center area for a UI number, no digits, no letters, no suit symbols, no text, no logo, no watermark, crisp silhouette, high-contrast inked material style, transparent or flat #00ff00 background.
```

### P1-02 `cards/number-card-metal-disabled.png`

用途：不可解数字牌状态；也可由 P0-05 通过 CSS 禁用态实现。  
建议规格：`512x768`。  
透明：建议透明。

中文提示词：

```text
绘制一张不可解/禁用状态的空白竖版金属数字牌变体，居中正交视角，暗色低饱和金属，微弱琥珀色警戒边缘光，细微开裂珐琅质感，中心保持空白用于 UI 数字。不要数字，不要文字，不要花色符号，不要 Logo，不要水印，轮廓清晰的游戏素材，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Disabled unsolvable variant of a blank vertical metal number card asset, centered orthographic view, dark desaturated metal, faint warning amber edge light, subtle cracked enamel, empty center area for UI number, no digits, no text, no suit symbols, no logo, no watermark, crisp game asset silhouette, transparent or flat #00ff00 background.
```

### P1-03 `cards/used-card-slash-overlay.png`

用途：扑克牌“用过但可选、选中即失效”的斜线覆盖层。  
建议规格：`512x768`。  
透明：必须透明或可抠图。

中文提示词：

```text
绘制一个透明叠加层，用于标记一张已用扑克牌为失效状态。包含几道对角灰色墨线斜杠和细微旧纸划痕，设计为覆盖在 2:3 扑克牌上时不遮挡点数和花色，高反差但保持可读。不要文字，不要数字，不要 Logo，不要水印，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Transparent overlay for marking a used playing card as invalid, several diagonal grey ink slashes and subtle worn-paper scratches, designed to sit above a 2:3 poker card without hiding rank or suit, high-contrast but readable, no text, no numbers, no logo, no watermark, isolated on transparent or flat #00ff00 background.
```

### P1-04 `icons/air-bios-gauge-frame.png`

用途：顶部或侧边 Air-BIOS 条/管的装饰框。  
建议规格：`512x1536`，竖版。  
透明：建议透明。

中文提示词：

```text
绘制一个浏览器游戏 UI 用的竖向 Air-BIOS 仪表框，透明玻璃管嵌在深枪铁和黄铜机械框架中，有小刻度但不要数字，冷青色发光，水下凝结水珠。内部保持空白，方便 UI 后续填充空气液位。高反差墨线半写实素材。不要文字，不要数字，不要 Logo，不要水印，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Vertical Air-BIOS gauge frame for a browser game UI, transparent glass tube inside a dark gunmetal and brass mechanical frame, small tick marks without numbers, cold cyan glow, underwater condensation, high-contrast inked semi-realistic asset, empty interior so UI can fill the air level later, no text, no digits, no logo, no watermark, isolated on transparent or flat #00ff00 background.
```

### P1-05 `results/result-victory-background.png`

用途：结算页玩家胜利背景。  
建议规格：`2048x1152`。  
透明：否。

中文提示词：

```text
为水下扑克浏览器游戏绘制一张胜利结算页背景，空牌桌上方有氧气泡平静上升，冷蓝光穿过深水，隐约可见黄铜机械结构，氛围有希望但仍紧张，高反差心理漫画风墨线，中央或上方保留清晰负空间用于结果 UI 文本。不要人物，不要可读文字，不要 Logo，不要水印，不要复制漫画分镜。
```

英文提示词：

```text
Original victory result background for an underwater poker browser game, empty card table with oxygen bubbles rising calmly, cold blue light breaking through dark water, faint brass machinery, hopeful but tense atmosphere, high-contrast psychological manga-inspired ink rendering, clear negative space for result UI text, no characters, no readable text, no logos, no watermark, no copied manga panel.
```

### P1-06 `results/result-defeat-background.png`

用途：结算页玩家失败背景。  
建议规格：`2048x1152`。  
透明：否。

中文提示词：

```text
为水下扑克浏览器游戏绘制一张失败结算页背景，空的水下牌桌沉入黑暗，氧气泡向上逃逸，微弱红色警告光，深海军蓝与黑色水压氛围，戏剧化阴影，高反差漫画墨线。保留清晰负空间用于结果 UI 文本。不要人物，不要可读文字，不要 Logo，不要水印，不要复制漫画分镜。
```

英文提示词：

```text
Original defeat result background for an underwater poker browser game, empty submerged card table in darkness, oxygen bubbles escaping upward, faint red warning glow, deep navy and black water pressure, dramatic shadows, high-contrast manga-inspired ink linework, clear negative space for result UI text, no characters, no readable text, no logos, no watermark, no copied manga panel.
```

### P1-07 `results/result-tie-background.png`

用途：平局或决胜回合后仍平局的结算页。  
建议规格：`2048x1152`。  
透明：否。

中文提示词：

```text
为水下扑克浏览器游戏绘制一张平局结算页背景，空扑克桌两侧各有一股等量气泡流，冷蓝光保持平衡，水体安静悬浮，细微黄铜框架，紧张且悬而未决的氛围，高反差墨线半写实插画。中央保留明显负空间用于结果 UI。不要人物，不要可读文字，不要 Logo，不要水印。
```

英文提示词：

```text
Original tie result background for an underwater poker browser game, empty poker table with two equal streams of bubbles on both sides, balanced cold blue lighting, quiet suspended water, subtle brass frame, tense unresolved mood, high-contrast inked semi-realistic illustration, strong central negative space for result UI, no characters, no readable text, no logos, no watermark.
```

### P1-08 `effects/showdown-light-sweep.png`

用途：摊牌时扫光、卡牌翻开过渡。  
建议规格：`1536x512`。  
透明：必须透明或可抠图。

中文提示词：

```text
绘制一个横向冷光扫过特效，用于扑克牌翻开或摊牌揭示。明亮青白色光束，带细微水中颗粒和墨线边缘，透明叠加层，适合 UI 动画。不要文字，不要数字，不要 Logo，不要水印，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Horizontal cold light sweep effect for revealing poker cards, bright cyan-white beam with subtle water particles and inked edges, transparent overlay, clean enough for UI animation, no text, no numbers, no logos, no watermark, isolated on transparent or flat #00ff00 background.
```

### P1-09 `icons/timer-pressure-ring.png`

用途：30 秒倒计时环的装饰贴图；也可纯 CSS 实现。  
建议规格：`512x512`。  
透明：必须透明或可抠图。

中文提示词：

```text
绘制一个水下注注 UI 用的圆形压力倒计时环素材，薄机械圆环，带青色与琥珀色分段，细微水滴，黄铜和枪铁材质，中心透明。不要数字，不要文字，不要 Logo，不要水印，清晰图标轮廓，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Circular pressure timer ring asset for an underwater betting UI, thin mechanical ring with cyan and amber accent segments, subtle water droplets, brass and gunmetal material, transparent center, no numbers, no text, no logo, no watermark, crisp icon-like silhouette, isolated on transparent or flat #00ff00 background.
```

### P1-10 `backgrounds/rules-panel-flow-illustration.png`

用途：规则说明面板的无文字流程图背景，辅助说明“数字牌 -> 成手 -> Bet -> 摊牌”。  
建议规格：`1536x512`，横幅。  
透明：否。

中文提示词：

```text
绘制一张用于说明水下扑克游戏流程的原创横向插画，不含文字。用四个象征场景表达流程：空白金属数字牌、五张扑克牌成手、Air-BIOS 下注筹码、戏剧化摊牌聚光。整体为深海军蓝水下氛围，高反差墨线，半写实游戏美术。不要字母，不要数字，不要标签，不要带文字的箭头，不要 Logo，不要水印。
```

英文提示词：

```text
Original horizontal illustration for explaining an underwater poker game flow, four symbolic scenes connected visually without text: a blank metal number card, a five-card poker hand, an Air-BIOS betting token, and a dramatic card showdown spotlight, dark navy underwater atmosphere, high-contrast ink linework, semi-realistic game art, no letters, no numbers, no labels, no arrows with text, no logos, no watermark.
```

## 7. P2：后续增强素材

P2 素材不是 V1 首屏可用性的必要条件，但可以提升角色感、宣传图和分享图质量。

### P2-01 `avatars/player-proxy-silhouette.png`

用途：玩家侧头像或身份标识。  
建议规格：`768x768`。  
透明：建议透明。

中文提示词：

```text
为水下心理卡牌游戏绘制一个原创玩家侧匿名头像，人物只是玻璃与水波扭曲后的模糊剪影，不要可识别面孔，不要任何现有角色特征，深海军蓝与青色边缘光，高反差漫画墨线，严肃氛围，图标式构图。不要文字，不要 Logo，不要水印，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Original anonymous player-side avatar for an underwater psychological card game, a subtle human silhouette behind glass and water distortion, no recognizable face, no specific existing character traits, dark navy and cyan rim light, high-contrast manga-inspired ink linework, serious mood, icon composition, no text, no logo, no watermark, isolated on transparent or flat #00ff00 background.
```

### P2-02 `avatars/ai-opponent-silhouette.png`

用途：AI 侧头像或对手标识。  
建议规格：`768x768`。  
透明：建议透明。

中文提示词：

```text
为水下心理扑克游戏绘制一个原创 AI 对手头像，抽象面具剪影映在玻璃中，表情冷静不可读，但不要基于任何现有角色。冷蓝边缘光，深海军蓝阴影，高反差墨线半写实风格，图标式构图。不要文字，不要字母，不要 Logo，不要水印，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Original AI opponent avatar for an underwater psychological poker game, abstract masked silhouette reflected in glass, calm and unreadable expression but not based on any existing character, cold blue rim light, dark navy shadows, high-contrast inked semi-realistic style, icon composition, no text, no letters, no logo, no watermark, isolated on transparent or flat #00ff00 background.
```

### P2-03 `backgrounds/social-share-key-art.png`

用途：未来公开页面、社交分享图、README 封面。  
建议规格：`1200x630`。  
透明：否。

中文提示词：

```text
为名为 Air Poker 的浏览器游戏绘制一张原创关键视觉图：水下赌博房间，中央空扑克桌，金属数字牌和氧气泡悬浮在画面中，深海军蓝与蓝绿色主色，少量紫色危险强调，电影感高反差心理漫画氛围，细密墨线与半写实上色。保留清晰负空间，方便后续由 UI 添加标题。不要现有作品角色，不要可读文字，不要 Logo，不要水印。
```

英文提示词：

```text
Original key art for a browser game called Air Poker, underwater gambling chamber, empty central poker table, metal number cards and oxygen bubbles suspended in the scene, dark navy and blue-green palette with violet danger accent, cinematic high-contrast psychological manga mood, detailed ink linework and semi-realistic coloring, leave clear negative space for title added later by UI, no characters from existing works, no readable text, no logo, no watermark.
```

### P2-04 `backgrounds/mobile-start-background.png`

用途：移动端起始页专用竖图。  
建议规格：`1080x1920`。  
透明：否。

中文提示词：

```text
为原创水下扑克浏览器游戏绘制一张移动端竖版背景，空的水下牌桌位于画面下三分之一，玻璃水箱和气泡向上延伸，深海军蓝水体，顶部冷青光，黄铜工业框架，高反差漫画墨线渲染。上半部分保留强负空间用于 UI 标题。不要人物，不要可读文字，不要 Logo，不要水印，原创构图。
```

英文提示词：

```text
Vertical mobile background for an original underwater poker browser game, empty submerged card table near the lower third, towering glass tank and bubbles rising upward, dark navy water, cold cyan overhead light, brass industrial frame, high-contrast manga-inspired ink rendering, strong negative space in the upper half for UI title, no characters, no readable text, no logos, no watermark, original composition.
```

### P2-05 `effects/water-ripple-panel-overlay.png`

用途：面板轻量水波覆盖层、阶段切换氛围。  
建议规格：`1536x1024`。  
透明：必须透明或可抠图。

中文提示词：

```text
绘制一个用于深色水下游戏 UI 的细微透明水波覆盖层，包含薄青色高光和柔和扭曲线条，低对比度，叠在面板上不会影响可读性。不要具体物体，不要文字，不要 Logo，不要水印，接近无缝的覆盖层感觉，透明背景或纯色 #00ff00 背景。
```

英文提示词：

```text
Subtle transparent water ripple overlay for a dark underwater game UI, thin cyan highlights and soft distorted lines, low contrast, designed to sit over panels without hurting readability, no objects, no text, no logo, no watermark, seamless-feeling overlay, isolated on transparent or flat #00ff00 background.
```

## 8. 不建议生成的素材

以下内容更适合用 CSS、React 组件或文本渲染，不建议作为图片批量生成：

- 52 张普通扑克牌完整牌面：建议用 `playing-card-front-blank.png` + CSS/HTML 渲染 rank 和 suit。
- 所有数字牌数值版本：建议用 `number-card-metal-blank.png` + CSS/HTML 渲染中心数字。
- 按钮文字、阶段标题、规则说明文字：必须由 UI 文本渲染，避免图片文字不可访问且难以维护。
- 纯几何图标：如返回、设置、关闭、加减按钮，优先用 CSS 或现有图标方案。
- 参考图中的角色、分镜、封面、台词：版权风险高，且会削弱项目原创性。

## 9. 推荐生成顺序

1. 先生成 P0-01 到 P0-14，完成主界面、牌、Air、灾厄的视觉闭环。
2. 再生成 P1-01 到 P1-10，补齐状态变体、结果页和规则页。
3. 最后按实际 UI 需要生成 P2 素材，不要过早投入角色头像和宣传图。

生成后建议检查：

- 小尺寸下是否可读，特别是图标和卡牌。
- 是否有误生成文字、Logo、水印或相似漫画人物。
- 是否有足够留白放置 UI。
- 可抠图素材边缘是否干净。
- 与深色 UI 叠加后是否满足可读性。
