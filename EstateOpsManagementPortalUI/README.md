# EstateOps admin portal (management UI)

React 18 + JavaScript, Vite, Tailwind, TanStack Query/Table, Formik + Zod. The back end is
fully mocked in the browser (MSW over an in-memory, localStorage-persisted database) and is
swappable for the real REST or GraphQL API through environment variables only.

```bash
npm install
cp env.example .env.local   # optional; defaults are mock + REST
npm run dev
```

| Variable             | Values             | Effect                                                        |
| -------------------- | ------------------ | ------------------------------------------------------------- |
| `VITE_API_MODE`      | `mock` / `real`    | `mock` starts the MSW worker before render                    |
| `VITE_API_TRANSPORT` | `rest` / `graphql` | Global default; override per feature in `transport.config.js` |
| `VITE_API_BASE_URL`  | `/api/v1`          | REST base                                                     |
| `VITE_GRAPHQL_URL`   | `/graphql`         | GraphQL endpoint                                              |

Scripts: `format`, `format:check`, `lint`, `lint:fix`, `test`, `test:ci`, `build`, `size`.

## Data flow (strict)

`transport (raw JSON) → DTO schema parse → mapper → domain model → hooks → components`

- `src/shared/api/dtos/<name>.dto.js` and `<name>.mapper.js`: the only places wire field names
  live (plus GraphQL fragments and the mock server). `fromApi(dto)` and `toApi(model)`.
- `src/features/<f>/data/`: private. Transports return raw JSON, the repository parses and maps.
- Hooks import only `data/<name>.repository.js`. Components, pages and schemas never see DTOs.
- `src/widgets/` composes several features (payment flow, project scope). Like pages, widgets import features only through `index.js`.
- Features are used only through `index.js`, composed in `src/pages/`. Features never import
  each other. `src/mocks/` is imported only by `main.jsx` and `src/test/`.

ESLint enforces all of this (`eslint.config.js`) and `src/test/boundaries.test.js` proves it.
See `docs/api-contract.md` for the wire shapes.

## Mock sign-in

Any seeded email with password `Passw0rd!` and 2FA code `123456`, or "Continue with Google" (a built-in account chooser in
mock mode; real mode uses Google Identity Services with `VITE_GOOGLE_CLIENT_ID`). The login page lists one seeded user per role
and tenant for one-click sign-in.
