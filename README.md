# scaffold

Pick Two: a group-ranking app built with React, Cloudflare Workers, and D1, managed with Vite+.
See [PRODUCT.md](./PRODUCT.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).

## Setup

```sh
vp install
cd apps/product
cp .dev.vars.example .dev.vars
```

Set `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`) and `RESEND_API_KEY` in
`.dev.vars`. In `wrangler.jsonc`, set `AUTH_EMAIL_FROM` to a verified Resend sender and
`BETTER_AUTH_URL` to your exact app origin (default: `http://localhost:5173`).

```sh
vp run db:migrate:local
cd ../..
vp dev
```

## Database

From `apps/product`, after editing the Drizzle schema:

```sh
vp run db:generate
vp run db:migrate:local
```

Commit migrations and metadata. Run `vp run typegen` after changing Worker bindings.

## Validation

```sh
vp check
vp test
vp run -r build
cd apps/product
vp run test:browser
```
