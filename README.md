# scaffold

Pick Two: a group-ranking app built with React, Cloudflare Workers, and D1.
Managed with Vite+. See [PRODUCT.md](./PRODUCT.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).

## Development

```sh
vp install
cd apps/product
vp run db:migrate:local
cd ../..
vp dev
```

## Database changes

From `apps/product`, after editing `worker/db/schema.ts`:

```sh
vp run db:generate
vp run db:migrate:local
```

Commit the generated migrations and metadata. Run `vp run typegen` after changing Worker bindings.

## Validation

```sh
vp check
vp test
vp run -r build
```
