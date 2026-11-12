// Einstieg für Cloudflare Workers: npm run deploy
// Variablen und Secrets aus wrangler.toml / `wrangler secret put` stehen dank
// "nodejs_compat" unter process.env bereit – derselbe Code wie unter Node.
// LimitZaehler zählt Nachrichten pro Besucher über alle Cloudflare-Server hinweg.
// UnterlagenAblage speichert Bewerbungsunterlagen vom Bewerber-Chat (/jobs/).
// CrmDaten ist die Datenbank des internen Vertriebs-CRM (/crm); der Zeitplan
// (alle 10 Minuten, siehe [triggers] in wrangler.toml) lässt den Akquise-Bot laufen.
import { app } from "./app.ts";
import { geplant } from "./crm/routen.ts";
import { speicherVon } from "./speicher/schnittstelle.ts";
import { leseFaellige } from "./website.ts";
export { LimitZaehler } from "./limit-do.ts";
export { UnterlagenAblage } from "./ablage-do.ts";
export { CrmDaten } from "./crm/do.ts";
// KundenDaten: Konfiguration, Anfragen, Bewerbungen und Zahlen aller Kunden (Admin-Panel unter /admin)
export { KundenDaten } from "./speicher/cloudflare.ts";
export default {
  fetch: (req: Request, env: any, ctx: any) => app.fetch(req, env, ctx),
  scheduled: (_e: unknown, env: any, ctx: any) => {
    ctx.waitUntil(geplant(env).then((b) => console.log("[crm-zeitplan]", JSON.stringify(b))).catch((e) => console.error("[crm-zeitplan]", e?.message || e)));
    // Einmal pro Stunde: Websites der Kunden einlesen, bei denen der letzte Versuch länger als 24 Stunden her ist
    // (je Lauf höchstens 3 Kunden, damit ein Lauf nie zu viele Abrufe macht).
    if (new Date().getUTCMinutes() < 10 && process.env.KILL_SWITCH !== "1") {
      ctx.waitUntil(leseFaellige(speicherVon({ env })).then((b) => (b.gelesen.length || b.fehler.length) && console.log("[website-lesen]", JSON.stringify(b))).catch((e) => console.error("[website-lesen]", e?.message || e)));
    }
  },
};
