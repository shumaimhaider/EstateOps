# EstateOps customer portal (buyer screens)

Common domain: `/CLAUDE.md`. Rules: `/.claude/rules/frontend.md`. Same stack and layering as the
management portal (React JS, Tailwind, TanStack Query, Formik + Zod), port 5174. It always talks to the real API.

## What a customer can do

- Sign in with developer short name, email and password; reset or set a password from an emailed link.
- See their own properties and totals; open one for its payment schedule, contracts and card payments.
- Pay an invoice (all or part): saved card in one step, or Stripe's embedded form (optionally saving the card).
- Keep several saved cards, exactly one active; add, switch, remove.
- Sign a contract on screen (PandaDoc embedded) and download the signed copy.
- Ask support about their account or a property and follow the replies.
- Change their password (signs out everywhere).

## Rules the screens follow

- Everything is the signed-in customer's own; the server answers 404 for anything else.
- The server decides what is payable/signable (`payable`, `can_sign`, `can_download`); screens only show those actions.
- Card numbers are typed only into Stripe's form. With VITE_STRIPE_UI=stand_in our own form posts to a stand-in Stripe server (tests, demos).
- ID numbers are masked. Money is whole minor units plus currency.
- Features never import each other; pages compose them (`src/pages`). The API is reached only through each feature's `data/` layer.

## Run

`make up-mock` starts the whole system (back end, stand-in Stripe/PandaDoc/S3), then `npm run dev` here (proxies /api to the gateway). Create a developer with `make tenant`, a customer in the management portal, and open the emailed invite link (with the stand-in mail setup the link is in the identity container logs).
`npm test` (unit tests), `npm run lint`, `npm run build`. Browser tests of every screen run in `/e2e-ui` against the real back end. Settings: `env.example`.
