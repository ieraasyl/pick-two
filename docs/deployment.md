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
