# Repository Guidelines

## Project Structure & Module Organization
Source lives under `src/`, with the Vue entry in `src/main.ts` bootstrapping `App.vue`. Views belong in `src/views/` (e.g., `HomeView.vue`) and should stay router-focused. Reusable UI goes in `src/components/`, icons in `src/components/icons/`, and shared state in Pinia stores under `src/stores/` such as `counter.ts`. Static assets sit in `src/assets/`, while anything meant to ship unchanged belongs in `public/`. Use the `@/` alias for imports that target `src/`.

## Build, Test, and Development Commands
- `npm install` — install dependencies with the required lockfile (`yarn.lock` mirrors current versions).
- `npm run dev` — launch Vite’s dev server with hot module replacement.
- `npm run type-check` — run `vue-tsc --build` to validate TypeScript and component types.
- `npm run build` — perform a production build after type-checking via `npm-run-all2`.
- `npm run preview` — serve the built assets locally for smoke testing.

## Coding Style & Naming Conventions
Follow Vue 3 `<script setup>` with TypeScript enabled (`lang="ts"`). Use two-space indentation in templates, scripts, and styles. Components export in PascalCase (`WorkoutList.vue`), composables use `useX` (`useWorkoutPlan.ts`), and stores are nouns (`sessionStore.ts`). Prefer alias-based imports (e.g., `@/stores/counter`). Keep style blocks scoped unless authoring global resets. Run `npm run type-check` before committing to catch inconsistent typings early.

## Testing Guidelines
Automated tests are not yet scaffolded; new work should include unit coverage alongside features. Place component tests under `tests/unit/` and name files `ComponentName.spec.ts`. Use Vitest with Vue Test Utils for consistency, and wire it into the build by adding a `test` script once the suite exists. Until then, rely on `npm run preview` for manual smoke tests and document scenarios exercised.

## Commit & Pull Request Guidelines
The template history is empty, so adopt Conventional Commit subjects (`feat: add workout timer`). Keep bodies concise and reference GitHub issues with `Fixes #123` when relevant. For pull requests, provide: (1) a summary of changes, (2) test or preview evidence (command output, screenshots of UI), and (3) rollout considerations or follow-ups. Request at least one review before merging even if the change seems minor.
