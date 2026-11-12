// Website des Kunden automatisch einlesen.
//
// Ist das bei einem Kunden eingeschaltet (Admin-Panel → Wissen → „Website automatisch
// einlesen“), holt der Server einmal am Tag die Seiten des Betriebs, zieht den lesbaren
// Text heraus und legt ihn im Speicher ab. Der Kunden-Chat bekommt diesen Text als
// zusätzlichen Abschnitt in die Wissensbasis (siehe umwandeln.ts → wissenVon).
//
// Was dabei fest gilt:
//   - Gelesen werden nur die eigenen Adressen des Kunden (Website aus den Stammdaten und
//     „Weitere Adressen“), nur über https, nie interne Adressen oder IP-Nummern.
//   - Höchstens 6 Seiten, je Seite 600 KB, zusammen höchstens 10.000 Zeichen Text.
//   - Text von der Website ist für den Bot eine Information, nie eine Anweisung. Zeilen,
//     die wie ein Umprogrammier-Versuch aussehen, werden gar nicht erst gespeichert.
//   - Preise nennt der Bot weiterhin nur aus der Preisliste des Kunden. Die Prüfung im
//     Code (guard.ts) verwirft jeden anderen Betrag, auch wenn er auf der Website steht.
import type { Kunde } from "./kunde/schema.ts";
import { erlaubteHerkunft } from "./kunde/umwandeln.ts";
import { istInjection } from "./guard.ts";
import type { Speicher, WebsiteStand } from "./speicher/schnittstelle.ts";

export const MAX_SEITEN = 6, MAX_ZEICHEN = 10_000, MAX_JE_SEITE = 4_000, MAX_BYTES = 600_000;
const ZEIT_MS = 8_000, ALTER_MAX_TAGE = 14;
const AGENT = "ki-fuer-meinen-betrieb-Bot/1.0 (liest die Website im Auftrag des Betriebs)";

type Holer = (url: string, init: RequestInit) => Promise<Response>;
let holer: Holer = (u, i) => fetch(u, i);
/** Nur für Tests: statt echter Abrufe eine eigene Funktion benutzen. */
export function _setHoler(h: Holer | null) { holer = h || ((u, i) => fetch(u, i)); }

/** Nur öffentliche https-Adressen mit richtigem Namen. Keine IP-Nummern, kein localhost, keine internen Namen, kein eigener Port. */
export function sichereAdresse(roh: string): URL | null {
  let u: URL;
  try { u = new URL(roh); } catch { return null; }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (!/^[a-z0-9.-]+$/.test(h) || !h.includes(".") || h.startsWith(".") || h.endsWith(".")) return null;
  if (/^\d+(\.\d+){3}$/.test(h) || !/[a-z]{2,}$/.test(h.split(".").pop()!)) return null;
  if (/(^|\.)(localhost|local|internal|intern|lan|home|corp|test|invalid|example|onion)$/.test(h)) return null;
  u.hash = "";
  return u;
}

const ZEICHEN: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", euro: "€", ndash: "–", mdash: "—", hellip: "…", copy: "©", bdquo: "„", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", bull: "•", shy: "" };
const entschluessle = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : " "; })
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const c = parseInt(n, 16); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : " "; })
  .replace(/&([a-zA-Z]+);/g, (m, n) => ZEICHEN[n] ?? " ");

/** Lesbarer Text einer HTML-Seite: ohne Skripte, Menüs, Formulare und Auszeichnung, eine Zeile je Absatz. */
export function textAus(html: string): string[] {
  const t = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|head|nav|form|select|button|iframe|object|canvas)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?(br|p|div|li|h[1-6]|tr|section|article|header|footer|main|aside|blockquote|dd|dt|table|ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]\s*>/gi, " · ")
    .replace(/<[^>]{0,2000}>/g, " ");
  return entschluessle(t)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "")
    .split("\n").map((z) => z.replace(/[ \t\r\f\v\u00a0]+/g, " ").replace(/( · )+$/, "").trim())
    .filter((z) => z.length >= 3 && /[a-zA-ZäöüÄÖÜ0-9]/.test(z));
}

