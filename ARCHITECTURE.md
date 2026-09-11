# Architecture

**Status:** Accepted  
**Date:** 2026-09-02  
**Scope:** Pick Two product and deployment architecture

## 1. Decision

This project will contain two deliberately separate web surfaces:

- A statically generated Astro marketing site for public, indexable content.
- A client-rendered React product application and JSON API deployed together as one Cloudflare Worker. The Worker serves the Vite-built product application, routes `/api/*` through Hono, and persists relational data in Cloudflare D1.

The repository will be a Vite+ workspace because the marketing site and product application are independently deployable. Vite+ remains the primary toolchain and task runner. The Astro site is built as static output and deployed with Cloudflare Workers Static Assets; it has no Worker script or runtime bindings. Cloudflare's Vite plugin supplies the product application's Workers runtime, asset integration, bindings, preview, and deployment build.

The initial production stack is:

- Astro with static output for the marketing site.
- React 19, Tailwind CSS, and shadcn/ui for the product application.
- TanStack Router for type-safe client-side routing.
- TanStack Query for remote server-state management.
- Hono for the Worker HTTP API.
- Hono RPC plus Zod validation for the typed client/API boundary.
- D1 with Drizzle ORM for relational persistence and versioned SQL migrations.
- Better Auth for email/password, Google OAuth, and email OTP authentication.
- Resend for transactional authentication email.
- Cloudflare's Vitest integration for Worker and D1 tests, plus Playwright for critical browser flows.
- GitHub Actions for validation, migration, and controlled staging and production deployment.

Neither surface uses server-side rendering. Astro generates the public marketing pages at build time, so SEO, metadata, social previews, documentation, and content pages do not impose SSR complexity on the authenticated product. The React product remains a client-rendered SPA. SSR will be reconsidered only if public, request-time rendering becomes a demonstrated product requirement.

## 2. Goals

- Optimize for fast hackathon delivery without creating a disposable architecture.
- Support a single-tenant SaaS product with conventional relational data.
- Give public content a fast, indexable, content-oriented home without SSR.
- Keep frontend, API, authentication, and storage type-safe.
- Make local development behave like the Workers runtime.
- Maintain isolated local, staging, and production data.
- Allow optional Cloudflare services to be added without restructuring the core.
- Keep deployment understandable and recoverable by a small team.

## 3. Non-goals

- Server-side rendering or React Server Components.
- Dynamic server behavior or runtime bindings in the marketing site.
- Microservices beyond the static marketing deployment and full-stack product Worker.
- Multi-tenancy or one database per customer.
- Offline-first synchronization.
- A generic repository abstraction over D1.
- R2, KV, Queues, Durable Objects, Workflows, Vectorize, or Workers AI before a feature requires them.
- Supporting a second cloud runtime through portability layers.

## 4. System topology

