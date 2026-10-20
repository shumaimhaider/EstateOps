---
name: backend
description: Use when adding or changing back-end code in EstateOps (use cases, repositories, routes, controllers, migrations, API tests). Follows Clean Architecture
---

# Back-end skill

Read rules/backend.md first. Follow it exactly.

## When to use
Any task touching src/<feature>/domain, application, infrastructure or interfaces, the database schema, or API endpoints.

## Adding a feature or endpoint
1. Domain: add or update the entity and its invariants. No framework imports.
2. Application: write one use case per file with plain input and output objects. Define any repository interface it needs.

3. Infrastructure: implement the repository, return domain entities, add a migration if the schema changes.

4. Interfaces: add the route, validation schema and controller. The controller only calls the use case and maps the result or error.

5. Wire the new pieces in the composition root (src/main/).

6. Add tests: unit tests for domain and use case with in-memory fakes, Supertest test for the endpoint.

## Hard rules
- Dependencies point inward only. Never import an outer layer from an inner one.
- No req, res, ORM models or SQL inside use cases or domain.
- Validate all input at the edge. Map errors to HTTP codes in one place.
- Never use console.log or commit secrets. Config only through the config module.

DTO and docs/api-contract.md, and nothing else.
- Response DTOs list allowed fields explicitly so new entity fields are never exposed by accident.
- Validate all input at the edge. Map errors to HTTP codes in one place.
- Never use console.log or commit secrets. Config only through the config module.


## Before finishing
- Run lint, format and the full test suite and fix failures.
- Check that new imports respect the layer boundaries.
- Summarize what changed, including any migration.