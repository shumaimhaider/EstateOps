Layers, innermost to outermost.

domain/ holds entities and business rules. It imports nothing from the other layers or from any framework.
application/ holds use cases (one per file, like CreateLease.js) and the interfaces for repositories and external services. It imports only domain/.

infrastructure/ holds database repositories, ORM models, external API clients and email or storage adapters. It implements the interfaces from application/.


interfaces/ (or presentation/) holds routes, controllers, request validation and response mapping. It calls use cases only.

Dependency rule. Source code dependencies point inward only. Inner layers never import outer ones. Enforce it with ESLint import/no-restricted-paths.

Folders. Group by feature first, then by layer: src/<feature>/domain|application|infrastructure|interfaces. A src/main/ composition root wires everything together.

Use cases. One class or function per use case, with plain input and output objects. No req, res, ORM models or SQL inside them.

Repositories. Define the contract in application/, implement it in infrastructure/. Return domain entities, never raw database rows.

Dependency injection. Pass dependencies in through constructors or factories, wired only in the composition root. No hidden imports of database clients inside use cases.

Entities. They own their validation and invariants. No framework decorators or ORM code on them.

Errors. Domain and application layers throw domain-specific errors. The interfaces layer maps them to HTTP status codes in one place.

Testing. Unit-test involves db domain and use cases with in-memory fakes and no database. Integration-test infrastructure against a real database. Test controllers with Supertest.

Frameworks stay at the edge the ORM and the logger are details in the outer layers and can be swapped without touching business logic.