```text
Public visitor
  `-- example.com ------------> Astro static assets
                                  `-- CTA --> app.example.com

Product user
  `-- app.example.com --------> Product Cloudflare Worker
                                  |-- SPA routes --> Vite assets
                                  |-- /api/auth/* --> Better Auth
                                  `-- /api/* ------> Hono
                                                       |-- services
                                                       |-- Drizzle --> D1
                                                       `-- Resend API
```

The product browser always calls relative `/api` URLs, so the product application and API share an origin in every environment. CORS is disabled by default, authentication uses host-only first-party cookies, and the marketing origin receives no product session cookie. No public browser code knows a D1 identifier or service credential.

The marketing site links to the environment-appropriate product origin. It does not call authenticated product APIs. A future interactive lead or contact form must either use a dedicated third-party form endpoint or a narrowly scoped unauthenticated product endpoint with an explicit marketing-origin allowlist; it must not cause product CORS to be enabled globally.

Cloudflare asset routing must run the Worker first for `/api/*` and use SPA fallback handling for all unmatched application paths.

## 5. Repository structure

```text
pick-two/
|-- apps/
|   |-- marketing/
|   |   |-- src/
|   |   |   |-- components/       # Astro-first presentation components
|   |   |   |-- content/          # Blog/docs content collections
|   |   |   |-- layouts/
|   |   |   `-- pages/            # Marketing, legal, blog, docs
|   |   |-- astro.config.ts        # Static output
|   |   |-- wrangler.jsonc         # Static Assets deployment
|   |   `-- package.json
|   `-- product/
|       |-- src/
|       |   |-- app/               # Providers, router, app shell
|       |   |-- routes/            # Route-local UI, data, schemas, and tests
|       |   |-- components/        # Shared, domain-neutral compositions
|       |   |   `-- ui/            # Low-level shadcn primitives
|       |   `-- lib/               # API, auth, and query clients
|       |-- worker/
|       |   |-- index.ts           # Worker module export
|       |   |-- app.ts             # Hono composition and AppType
|       |   |-- auth.ts
|       |   |-- routes/
|       |   |-- middleware/
|       |   |-- services/
|       |   `-- db/                # Client, schema, and queries
|       |-- shared/contracts/      # Product/API Zod contracts
|       |-- drizzle/               # Committed SQL migrations
|       |-- test/                  # Worker-runtime tests
|       |-- e2e/                   # Product Playwright tests
|       |-- wrangler.jsonc
|       `-- package.json
|-- packages/
|   `-- brand/                     # Framework-neutral tokens and assets
|-- vite.config.ts                 # Workspace checks and tasks
|-- pnpm-workspace.yaml
`-- package.json
```

The existing application moves into `apps/product`; it is not rewritten. The marketing site is created independently in `apps/marketing`. Shared code is intentionally limited to framework-neutral brand tokens, fonts, and assets. React UI components are not forced into Astro, and Astro components are not imported by the product.

The product frontend uses route-first organization. Each directory under `apps/product/src/routes` owns its page component and any route-local components, queries, mutations, schemas, and tests. Shared, domain-neutral component compositions belong directly under `components`; low-level shadcn primitives belong in `components/ui`. Application-wide providers and shell code belong in `app`; API, authentication, and query-client infrastructure belong in `lib`.

A `features` directory is not created preemptively. A coherent business capability moves from a route into `features/<name>` only after it is used by multiple routes or needs an explicit independent boundary. Features may import `components/ui`, but generic UI primitives must never import product features.

Server route handlers do not contain business logic. The server flow is:

```text
route -> validate -> authenticate/authorize -> service -> database -> typed response
```

The product frontend may import `AppType` with `import type` and shared Zod contracts. It must never import Worker implementations, database clients, schemas containing secrets, or server-only dependencies at runtime. The marketing site does not depend on product server packages.

## 6. Marketing site design

Astro owns all public acquisition and informational content:

- Home, pricing, features, use cases, and comparison pages.
- Blog, changelog, documentation, and legal pages when introduced.
- Canonical URLs, metadata, Open Graph/Twitter cards, sitemap, and robots policy.
- Structured data where it accurately describes the page content.

Astro uses its default static output. The Cloudflare Astro adapter is not installed because the site has no on-demand rendering. Pages are generated during the build and deployed as Workers Static Assets with `404-page` fallback behavior.

Components are `.astro` components by default. Client-side JavaScript is added only for an interaction that cannot be expressed with HTML and CSS. If an island is required, the smallest appropriate component is hydrated; the marketing site does not mount a site-wide React application.

Content collections provide typed frontmatter for blog or documentation content. Content starts in the repository. A CMS is introduced only when non-developers need an editorial workflow.

## 7. Product Worker and API design

`apps/product/worker/index.ts` exports the Hono application directly in Workers module format. There is no Node HTTP server and no `@hono/node-server` dependency.

API conventions:

- All application endpoints live under `/api`.
- Better Auth owns `/api/auth/*` and is registered before fallback routes.
- `GET /api/health` reports process availability without querying D1.
- `GET /api/ready` performs the smallest useful D1 query.
- Every external input is validated by Zod at the route boundary.
- Every protected route obtains the session from common middleware.
- Authorization is checked in services, close to the business operation.
- Expected failures use stable error codes and appropriate HTTP status codes.
- Unexpected failures return `{ "error": { "code", "message", "requestId" } }` without stack traces or internal details.
- Every request receives a request ID, returned in a response header and included in logs.

Hono's inferred `AppType` is the internal API contract. OpenAPI generation is deferred until the API must be consumed by third parties.

## 8. Data architecture

D1 is the system of record for users, sessions, account links, verification records, and application data. Drizzle's SQLite dialect and D1 driver are used directly against the `DB` binding.

Data rules:

- Drizzle schema files are the schema source of truth.
- Generated SQL migrations are committed to Git and reviewed.
- Local, staging, and production each use isolated D1 state.
- Staging and production use separate Cloudflare D1 databases and IDs.
- Migrations are applied explicitly before deploying application code.
- Production migrations follow expand-and-contract changes so the previous and next application versions can both run during deployment.
- Destructive migrations are never combined with the code release that stops using the old structure.
- Application IDs are opaque text UUIDs generated with Web Crypto.
- Application timestamps use integer Unix milliseconds and are converted at boundaries.
- Foreign keys are declared and enforced.
- Columns used for lookups, joins, ordering, or authorization filters are indexed.
- Related write statements use D1 batching when they must succeed or fail as one logical operation.
- Large backfills are processed in bounded batches, never in an HTTP request.

D1 is accepted for the target workload: an MVP or ordinary read-heavy SaaS application. A single D1 database is limited to 10 GB on the paid plan and processes queries serially; schema and query efficiency therefore matter. The architecture must be reconsidered if sustained writes, database size, or query latency approach platform limits. The preferred escape hatch is managed PostgreSQL through Hyperdrive, not an application-wide storage abstraction created in advance.

## 9. Authentication and email

Better Auth is the sole authentication authority and stores its tables in D1 through the Drizzle SQLite adapter.

Supported methods:

- Email and password.
- Google OAuth.
- Email OTP for sign-in and email verification.

Authentication policy:

- Email/password registration requires email verification.
- Email verification uses OTP rather than verification links.
- OTPs expire after five minutes, allow three verification attempts, and are stored as hashes rather than plaintext.
- OTP issuance is rate-limited by both normalized email address and client IP.
- Authentication responses do not reveal whether an email address is registered.
- Google credentials, Better Auth secrets, and Resend credentials are Worker secrets, never Wrangler `vars` or Vite environment variables.
- Session cookies are `HttpOnly`, `Secure` outside local development, `SameSite=Lax`, and host-only to the product origin.
- No custom account linking is performed from an unverified email address.
- State-changing endpoints rely on same-origin cookies and Better Auth's origin protections; new cross-origin clients require an explicit security review.

Resend is the initial email transport. OTP delivery is scheduled with the Worker execution context so the HTTP response does not wait on the provider and does not leak account state through timing. A Queue is added only when delivery retries, rate smoothing, or an audit trail become product requirements.

Better Auth manages password recovery; Resend delivers reset links. Tokens travel in URL fragments and reset request bodies to keep them out of HTTP request URLs. Recovery uses the existing origin checks and rate limits. Password resets preserve email verification status.

The Worker enables the narrowest compatibility flag supported by Better Auth. `nodejs_als` is preferred when AsyncLocalStorage is the only required Node compatibility feature; `nodejs_compat` is used if the chosen dependency set requires additional compatibility.

## 10. Cloudflare resource policy

Only the product Worker has runtime bindings, and only D1 is mandatory in the initial product. The marketing deployment is static and has no bindings. Additional product bindings are introduced feature by feature:

| Requirement                                 | Service         | Admission rule                                           |
| ------------------------------------------- | --------------- | -------------------------------------------------------- |
| User uploads or generated files             | R2              | Add when the first blob is persisted.                    |
| Deferred email, webhooks, or retryable jobs | Queues          | Add when work must survive the request lifecycle.        |
| Scheduled maintenance                       | Cron Triggers   | Add when the first scheduled operation exists.           |
| Realtime coordination or WebSockets         | Durable Objects | Add when globally ordered per-entity state is required.  |
| Read-mostly cache or configuration          | KV              | Add only when eventual consistency is acceptable.        |
| Long-running multi-step operations          | Workflows       | Add when durable orchestration and retries are required. |

Business records, authorization state, and revocable sessions remain in D1. KV is not used as an authoritative store for data that requires immediate consistency.

## 11. Environments and configuration

Both deployables define local, staging, and production environments:

- **Local:** Astro runs locally on its own port. The product runs in workerd with locally simulated, persistent D1 data. Product secrets live in an ignored development secrets file.
- **Staging:** Marketing uses `staging.example.com`; product uses `app-staging.example.com` with its own D1 database, Google OAuth client, and Resend configuration.
- **Production:** Marketing uses `example.com`; product uses `app.example.com` with its production D1 database, OAuth client, email domain, and secrets. `www.example.com` redirects permanently to `example.com`.

Each deployable owns its Wrangler configuration and Cloudflare Worker name. Product bindings and variables are declared separately for staging and production because Wrangler environment bindings are non-inheritable. `wrangler.jsonc` is the source of truth for non-secret configuration. `wrangler types` generates the binding types consumed by product Worker code.

The browser receives only explicitly public Vite variables. Secrets are accessed exclusively from the Worker environment. Configuration is validated at the boundary where the application is composed, and startup fails clearly in development or tests when required bindings are missing.

## 12. Vite+ integration

Vite+ remains mandatory at the workspace root for dependency installation, formatting, linting, type checking, testing orchestration, and task execution. Workspace dependency edges and Vite+ tasks provide ordered, cacheable builds without coupling the two deployments.

The marketing package uses Astro's Vite-based static build. The product package uses the existing React, Babel/React Compiler, and Tailwind plugins; the Cloudflare Vite plugin is added to its lazy plugin list and owns Worker/runtime integration.

The Cloudflare plugin currently accepts Vite 6, 7, or 8, while the repository's Vite+ release bundles Vite 8. This combination must pass an explicit compatibility gate before the toolchain is considered ready:

- Development starts in workerd and can access local D1.
- Production build emits both Worker and static asset output.
- Preview runs the production build in the Workers runtime.
- Worker-runtime Vitest tests execute with D1 bindings.
- Deployment succeeds from the generated build configuration.
- The root can build and check both workspace applications independently.

If a verified incompatibility exists, Vite+ remains the root toolchain and task runner, while only the Cloudflare application build uses a stock Vite package in an isolated workspace package. The project does not abandon Vite+ preemptively.

## 13. Testing architecture

Tests are divided by boundary:

- Pure unit tests cover services, authorization rules, and contract transformations.
- Worker integration tests run through `@cloudflare/vitest-plugin` in workerd with isolated D1 storage.
- Migration tests apply every migration to an empty local D1 database.
- API tests call the Hono/Worker fetch entry point and assert status, body, cookies, and database effects.
- Playwright covers registration, verification, password sign-in, Google sign-in initiation, OTP sign-in, sign-out, and one representative protected workflow.
- Marketing tests validate generated routes, metadata, sitemap, internal links, and the CTA destination.

External email and OAuth network calls are replaced with boundary fakes in automated tests. Tests assert that the correct message or redirect would be sent without relying on third-party availability.

## 14. CI/CD decision

GitHub Actions is selected instead of deployment directly from Cloudflare Builds. The reason is operational sequencing: the workspace requires shared checks, two path-aware deployments, migration verification, environment-specific D1 migrations, and production approval in one visible workflow.

The delivery flow is:

```text
Pull request
  -> install
  -> format/lint/type check
  -> unit and Worker integration tests
  -> marketing route, metadata, and link tests
  -> apply migrations to an empty local D1 database
  -> build both applications

Merge to main
  -> repeat required checks
  -> apply staging D1 migrations
  -> deploy changed applications to staging
  -> smoke test both sites and product health endpoints

Production release
  -> GitHub Environment approval
  -> apply production D1 migrations
  -> deploy the exact verified commit for both applications
  -> smoke test both domains
```

Production is never deployed directly from an unreviewed pull request. Staging deploys automatically from `main`; production requires manual approval through a protected GitHub Environment. Path filters may skip an unaffected deployment, but a production release always records the versions of both surfaces. Cloudflare credentials are stored as GitHub environment secrets with the smallest necessary API token permissions.

Failures stop the pipeline. A migration failure prevents deployment. A post-deployment smoke-test failure triggers investigation and an application rollback; database recovery uses a forward fix or D1 Time Travel only after the impact is understood.

## 15. Security and observability

The Worker applies secure response headers, a restrictive Content Security Policy, body-size limits, and endpoint-specific rate limits. Logs are structured JSON and include environment, request ID, route, status, duration, and safe error codes. Passwords, OTPs, cookies, authorization headers, OAuth codes, request bodies, and secrets are never logged.

Cloudflare observability is enabled in staging and production. Authentication failures, rate-limit events, Worker exceptions, D1 errors, and email-provider failures are measurable. Health endpoints disclose no secrets, version graph, or database contents.

The marketing site uses a separate Content Security Policy appropriate for a static public site. It has no authentication secrets, product cookies, D1 access, or privileged service bindings.

## 16. Consequences

This architecture gives public content the SEO and performance benefits of static generation while keeping the authenticated product simple and client-rendered. It is fast to use at a hackathon and has a clear path into an early SaaS product. The tradeoffs are deliberate: there are two deployments, shared presentation components are limited, there is no SSR, D1 is unsuitable for an indefinitely growing write-heavy database, and the product is coupled to Cloudflare bindings.

The two-domain split is accepted because it creates a durable boundary between acquisition content and the application. Product API and authentication remain same-origin, while marketing can evolve independently without pulling an application framework into content pages. New services are added only in response to concrete product requirements.

## 17. References

- [Astro on Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)
- [Cloudflare routes and custom domains](https://developers.cloudflare.com/workers/configuration/routing/)
- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [React SPA with an API on Workers](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Cloudflare storage selection](https://developers.cloudflare.com/workers/platform/storage-options/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Drizzle with Cloudflare D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)
- [Hono RPC](https://hono.dev/docs/guides/rpc)
- [Better Auth with Hono](https://better-auth.com/docs/integrations/hono)
- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- [Better Auth email OTP](https://better-auth.com/docs/plugins/email-otp)
- [Resend with Cloudflare Workers](https://resend.com/docs/send-with-cloudflare-workers)
