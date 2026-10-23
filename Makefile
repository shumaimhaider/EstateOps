# EstateOps: one place for every command.   make help
COMPOSE ?= $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo docker-compose)
BACKEND := Backend
MGMT    := EstateOpsManagementPortalUI
CUST    := EstateOpsCustomerPortalUI

.DEFAULT_GOAL := help
.PHONY: help init init-mock up up-mock up-kafka down destroy build logs ps tenant collect-now \
        install lint format test test-backend test-mgmt test-cust test-e2e test-ui-e2e test-load \
        migrate db-status db-lock dev-mgmt dev-cust check-env

help: ## show this list
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---- configuration -----------------------------------------------------------------------
init: ## create .env from env.example and generate its secrets (keeps values you set)
	@node scripts/init-env.mjs

init-mock: ## same, and use built-in Stripe/PandaDoc/S3 stand-ins (no outside accounts needed)
	@node scripts/init-env.mjs --mock

check-env:
	@test -f .env || (echo "No .env yet. Run 'make init' (real accounts) or 'make init-mock' (stand-ins)." && exit 1)

# ---- run everything in Docker --------------------------------------------------------------
up: check-env ## build and start everything (databases, 6 services, gateway, both portals)
	$(COMPOSE) up -d --build
	@echo "\nManagement portal  http://localhost:$${MANAGEMENT_PORTAL_PORT:-5173}\nCustomer portal    http://localhost:$${CUSTOMER_PORTAL_PORT:-5174}\nAPI gateway        http://localhost:$${GATEWAY_PORT:-8080}\nFirst time? make tenant"

up-mock: check-env ## start everything plus the built-in Stripe/PandaDoc/S3 stand-ins
	$(COMPOSE) --profile mock up -d --build

up-kafka: check-env ## start everything with Kafka (set EVENT_TRANSPORT=kafka in .env)
	$(COMPOSE) --profile kafka up -d --build

down: ## stop everything (data is kept)
	$(COMPOSE) --profile mock --profile kafka down

destroy: ## stop everything AND delete all data
	$(COMPOSE) --profile mock --profile kafka down -v

build: check-env ## build all images without starting
	$(COMPOSE) --profile mock build

logs: ## follow the logs (S=billing for one service)
	$(COMPOSE) logs -f --tail=100 $(S)

ps: ## what is running
	$(COMPOSE) ps

# ---- first use --------------------------------------------------------------------------
SLUG ?= demo
NAME ?= Demo Developer
CURRENCY ?= PKR
OWNER_EMAIL ?= owner@demo.test
OWNER_NAME ?= Owner
OWNER_PASSWORD ?= ChangeMe-12345
tenant: check-env ## create a developer and its owner: make tenant SLUG=pk OWNER_EMAIL=you@x.com OWNER_PASSWORD=...
	@$(COMPOSE) exec -T -e SLUG="$(SLUG)" -e NAME="$(NAME)" -e CURRENCY="$(CURRENCY)" -e OWNER_EMAIL="$(OWNER_EMAIL)" \
	  -e OWNER_NAME="$(OWNER_NAME)" -e OWNER_PASSWORD="$(OWNER_PASSWORD)" identity node --input-type=module -e '\
	const e = process.env; \
	const r = await fetch("http://127.0.0.1:8080/internal/tenants", { method: "POST", headers: { "content-type": "application/json", "x-internal-token": e.INTERNAL_TOKEN, "x-bootstrap-token": e.BOOTSTRAP_TOKEN }, \
	  body: JSON.stringify({ slug: e.SLUG, name: e.NAME, currency: e.CURRENCY, locale: "en", time_zone: "UTC", area_unit: "sq_ft", owner: { email: e.OWNER_EMAIL, name: e.OWNER_NAME, password: e.OWNER_PASSWORD } }) }); \
	const b = await r.json(); \
	if (r.status !== 201) { console.error(JSON.stringify(b)); process.exit(1); } \
	console.log("Developer created. Sign in as", e.OWNER_EMAIL, "with the password you gave.\nAuthenticator secret (add it to an authenticator app, it is shown once):", b.owner.totp_secret);'

collect-now: check-env ## run the automatic card collection now instead of waiting for the daily time
	@$(COMPOSE) exec -T billing node -e 'fetch("http://127.0.0.1:8080/internal/jobs/collect", { method: "POST", headers: { "x-internal-token": process.env.INTERNAL_TOKEN, "content-type": "application/json" }, body: "{}" }).then((r) => r.text()).then(console.log)'

# ---- databases ---------------------------------------------------------------------------
migrate: check-env ## apply database migrations (also done automatically on `make up`)
	$(COMPOSE) run --rm migrate

db-status: check-env ## which migrations are applied
	$(COMPOSE) run --rm migrate node db/migrate.js status

db-lock: ## after adding a migration file: record its checksum
	cd $(BACKEND) && npm run db:lock

# ---- development ------------------------------------------------------------------------
install: ## install all dependencies (back end and both portals)
	cd $(BACKEND) && npm ci
	cd $(MGMT) && npm ci
	cd $(CUST) && npm ci
	cd e2e-ui && npm ci && npx playwright install chromium

dev-mgmt: ## management portal with hot reload (port 5173), talking to the running stack (make up)
	cd $(MGMT) && npm run dev

dev-cust: ## customer portal with hot reload (port 5174), talking to the running stack (make up)
	cd $(CUST) && npm run dev

lint: ## lint everything
	cd $(BACKEND) && npm run lint
	cd $(MGMT) && npm run lint
	cd $(CUST) && npm run lint

format: ## format everything
	cd $(BACKEND) && npm run format
	cd $(MGMT) && npm run format
	cd $(CUST) && npm run format

# Tests that use PostgreSQL need TEST_DATABASE_URL (a local test server, never a real one).
test: test-backend test-mgmt test-cust ## all unit tests

test-backend: ## back-end unit + database tests
	cd $(BACKEND) && npm test

test-mgmt: ## management portal tests
	cd $(MGMT) && npm test -- --run

test-cust: ## customer portal tests
	cd $(CUST) && npm test -- --run

test-e2e: ## back-end end-to-end journeys (real processes and databases)
	cd $(BACKEND) && npm run test:e2e

test-ui-e2e: ## both portals in a real browser against the real back end, at phone, tablet and desktop sizes
	cd e2e-ui && npm test

test-load: ## load test (see Backend/load)
	cd $(BACKEND) && npm run load
