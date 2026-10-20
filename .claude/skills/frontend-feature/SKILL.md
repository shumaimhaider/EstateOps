---
name: frontend
description: Use when adding or changing front-end code in EstateOps (React components, hooks, pages, API calls, DTOs, styling, tests). React with plain JavaScript and Tailwind.
---

# Front-end skill

Read rules/frontend.md first. Follow it exactly.

## When to use
Any task touching src/features, src/shared, src/pages, API calls, forms, styling or front-end tests.

## Adding a feature or screen
1. API contract: define the response and request shape once in src/shared/api/dtos/<name>.dto.js (Zod schema or JSDoc typedef), with fromApi(dto) and toApi(formValues) mappers beside it. It must match the back-end DTO and docs/api-contract.md.
2. API call: add the request in the feature's api folder through the shared client. The client parses the response with the DTO and returns the mapped model. Never call fetch in a component.

3. Hook: wrap data access in a custom hook (useX) using TanStack Query. Keep logic and fetching here.
4. Components: one per file, PascalCase, function components only, under about 200 lines, mostly presentational. They use mapped models only and never read raw API fields.
5. Forms: build initial values and validation from the same DTO schema.
6. Page: compose the feature into a route-level screen in src/pages/.
7. Styling: use Tailwind and design tokens, with no inline styles.
8. Tests: Vitest and React Testing Library beside each file, plus a mapper test with a sample payload.

## Hard rules
- Imports go one way: pages, then features, then shared. Features never import each other.
- Field names are declared only in the DTO. When a field changes, update the DTO, its mapper, the back-end DTO and docs/api-contract.md, and nothing else.
- Local state first, TanStack Query for server data, Context or Zustand only for app-wide state.
- Semantic HTML, labelled inputs and keyboard support.
- Env values only through config.js. No secrets committed.
- Use index.js only as a feature's public export.

## Before finishing
- Run ESLint, Prettier and the full test suite and fix failures.
- Check import boundaries and that no component reads raw API fields.
