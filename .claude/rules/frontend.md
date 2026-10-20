Folders by feature. src/features/<name>/ holds components, hooks, api and tests. src/shared/ holds common UI, hooks and utils. src/pages/ or src/routes/ holds route-level screens.


Components. One per file, PascalCase names, function components only, hooks named useX. Tests sit beside the file.

Keep them small. Split past about 200 lines. Move data fetching and logic into custom hooks, and keep components mostly presentational.

State. Local state first, TanStack Query for server data, and Context or Zustand only for app-wide state like auth or theme.

Styling. Pick one approach (Tailwind), use design tokens, and avoid inline styles.

Naming. Components UserCard.jsx, hooks useUser.js, utils camelCase, constants UPPER_SNAKE_CASE. Use index.js only as a feature’s public export.

Quality. ESLint with react and react-hooks plugins, Prettier, Vitest with React Testing Library, all run in CI.
Accessibility and config. Semantic HTML and labelled inputs. Env values come through one config.js, with no secrets committed.

DTO. Define each API shape once in src/shared/api/dtos/<name>.dto.js (a Zod schema or JSDoc typedef). Nothing else declares field names.

Mappers. Put fromApi(dto) and toApi(formValues) beside each DTO. They are the only place where API field names turn into UI names.

DTO. Define request and response DTOs once in interfaces/dtos/<name>.dto.js. They are the single source of truth for the API contract.

Validation. Use the request DTO’s schema to validate at the edge. Controllers pass only validated, plain input to use cases.

Mappers. Keep toDomain(dto) and toResponse(entity) beside the DTO. Controllers never build response objects by hand.

Layer rule. DTOs live in the interfaces layer. Domain and use cases never import them.
Persistence. Repositories map database rows to entities in one mapper per entity, separate from the API DTO.

Response safety. Response DTOs list allowed fields explicitly, so new entity fields are not exposed by accident.
Tests. Test each mapper and schema with sample payloads.