# Air Poker

Air Poker V1 is a browser-only React application scaffolded from the V1 architecture docs.

## Prerequisites

Use the Node.js version in `.nvmrc` or another Node LTS line supported by the
toolchain.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates the static `dist/` build.
- `npm run typecheck` runs strict TypeScript checks.
- `npm run lint` runs ESLint.
- `npm run format:check` checks Prettier formatting.
- `npm run test` runs Vitest.
- `npm run e2e` runs Playwright browser tests.
- `npm run verify` runs the standard completion gate.
- `npm run verify:full` runs `verify` plus browser tests.

## Source Boundaries

- `src/domain/` contains pure game rules and must not depend on React, DOM APIs, or browser storage.
- `src/app/` contains browser-facing orchestration such as settings, persistence, and RNG wiring.
- `src/ui/` contains React components, screens, panels, and hooks.
- `src/tests/` contains Vitest setup and shared test utilities.
