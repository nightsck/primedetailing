// Sicherheitsschichten im Code. Sie greifen unabhängig davon, was das Modell
// schreibt: Ein Prompt kann ausgetrickst werden, diese Prüfungen nicht.
import { allePakete, canary, config, texte } from "./config.ts";

export const katalogBetraege: number[] = allePakete.map((p) => p.preis).filter((x): x is number => x !== null);

// Beträge wie "59,99 €", "€ 59,99", "1.299,00 EUR", "60 Euro", "59.99€"
const BETRAG = /(?:€|eur(?:o)?\b)\s*(\d{1,5}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)|(\d{1,5}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur(?:o)?\b|,-)/gi;

export function parseBetrag(s: string): number {
  let t = s.trim();
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");      // 1.299,00
  else if (/\.\d{3}$/.test(t)) t = t.replace(/\./g, "");                     // 1.299
  else t = t.replace(/,/g, "");                                              // 59.99
  return Number(t);
}

export function findeBetraege(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(BETRAG)) out.push(parseBetrag(m[1] || m[2]));
  return out.filter((n) => !Number.isNaN(n));
}

const ZUSAGE = [
  /\bverbindlich/i,             // "unverbindlich" bleibt erlaubt (kein Wortanfang)
  /\bgarantier/i,
  /\bgratis\b/i,
  /\bkostenlos/i,
  /\bumsonst\b/i,
  /\bzugesagt\b/i,
  /\bich (?:bestätige|sage .* zu)\b/i,
  /\btermin (?:ist|wurde|steht) (?:jetzt |fest |verbindlich )?(?:bestätigt|gebucht|eingetragen|reserviert)/i,
  /\b(?:ist|sind) (?:jetzt |fest )?(?:für sie )?(?:gebucht|reserviert)\b/i,
  // Der Bot kann nichts weiterleiten – nur der Kunde sendet ab
  /\bich (?:habe|hab)\b[^.!?]{0,60}\b(?:weitergegeben|weitergeleitet|übermittelt|übergeben|abgeschickt|gesendet|geschickt)\b/i,
  /\b(?:wurde|ist) (?:an (?:das|unser) team )?(?:weitergegeben|weitergeleitet|übermittelt)\b/i,
];
const RABATT = /(rabatt|nachlass|skonto|preisnachlass|discount|günstiger machen|sonderpreis)/i;

export type Pruefung = { ok: true } | { ok: false; grund: "betrag" | "zusage" | "rabatt" | "canary"; detail: string };

const ERLAUBTE_PHRASEN: RegExp[] = (config.pruefung?.erlaubtePhrasen || []).map(
  (p: string) => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi"));

export function pruefeAntwort(text: string, erlaubt: number[]): Pruefung {
  if (text.includes(canary())) return { ok: false, grund: "canary", detail: "System-Prompt-Leak" };
  const ohneErlaubte = ERLAUBTE_PHRASEN.reduce((t, re) => t.replace(re, " "), text);
  for (const b of findeBetraege(text)) {
    if (!erlaubt.some((e) => Math.abs(e - b) < 0.006)) return { ok: false, grund: "betrag", detail: String(b) };
  }
  for (const re of ZUSAGE) {
    const m = ohneErlaubte.match(re);
    if (m) return { ok: false, grund: "zusage", detail: m[0] };
  }
  for (const satz of text.split(/(?<=[.!?\n])/)) {
    if (RABATT.test(satz) && /\d+\s?%/.test(satz)) return { ok: false, grund: "rabatt", detail: satz.trim() };
  }
  return { ok: true };
}

export const ERSATZ_ANTWORT = texte.ersatz;

/**
 * Entfernt ein fälschlich vorangestelltes „ab“, wenn im selben Satz ein Paket
 * mit genau diesem Festpreis genannt wird („Innen Premium (ab 99,99 €)“ →
 * „Innen Premium (99,99 €)“). „Innenreinigung gibt es ab 59,99 €“ bleibt so.
 */
export function korrigiereAb(satz: string, _toolBetraege: number[] = []): string {
  const klein = satz.toLowerCase();
  return satz.replace(/\bab\s+(\d{1,5}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)(\s*(?:€|eur(?:o)?\b))/gi, (m, zahl, waehrung) => {
    const b = parseBetrag(zahl);
    const fest = allePakete.some((p) => !p.ab && p.preis !== null && Math.abs(p.preis - b) < 0.006 && klein.includes(p.name.toLowerCase()));
    const auchAb = allePakete.some((p) => p.ab && p.preis !== null && Math.abs(p.preis - b) < 0.006 && klein.includes(p.name.toLowerCase()));
    return fest && !auchAb ? zahl + waehrung : m;
  });
}

// Eingaben, die offensichtlich versuchen, den Bot umzuprogrammieren.
const INJECTION = [
  /ignor\w*\s+(?:alle\s+|deine\s+|die\s+|sämtliche\s+)?(?:vorherigen\s+|bisherigen\s+|obigen\s+)?(?:anweisung|instruktion|regel|vorgabe|prompt)/i,
  /ignore\s+(?:all\s+|your\s+|the\s+)?(?:previous\s+|prior\s+|above\s+)?(?:instruction|rule|prompt)/i,
  /(?:system[- ]?prompt|deine anweisungen|your instructions)\s*(?:zeigen|ausgeben|verraten|wiederholen|show|reveal|print|repeat)/i,
  /(?:zeig|gib|verrat|wiederhol)\w*\s+(?:mir\s+)?(?:deinen?\s+)?(?:system[- ]?prompt|anweisungen)/i,
  /\b(?:du bist (?:jetzt|ab sofort)|you are now|act as|tu so als)\b/i,
  /\b(?:developer mode|entwicklermodus|jailbreak)\b/i,
  /\bDAN\b/,
];

export function istInjection(text: string): boolean {
  return INJECTION.some((re) => re.test(text));
}

export const INJECTION_ANTWORT = texte.injection;

// Gibt beim Streamen nur vollständige Sätze frei, damit jeder Satz geprüft
// werden kann, bevor der Kunde ihn sieht.
export class SatzPuffer {
  private buf = "";
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    const re = /[.!?:](?=\s)|\n/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(this.buf))) {
      // Dezimalzahlen und Abkürzungen wie "z. B." nicht trennen
      const davor = this.buf.slice(Math.max(0, m.index - 3), m.index + 1);
      if (/\d[.,]$/.test(davor) || /\b(?:z|B|ca|inkl|bzw|ggf|evtl|Nr|St|u|d|h)\.$/i.test(davor)) continue;
      out.push(this.buf.slice(last, m.index + 1));
      last = m.index + 1;
    }
    this.buf = this.buf.slice(last);
    return out;
  }
  rest(): string {
    const r = this.buf;
    this.buf = "";
    return r;
  }
}
