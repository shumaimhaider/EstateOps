# End-to-end tests

`npm run test:e2e` starts the whole system for each test file and drives it only through its public API.

- **Real processes.** Six services and the gateway run as separate Node processes on free ports.
- **Real databases.** Each service gets its own freshly migrated database on `TEST_DATABASE_URL`
  (a local server only). The names carry the run id and every one is dropped when the run ends,
  also after a crash (stale ones from earlier crashed runs are swept at the start).
- **Seeded through the API.** A journey bootstraps its own tenant, staff (with real two-step
  sign-in), projects, units, plans and customers, so journeys never share data.
- **Providers are mocks with the real wire format.** Stripe, PandaDoc and an S3-compatible bucket
  (`@estateops/mock-providers`) call back into the gateway's webhooks; S3 URLs are signature-checked.
- **Emails** are read from the services' console mailer output (`stack.mails`).

| Variable            | Effect                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TEST_DATABASE_URL` | PostgreSQL admin URL (required).                                                                                                                 |
| `E2E_REDIS_URL`     | e.g. `redis://localhost:56379/14`. Turns on the cache and shared rate limits. Must name a database other than 0; it is emptied before and after. |
| `E2E_KAFKA_BROKERS` | e.g. `localhost:59092`. Switches the event transport from HTTP to Kafka.                                                                         |

`docker compose -f docker-compose.e2e.yml up -d` provides Postgres, Redis and Kafka.

Journeys (`e2e/journeys`): booking and manual payments, card payments and saved cards, the daily
collection scan and payment worker, overdue fines and escalations, the customer portal, contracts
and PandaDoc signing, files by signed URL, security and tenancy, outages and saga rollback.
`stack.kill(service)` / `stack.revive(service)` simulate a crash. A failed journey prints the errors
the services logged while it ran.

## Browser tests of both portals (real data)

`/e2e-ui` (`make test-ui-e2e`) builds both portals for the real API, starts this same stack, and
drives them in Chromium: staff sign-in with the authenticator code, every staff screen, paying by
hand and by card, the daily collection history, the customer portal (invite, pay, saved cards,
support, password reset), PandaDoc signing in the embedded page, uploads to the bucket by signed
URL, and every screen at phone, tablet and desktop widths with an accessibility scan.
The portals have no mock mode: they always talk to the gateway.
