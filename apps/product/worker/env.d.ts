// Secrets are supplied through .dev.vars locally and Wrangler secrets when deployed.
interface AuthSecrets {
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
interface Env extends AuthSecrets {}
declare namespace Cloudflare {
  interface Env extends AuthSecrets {}
}
