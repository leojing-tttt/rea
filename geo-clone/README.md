# A3GEO Clone — MVP-1

Visual/UX clone slice of [geo.a3database.cn](https://geo.a3database.cn) for discovery acceptance.

## Scope (MVP-1)

- Top nav shell + `/question` search UI (history, platform matrix)
- Phone + password login (dev mock, no captcha)
- Mock async search task → history sidebar
- Simple points badge
- Read-only `/ecommerceBrandRanking` and `/referenceSourceRanking`
- Stub gates for monitor / toolbox (login required)

**Not in scope:** real multi-LLM providers, brand monitoring analytics, sub-accounts, payments, OpenAPI.

## Stack

- Vue 2.7 + Vue Router + Vuex + Element UI + ECharts
- Express mock API (`server/`)

## Run

```bash
cd geo-clone
npm install
npm run dev
```

- Web: http://127.0.0.1:5173/question  
- API: http://127.0.0.1:3001/api/health  

### Demo login

- Phone: any 11-digit number (e.g. `13800138000`)
- Password: any 6+ chars (e.g. `demo1234`)

## Production-ish preview

```bash
npm run build
npm start
# serves API + built static on :3001
```