const WICHTIG = /leistung|angebot|preis|service|kontakt|oeffnung|öffnung|ueber|über|faq|fragen|anfahrt|team|speisekarte|karte|behandlung|sortiment|termin|praxis|zimmer|kurse|ablauf/i;
const UNWICHTIG = /impressum|datenschutz|agb|cookie|login|warenkorb|checkout|wp-admin|wp-json|feed|tag\/|author\/|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|ics)(\?|$)/i;
/** Unterseiten derselben Website, die wichtigsten zuerst. */
export function linksAus(html: string, basis: URL): string[] {
  const gefunden = new Map<string, number>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]{1,300})["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    let u: URL;
    try { u = new URL(m[1], basis); } catch { continue; }
    const s = sichereAdresse(u.href);
    if (!s || s.hostname.replace(/^www\./, "") !== basis.hostname.replace(/^www\./, "")) continue;
    s.search = "";
    const adresse = s.href.replace(/\/$/, "");
    if (adresse === basis.href.replace(/\/$/, "") || UNWICHTIG.test(adresse)) continue;
    const punkte = (WICHTIG.test(s.pathname) ? 2 : 0) + (WICHTIG.test(m[2].replace(/<[^>]+>/g, " ")) ? 1 : 0) - s.pathname.split("/").filter(Boolean).length * 0.1;
    gefunden.set(adresse, Math.max(gefunden.get(adresse) ?? -9, punkte));
  }
  return [...gefunden.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
}

/** Holt eine Seite. Folgt höchstens 3 Weiterleitungen, und nur innerhalb der erlaubten Adressen. */
async function holeSeite(start: URL, erlaubt: (u: URL) => boolean): Promise<{ url: URL; html: string }> {
  let u = start;
  for (let sprung = 0; sprung < 4; sprung++) {
    const r = await holer(u.href, { redirect: "manual", headers: { "User-Agent": AGENT, Accept: "text/html" }, signal: AbortSignal.timeout(ZEIT_MS) });
    if (r.status >= 300 && r.status < 400) {
      const ziel = sichereAdresse(new URL(r.headers.get("location") || "", u).href);
      if (!ziel || !erlaubt(ziel)) throw new Error("leitet auf eine fremde Adresse weiter");
      u = ziel;
      continue;
    }
    if (!r.ok) throw new Error(`antwortet mit Fehler ${r.status}`);
    if (!/text\/html|application\/xhtml/i.test(r.headers.get("content-type") || "")) throw new Error("ist keine HTML-Seite");
    // Nur den Anfang lesen: Eine riesige Seite soll den Server nicht ausbremsen
    const leser = r.body?.getReader(), teile: Uint8Array[] = [];
    let gesamt = 0;
    while (leser && gesamt < MAX_BYTES) {
      const { done, value } = await leser.read();
      if (done) break;
      teile.push(value); gesamt += value.length;
    }
    try { await leser?.cancel(); } catch { /* schon zu Ende */ }
    const alles = new Uint8Array(Math.min(gesamt, MAX_BYTES));
    let pos = 0;
    for (const t of teile) { const rest = alles.length - pos; if (rest <= 0) break; alles.set(t.subarray(0, rest), pos); pos += Math.min(t.length, rest); }
    return { url: u, html: new TextDecoder("utf-8").decode(alles) };
  }
  throw new Error("leitet zu oft weiter");
}

