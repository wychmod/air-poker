# Air Poker

Air Poker V1 是一个基于 V1 架构文档搭建的纯浏览器 React 应用。

## 环境要求

请使用 `.nvmrc` 指定的 Node.js 版本，或使用当前工具链支持的其他 Node LTS 版本。

## 常用脚本

- `npm run dev` 启动 Vite 开发服务器。
- `npm run build` 生成静态构建产物 `dist/`。
- `npm run typecheck` 运行严格 TypeScript 检查。
- `npm run lint` 运行 ESLint。
- `npm run format:check` 检查 Prettier 格式。
- `npm run test` 运行 Vitest。
- `npm run e2e` 运行 Playwright 浏览器测试。
- `npm run verify` 运行标准完成前检查：格式、类型、lint、测试和构建。
- `npm run verify:full` 运行 `verify`，并追加浏览器测试。

## 源码边界

- `src/domain/` 放纯游戏规则，不依赖 React、DOM API 或浏览器存储。
- `src/app/` 放浏览器侧编排逻辑，例如设置、持久化和随机数注入。
- `src/ui/` 放 React 组件、页面、面板和 hooks。
- `src/tests/` 放 Vitest 初始化配置和共享测试工具。
