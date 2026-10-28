// Einstieg für Cloudflare Workers: npm run deploy
// Variablen und Secrets aus wrangler.toml / `wrangler secret put` stehen dank
// "nodejs_compat" unter process.env bereit – derselbe Code wie unter Node.
// LimitZaehler zählt Nachrichten pro Besucher über alle Cloudflare-Server hinweg.
import { app } from "./app.ts";
export { LimitZaehler } from "./limit-do.ts";
export default app;
