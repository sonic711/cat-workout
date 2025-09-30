# cat-workout

Cat Workout 是一個使用 Vue 3 + Element Plus 建置的重量訓練日誌。資料透過內建的 Express 後端寫入 MySQL，確保跨裝置仍能保存。

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd) 
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Environment Variables

後端會優先讀取 `MYSQL_URL`（例如 `mysql://user:pass@10.0.0.135:3306/mydatabase?serverTimezone=Asia/Taipei`）。若未設定 URL，請提供下列變數：

```env
MYSQL_HOST=10.0.0.135
MYSQL_PORT=3306
MYSQL_DATABASE=mydatabase
MYSQL_USER=user
MYSQL_PASSWORD=userpassword
```

## Project Setup

```sh
npm install
```

## Development Workflow

```sh
npm run dev
```

`npm run dev` 會同時啟動：

- Vite 前端（預設 5173）
- Express 後端（預設 5174，透過 `/api` 由 Vite proxy）

## Production Build

```sh
npm run build
```

若需單獨啟動後端，可使用 `npm run dev:backend`，前端則為 `npm run dev:frontend`。
