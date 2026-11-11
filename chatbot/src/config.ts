// Lädt Konfiguration, Wissensbasis und Preisliste genau einmal beim Start.
// Daten kommen aus src/daten.generated.ts (erzeugt aus config/ und data/),
// damit der Code auch ohne Dateisystem (Cloudflare Workers) läuft.
import { CONFIG, PREISE, WISSEN } from "./daten.generated.ts";

import { baueLaufzeit, setzeStandard, aktuell, sicht, type Paket, type Preisliste } from "./kontext.ts";
export type { Paket, Kategorie, Preisliste } from "./kontext.ts";

// Standard-Kunde: Prime Detailing, beim Bauen eingebacken (Preise aus dem Website-CMS).
export const STANDARD_KUNDE = "prime-detailing";
setzeStandard(baueLaufzeit(STANDARD_KUNDE, CONFIG, WISSEN, PREISE as any));

// „Sichten“ auf den Kunden, dessen Anfrage gerade läuft (siehe kontext.ts).
// Ohne Kunden-Kontext zeigen sie den Standard-Kunden.
export const config: any = sicht(() => aktuell().config);
export const preise: Preisliste = sicht(() => aktuell().preise);
export const allePakete: Paket[] = sicht(() => aktuell().allePakete, true);
/** Feste Texte – passend zur Anrede (du/Sie), einzeln überschreibbar über config.texte */
export const texte: Record<string, string> = sicht(() => aktuell().texte) as any;
export const wissen = (): string => aktuell().wissen;

// Geheimes Erkennungswort im System-Prompt. Taucht es in einer Antwort auf,
// wurde der Prompt geleakt und die Antwort wird blockiert.
let _canary = process.env.CANARY || "";
/** Erst beim ersten Aufruf erzeugt: Workers erlauben keine Zufallszahlen beim Laden. */
export function canary(): string {
  if (!_canary) _canary = "PD-" + [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return _canary;
}

export const env = {
  port: Number(process.env.PORT || 8787),
  // Ohne eigenes SESSION_SECRET wird es aus dem API-Key abgeleitet: bleibt stabil
  // und geheim, und auf Cloudflare muss nur ein einziges Secret gesetzt werden.
  sessionSecret: process.env.SESSION_SECRET || (process.env.ANTHROPIC_API_KEY ? "abgeleitet|" + process.env.ANTHROPIC_API_KEY : ""),
  provider: (process.env.LLM_PROVIDER || config.llm.provider) as "anthropic" | "bedrock" | "demo",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  killSwitch: process.env.KILL_SWITCH === "1",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
};
