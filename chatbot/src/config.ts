// Lädt Konfiguration, Wissensbasis und Preisliste genau einmal beim Start.
// Daten kommen aus src/daten.generated.ts (erzeugt aus config/ und data/),
// damit der Code auch ohne Dateisystem (Cloudflare Workers) läuft.
import { CONFIG, PREISE, WISSEN } from "./daten.generated.ts";

export type Paket = {
  id: string; name: string; preis: number | null; ab: boolean;
  empfohlen?: boolean; beschreibung?: string; leistungen: string[];
};
export type Kategorie = { name: string; pakete: Paket[] };
export type Preisliste = {
  waehrung: string; kategorien: Kategorie[];
  aufschlaege?: { bezeichnung: string; offen?: boolean; optionen: Record<string, number>; gilt_fuer?: string[] };
  [k: string]: unknown;
};

export const config: any = CONFIG;
export const wissen: string = WISSEN;
export const preise: Preisliste = PREISE as any;

export const allePakete: Paket[] = preise.kategorien.flatMap((k) => k.pakete);

// Feste Texte – passend zur Anrede (du/Sie), einzeln überschreibbar über config.texte
export const du = config.ton?.anrede === "du";
const standardTexte = {
  ersatz: (du ? "Dazu möchte ich dir nichts Falsches sagen. " : "Dazu möchte ich Ihnen nichts Falsches sagen. ") + config.uebergabe.text,
  injection: du
    ? "Ich bleib lieber bei dem, wobei ich wirklich helfen kann: Fragen zu unseren Leistungen, Preisen und einer Anfrage. Womit kann ich dir helfen?"
    : "Ich bleibe lieber bei dem, wobei ich wirklich helfen kann: Fragen zu unseren Leistungen, Preisen und einer Terminanfrage. Womit kann ich Ihnen helfen?",
  pausiert: "Der Chat ist gerade pausiert.",
  zuViele: du ? "Zu viele Nachrichten in kurzer Zeit. Versuch es bitte gleich noch mal." : "Zu viele Nachrichten in kurzer Zeit. Bitte versuchen Sie es gleich noch einmal.",
  zuVieleHeute: du ? "Für heute ist das Nachrichtenlimit erreicht. Schreib uns gern direkt per WhatsApp oder ruf an." : "Für heute ist das Nachrichtenlimit erreicht. Schreiben Sie uns gern direkt per WhatsApp oder rufen Sie an.",
  zuVieleFotos: du ? "Für den Moment sind genug Fotos angekommen. Schick weitere gern direkt per WhatsApp." : "Für den Moment sind genug Fotos angekommen. Weitere Fotos schicken Sie uns gern direkt per WhatsApp.",
  ausgelastet: du ? "Der Chat ist für heute ausgelastet. Schreib uns gern direkt per WhatsApp oder ruf an." : "Der Chat ist für heute ausgelastet. Schreiben Sie uns gern direkt per WhatsApp oder rufen Sie an.",
  zuLang: du ? "Unser Gespräch ist sehr lang geworden. Schreib uns am besten direkt – oder lade die Seite neu." : "Dieses Gespräch ist sehr lang geworden. Am besten schreiben Sie uns direkt – oder laden Sie die Seite neu.",
  fehler: "Da ist gerade etwas schiefgelaufen. " + config.uebergabe.text,
};
export const texte: typeof standardTexte = Object.fromEntries(
  Object.entries(standardTexte).map(([k, v]) => [k, typeof config.texte?.[k] === "string" && config.texte[k] ? config.texte[k] : v])) as any;

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
