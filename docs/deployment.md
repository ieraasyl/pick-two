# Staging deployment

The GitHub `staging` environment requires a `CLOUDFLARE_ACCOUNT_ID` variable and a
`CLOUDFLARE_API_TOKEN` secret with Workers Scripts and D1 edit permissions.

Store staging's `BETTER_AUTH_SECRET` and `RESEND_API_KEY` in the ignored
`apps/product/.dev.vars.staging` file. On first deployment, add
`--secrets-file .dev.vars.staging` to the deploy command. Later deployments preserve Worker secrets.

For manual deployment, run from `apps/product` with the Cloudflare credentials above set:

```sh
vp run build:staging
vp run db:migrate:staging
vp exec wrangler deploy --config dist/scaffold_product/wrangler.json
vp run smoke https://scaffold-product-staging.ieraasyl.workers.dev
```

Staging is selected at build time. Run `vp run build` to return to the local build.

The default sender, `onboarding@resend.dev`, can send only to your Resend account's email.
For other recipients, [verify a domain in Resend](https://resend.com/docs/dashboard/domains/introduction)
and update staging's `AUTH_EMAIL_FROM` in `wrangler.jsonc`.

## Production

Production uses `scaffold-product-production.ieraasyl.workers.dev` and a separate D1 database.
Configure the same GitHub credentials in the `production` environment, restricted to `main`.
Keep its distinct auth secret and Resend key in `.dev.vars.production`. Bootstrap Worker secrets
with `vp exec wrangler secret bulk .dev.vars.production --env production` from `apps/product`.

Run **Release production** manually with the numeric run ID of a successful staging workflow.
It verifies that validation and staging deployment passed, checks out that exact commit,
applies production migrations, deploys, and runs smoke checks. Never use a PR run ID.
The default Resend sender still restricts delivery to the account owner's email.

For an application rollback, run from `apps/product`:

```sh
vp exec wrangler deployments list --env production
vp exec wrangler rollback <version-id> --env production --message "Reason for rollback"
vp run smoke https://scaffold-product-production.ieraasyl.workers.dev
```

Choose a previous version compatible with the current schema. Worker rollback does not undo
D1 migrations; use a forward database fix when needed. There is no rollback before the first release.
