// Schutz vor Spam und Kostenexplosion.
//
// Gezählt wird pro Besucher (IP, nur als Hash) in drei Fenstern – Minute,
// Stunde, 24 Stunden – getrennt für Chat-Nachrichten, Fotos und abgeschickte
// Anfragen. Dazu ein Tagesbudget für den ganzen Bot.
//
// Auf Cloudflare zählt ein Durable Object (src/limit-do.ts) für alle Server
// gemeinsam; unter Node zählt der Arbeitsspeicher (ein Prozess = exakt).
// Die harte Obergrenze bleibt das Ausgabenlimit in der Anthropic Console.
import { config, env, texte } from "./config.ts";

export type Art = "chat" | "foto" | "anfrage";
type Fenster = { minute?: number; stunde?: number; tag?: number };
export type Stand = { zeiten: Record<string, number[]>; budgetTag?: string; budget?: number };

const L = config.limits || {};
/** Grenzwerte je Art. Standardwerte = typische echte Nutzung mit viel Luft nach oben. */
export const grenzen: Record<Art, Fenster> = {
  chat: { minute: 8, stunde: L.anfragenProIpProStunde ?? 40, tag: 100, ...(L.proIp || {}) },
  foto: { minute: 3, stunde: L.fotosProIpProStunde ?? 6, tag: 10, ...(L.fotosProIp || {}) },
  anfrage: { minute: 2, stunde: 5, tag: 10, ...(L.anfragenFormularProIp || {}) },
};
export const tagesbudget: number = L.tagesbudgetNachrichten ?? L.tagesbudgetAnfragen ?? 1500;

const MIN = 60_000, STD = 3_600_000, TAG = 86_400_000;

/**
 * Reine Zähllogik (gleich für Arbeitsspeicher und Durable Object).
 * Gibt den Grund zurück, falls gesperrt, sonst null – und zählt dann mit.
 */
export function zaehle(stand: Stand, art: Art, jetzt = Date.now(), g: Fenster = grenzen[art]): "minute" | "stunde" | "tag" | null {
  const liste = (stand.zeiten[art] || []).filter((t) => jetzt - t < TAG);
  const n = (ms: number) => liste.filter((t) => jetzt - t < ms).length;
  let grund: "minute" | "stunde" | "tag" | null = null;
  if (g.minute && n(MIN) >= g.minute) grund = "minute";
  else if (g.stunde && n(STD) >= g.stunde) grund = "stunde";
  else if (g.tag && liste.length >= g.tag) grund = "tag";
  if (!grund) liste.push(jetzt);
  stand.zeiten[art] = liste;
  return grund;
}

/** Tagesbudget für alle Besucher zusammen (Kalendertag UTC). */
export function zaehleBudget(stand: Stand, jetzt = Date.now(), max = tagesbudget): boolean {
  const tag = new Date(jetzt).toISOString().slice(0, 10);
  if (stand.budgetTag !== tag) { stand.budgetTag = tag; stand.budget = 0; }
  if ((stand.budget || 0) >= max) return false;
  stand.budget = (stand.budget || 0) + 1;
  return true;
}

// --- Arbeitsspeicher (Node / Fallback) ---------------------------------------
const speicher = new Map<string, Stand>();
const global: Stand = { zeiten: {} };
function imSpeicher(schluessel: string, art: Art) {
  if (speicher.size > 20_000) speicher.clear();
  const s = speicher.get(schluessel) || { zeiten: {} };
  speicher.set(schluessel, s);
  const grund = zaehle(s, art);
  if (grund) return grund;
  if (art !== "anfrage" && !zaehleBudget(global)) return "budget";
  return null;
}
/** Nur für Tests. */
export function _reset() { speicher.clear(); global.zeiten = {}; global.budget = 0; }

// --- IP nur als Hash (keine Klar-IP im Speicher) ------------------------------
async function hashIp(ip: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode((env.sessionSecret || "wc") + "|" + ip));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const ipVon = (c: any): string =>
  c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0].trim() || c.env?.incoming?.socket?.remoteAddress || "unbekannt";

/**
 * Prüft Notbremse und Limits. Gibt den Text für den Besucher zurück, wenn
 * gesperrt, sonst null.
 */
export async function pruefeLimit(c: any, art: Art): Promise<string | null> {
  if (env.killSwitch || c.env?.KILL_SWITCH === "1") return texte.pausiert;
  const schluessel = await hashIp(ipVon(c));
  let grund: string | null;
  const ns = c.env?.LIMITS;
  if (ns?.idFromName) {
    try {
      grund = await ns.get(ns.idFromName("ip:" + schluessel)).zaehle(art, grenzen[art]);
      if (!grund && art !== "anfrage" && !(await ns.get(ns.idFromName("global")).budget(tagesbudget))) grund = "budget";
    } catch (e: any) {
      console.error("[limits]", e?.message || e);
      grund = imSpeicher(schluessel, art); // Zähler nicht erreichbar → lokal weiterzählen
    }
  } else grund = imSpeicher(schluessel, art);

  if (!grund) return null;
  console.warn(`[limit] ${art} ${grund} ${schluessel.slice(0, 8)}`);
  if (grund === "budget") return texte.ausgelastet;
  if (art === "foto") return texte.zuVieleFotos;
  return grund === "minute" ? texte.zuViele : texte.zuVieleHeute;
}