/** Liest die Website eines Kunden. Wirft nie; Fehler stehen im Ergebnis. */
export async function leseWebsite(k: Kunde): Promise<WebsiteStand> {
  const jetzt = Date.now(), eigene = new Set(erlaubteHerkunft(k));
  const erlaubt = (u: URL) => eigene.has(u.origin);
  const stand: WebsiteStand = { text: "", zeit: 0, versucht: jetzt, seiten: [], fehler: "" };
  const fest = (k.wissen.websiteLesen?.seiten || []).filter(Boolean);
  const start = fest.length ? fest : [k.stammdaten.website].filter(Boolean);
  if (!start.length) return { ...stand, fehler: "Es ist keine Website eingetragen (Stammdaten)." };

  const warteschlange: string[] = [...start], gesehen = new Set<string>(), zeilenGesehen = new Set<string>(), fehler: string[] = [], bloecke: string[] = [];
  let zeichen = 0;
  while (warteschlange.length && stand.seiten.length + fehler.length < MAX_SEITEN && zeichen < MAX_ZEICHEN) {
    const roh = warteschlange.shift()!, u = sichereAdresse(roh);
    const schluessel = (u?.href || roh).replace(/\/$/, "");
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    if (!u) { fehler.push(`${roh}: keine gültige https-Adresse`); continue; }
    if (!erlaubt(u)) { fehler.push(`${u.hostname}: gehört nicht zu den Adressen dieses Kunden`); continue; }
    try {
      const seite = await holeSeite(u, erlaubt);
      // Zeilen, die auf jeder Seite stehen (Kopf, Fuß), nur einmal übernehmen; Umprogrammier-Versuche gar nicht
      const zeilen = textAus(seite.html).filter((z) => !zeilenGesehen.has(z) && !istInjection(z));
      zeilen.forEach((z) => zeilenGesehen.add(z));
      const text = zeilen.join("\n").slice(0, Math.min(MAX_JE_SEITE, MAX_ZEICHEN - zeichen));
      if (text.length >= 10) {
        bloecke.push(`[Seite: ${seite.url.pathname === "/" ? "Startseite" : decodeURIComponent(seite.url.pathname)}]\n${text}`);
        stand.seiten.push({ url: seite.url.href, zeichen: text.length });
        zeichen += text.length;
      }
      // Ohne feste Liste: von der Startseite aus die wichtigsten Unterseiten dazunehmen
      if (!fest.length && stand.seiten.length <= 1) warteschlange.push(...linksAus(seite.html, seite.url).slice(0, MAX_SEITEN - 1));
    } catch (e: any) {
      fehler.push(`${u.pathname === "/" ? u.hostname : u.pathname}: ${e?.name === "TimeoutError" ? "antwortet nicht rechtzeitig" : /fetch failed|network|ENOTFOUND|ECONN/i.test(String(e?.message || e)) ? "ist nicht erreichbar" : String(e?.message || e).slice(0, 80)}`);
    }
  }
  stand.text = bloecke.join("\n\n");
  stand.fehler = fehler.slice(0, 4).join(" · ");
  if (stand.text) stand.zeit = jetzt;
  else if (!stand.fehler) stand.fehler = "Auf der Website wurde kein lesbarer Text gefunden (vielleicht wird sie erst im Browser aufgebaut).";
  return stand;
}

/** Text, den der Bot heute benutzen darf: nur wenn eingeschaltet und nicht älter als 14 Tage. */
export function websiteWissen(k: Kunde, stand: WebsiteStand | null | undefined): { text: string; zeit: number } | null {
  if (!k.wissen.websiteLesen?.aktiv || !stand?.text || Date.now() - stand.zeit > ALTER_MAX_TAGE * 86_400_000) return null;
  return { text: stand.text, zeit: stand.zeit };
}

/**
 * Liest und speichert. Klappt ein Abruf nicht, bleibt der letzte gute Text erhalten
 * (bis er 14 Tage alt ist) und nur der Fehler wird vermerkt.
 */
export async function leseUndMerke(sp: Speicher, k: Kunde): Promise<WebsiteStand> {
  const neu = await leseWebsite(k), alt = await sp.websiteLesen(k.id);
  const stand = neu.text || !alt?.text ? neu : { ...alt, versucht: neu.versucht, fehler: neu.fehler };
  await sp.websiteMerken(k.id, stand);
  return stand;
}

/**
 * Täglicher Lauf (stündlich angestoßen): liest bei höchstens `max` Kunden, deren letzter
 * Versuch länger als 24 Stunden her ist. So verteilt sich die Arbeit über den Tag.
 */
export async function leseFaellige(sp: Speicher, max = 3): Promise<{ gelesen: string[]; fehler: string[] }> {
  const gelesen: string[] = [], fehler: string[] = [];
  for (const z of await sp.kundenListe()) {
    if (gelesen.length + fehler.length >= max) break;
    if (!z.live || (z.status !== "aktiv" && z.status !== "test")) continue;
    const k = (await sp.kundeLesen(z.id))?.veroeffentlicht;
    if (!k?.wissen.websiteLesen?.aktiv) continue;
    const alt = await sp.websiteLesen(z.id);
    if (alt && Date.now() - alt.versucht < 86_400_000) continue;
    const stand = await leseUndMerke(sp, k);
    (stand.fehler && !stand.seiten.length ? fehler : gelesen).push(z.id);
  }
  return { gelesen, fehler };
}
