// Termin-Bot der Vorführseite (primedetailing.eu/demo/termin/).
//
//   GET  /api/demo/termin/zeiten   freie Zeiten aus dem echten Kalender
//   POST /api/demo/termin/buchen   Termin prüfen und in den Kalender eintragen
//   POST /api/demo/termin/absagen  selbst gebuchten Termin wieder löschen
//
// Kalender: Google Kalender über ein Dienstkonto (Service Account). Ohne Zugang
// antworten die Schnittstellen mit {kalender:false}; dann rechnet die Seite die
// freien Zeiten selbst und speichert Buchungen nur im Browser (Vorführmodus).
//
// Einrichtung (einmalig, siehe CLOUDFLARE.md → „Termin-Bot“):
//   npx wrangler secret put GOOGLE_SA_JSON          Inhalt der JSON-Schlüsseldatei
//   TERMIN_KALENDER = "…@group.calendar.google.com"  (wrangler.toml oder Dashboard)
//   optional je Betrieb: TERMIN_KALENDER_FAHRZEUG / _MALER / _ELEKTRO
//
// Die KI ist hier nicht beteiligt: Zeiten und Buchung rechnet nur der Code.
import type { Hono } from "hono";
// @ts-ignore – gemeinsame Datei mit der Website (reines JavaScript)
import { BETRIEBE, terminArt, terminZeitraum, freieZeiten, istDatum, plusTage, zeitpunkt, isoBerlin, TZ } from "../../src/assets/betriebe.js";
import { pruefeLimit } from "./limits.ts";
import { env } from "./config.ts";

export type Belegt = { start: number; ende: number };
export interface Kalender {
  belegt(von: number, bis: number): Promise<Belegt[]>;
  eintragen(e: { titel: string; text: string; ort: string; start: number; ende: number; privat: Record<string, string> }): Promise<string>;
  loeschen(id: string): Promise<void>;
}

const kurz = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const wert = (c: any, k: string): string => String(c?.env?.[k] ?? process.env[k] ?? "").trim();

/* ---------- Google Kalender ---------- */
const enc = new TextEncoder();
const b64u = (b: Uint8Array | string) => {
  const u = typeof b === "string" ? enc.encode(b) : b;
  let s = ""; for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

type Dienstkonto = { client_email: string; private_key: string };
export function leseDienstkonto(json: string): Dienstkonto | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json);
    if (typeof o?.client_email === "string" && typeof o?.private_key === "string" && o.private_key.includes("PRIVATE KEY")) return { client_email: o.client_email, private_key: o.private_key };
  } catch { /* unbrauchbar */ }
  return null;
}

let zugang: { token: string; bis: number; email: string } | null = null;
async function googleToken(sa: Dienstkonto): Promise<string> {
  const jetzt = Math.floor(Date.now() / 1000);
  if (zugang && zugang.email === sa.client_email && zugang.bis > jetzt + 60) return zugang.token;
  const der = unb64u(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_"));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const kopf = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const inhalt = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: jetzt, exp: jetzt + 3600 }));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(kopf + "." + inhalt)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${kopf}.${inhalt}.${b64u(sig)}` }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google-Anmeldung fehlgeschlagen (${r.status} ${j.error || ""})`);
  zugang = { token: j.access_token, bis: jetzt + Number(j.expires_in || 3600), email: sa.client_email };
  return zugang.token;
}

const cache = new Map<string, { bis: number; belegt: Belegt[] }>();
export function googleKalender(sa: Dienstkonto, id: string): Kalender {
  const api = "https://www.googleapis.com/calendar/v3";
  const rufe = async (pfad: string, init: RequestInit = {}) => {
    const r = await fetch(api + pfad, { ...init, headers: { Authorization: `Bearer ${await googleToken(sa)}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    return r;
  };
  return {
    async belegt(von, bis) {
      const k = `${id}|${von}|${bis}`; const c = cache.get(k);
      if (c && c.bis > Date.now()) return c.belegt;
      const r = await rufe("/freeBusy", { method: "POST", body: JSON.stringify({ timeMin: new Date(von).toISOString(), timeMax: new Date(bis).toISOString(), timeZone: TZ, items: [{ id }] }) });
      const j: any = await r.json().catch(() => ({}));
      const cal = j?.calendars?.[id];
      if (!r.ok || !cal || (cal.errors && cal.errors.length)) throw new Error(`Kalender nicht lesbar (${r.status} ${cal?.errors?.[0]?.reason || j?.error?.message || ""})`);
      const belegt = (cal.busy || []).map((x: any) => ({ start: Date.parse(x.start), ende: Date.parse(x.end) })).filter((x: Belegt) => x.ende > x.start);
      if (cache.size > 200) cache.clear();
      cache.set(k, { bis: Date.now() + 20_000, belegt });
      return belegt;
    },
    async eintragen(e) {
      const r = await rufe(`/calendars/${encodeURIComponent(id)}/events`, { method: "POST", body: JSON.stringify({
        summary: e.titel, description: e.text, location: e.ort,
        start: { dateTime: isoBerlin(e.start), timeZone: TZ }, end: { dateTime: isoBerlin(e.ende), timeZone: TZ },
        extendedProperties: { private: e.privat }, transparency: "opaque",
      }) });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(`Eintragen fehlgeschlagen (${r.status} ${j?.error?.message || ""})`);
      cache.clear();
      return String(j.id);
    },
    async loeschen(eventId) {
      const r = await rufe(`/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
      if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Löschen fehlgeschlagen (${r.status})`);
      cache.clear();
    },
  };
}

let testKalender: ((betrieb: string) => Kalender | null) | null = null;
/** Nur für Tests: eigenen Kalender setzen (null = wieder echte Einstellungen). */
export function _setKalender(f: typeof testKalender) { testKalender = f; cache.clear(); }

export function kalenderFuer(c: any, betrieb: string): Kalender | null {
  if (testKalender) return testKalender(betrieb);
  const sa = leseDienstkonto(wert(c, "GOOGLE_SA_JSON"));
  const id = wert(c, "TERMIN_KALENDER_" + betrieb.toUpperCase()) || wert(c, "TERMIN_KALENDER");
  return sa && id ? googleKalender(sa, id) : null;
}

/* ---------- Absage-Schlüssel (nur wer gebucht hat, kann löschen) ---------- */
let hmac: CryptoKey | null = null;
async function hmacKey() {
  if (hmac) return hmac;
  const geheim = env.sessionSecret || "termin|" + [...crypto.getRandomValues(new Uint8Array(24))].join(",");
  hmac = await crypto.subtle.importKey("raw", enc.encode("termin-absage|" + geheim), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return hmac;
}
export async function absageToken(daten: { b: string; e: string; s: number }) {
  const body = b64u(JSON.stringify(daten));
  return body + "." + b64u(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body))));
}
export async function leseAbsageToken(token: unknown): Promise<{ b: string; e: string; s: number } | null> {
  if (typeof token !== "string" || token.length > 600 || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(), unb64u(sig), enc.encode(body)))) return null;
    const d = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return typeof d?.b === "string" && typeof d?.e === "string" && typeof d?.s === "number" ? d : null;
  } catch { return null; }
}

/* ---------- Eingaben prüfen ---------- */
export function pruefeBuchung(b: any): { ok: true; d: any } | { ok: false; fehler: string } {
  const betrieb = (BETRIEBE as any)[b?.betrieb];
  if (!betrieb) return { ok: false, fehler: "Unbekannter Betrieb." };
  const t = terminArt(betrieb, b.termin);
  if (!t) return { ok: false, fehler: "Unbekannte Terminart." };
  if (!istDatum(b.datum)) return { ok: false, fehler: "Datum fehlt." };
  const name = kurz(b.name, 80), telefon = kurz(b.telefon, 40), email = kurz(b.email, 100);
  if (!name) return { ok: false, fehler: "Bitte den Namen eintragen." };
  if (!telefon && !email) return { ok: false, fehler: "Bitte Telefon oder E-Mail eintragen." };
  if (telefon && telefon.replace(/\D/g, "").length < 6) return { ok: false, fehler: "Die Telefonnummer sieht zu kurz aus." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, fehler: "Die E-Mail-Adresse sieht nicht vollständig aus." };
  const a = b.adresse || {};
  const adresse = { strasse: kurz(a.strasse, 100), plz: kurz(a.plz, 5), ort: kurz(a.ort, 60) };
  if (t.ort === "kunde" && (!adresse.strasse || !/^\d{5}$/.test(adresse.plz) || !adresse.ort)) return { ok: false, fehler: "Bitte die Adresse für den Termin vor Ort eintragen." };
  if (b.einwilligung !== true) return { ok: false, fehler: "Bitte der Speicherung für den Termin zustimmen." };
  const z = terminZeitraum(betrieb, t.id, b.datum, b.zeit);
  if (!z) return { ok: false, fehler: "Diese Uhrzeit gibt es nicht." };
  return { ok: true, d: { betrieb, t, z, datum: b.datum, name, telefon, email, adresse, notiz: kurz(b.notiz, 500), details: kurz(b.details, 300) } };
}

function eintrag(d: any) {
  const { betrieb, t, z } = d;
  const ort = t.ort === "kunde" ? `${d.adresse.strasse}, ${d.adresse.plz} ${d.adresse.ort}` : t.ort === "telefon" ? `Rückruf: ${d.telefon || d.email}` : `${betrieb.name}, ${betrieb.adresse}`;
  const demo = process.env.TERMIN_DEMO !== "0";
  const text = [
    `${t.name} · gebucht über den Termin-Bot${demo ? " (Vorführung)" : ""}`,
    `Name: ${d.name}`, d.telefon && `Telefon: ${d.telefon}`, d.email && `E-Mail: ${d.email}`,
    t.ort === "kunde" && `Adresse: ${ort}`, d.details && `Angaben: ${d.details}`, d.notiz && `Notiz vom Kunden: ${d.notiz}`,
    t.ort === "kunde" && betrieb.fahrt ? `Fahrzeit eingeplant: ${betrieb.fahrt} Min. davor und danach` : "",
  ].filter(Boolean).join("\n");
  return { titel: `${demo ? "[Demo] " : ""}${t.name} – ${d.name}`.slice(0, 120), text, ort, start: z.start, ende: z.ende, privat: { quelle: "termin-bot", betrieb: betrieb.id, termin: t.id } };
}

const TEXT = {
  belegt: "Diese Zeit ist gerade weg. Bitte eine andere wählen.",
  kalender: "Der Kalender ist gerade nicht erreichbar.",
  fehler: "Das hat nicht geklappt. Bitte noch einmal versuchen.",
};

export function terminRouten(app: Hono) {
  app.get("/api/demo/termin/zeiten", async (c) => {
    const q = c.req.query();
    const betrieb = (BETRIEBE as any)[q.betrieb || ""];
    const t = betrieb && terminArt(betrieb, q.termin);
    if (!betrieb || !t) return c.json({ ok: false, fehler: "unbekannt" }, 400);
    const kal = kalenderFuer(c, betrieb.id);
    if (!kal) return c.json({ ok: true, kalender: false });
    const von = istDatum(q.von) ? q.von : undefined;
    const tage = Math.max(1, Math.min(21, Number(q.tage) || 14));
    const ab = von || new Date().toISOString().slice(0, 10);
    try {
      const belegt = await kal.belegt(zeitpunkt(plusTage(ab, -1), 0), zeitpunkt(plusTage(ab, tage + 4), 0));
      return c.json({ ok: true, kalender: true, tage: freieZeiten(betrieb, t.id, { von, tage, belegt }) });
    } catch (e: any) {
      console.error("[termin-zeiten]", e?.message || e);
      return c.json({ ok: false, kalender: true, fehler: "kalender", text: TEXT.kalender }, 502);
    }
  });

  app.post("/api/demo/termin/buchen", async (c) => {
    if (Number(c.req.header("content-length") || 0) > 8_000) return c.json({ ok: false, fehler: TEXT.fehler }, 413);
    const b: any = await c.req.json().catch(() => ({}));
    const p = pruefeBuchung(b);
    if (!p.ok) return c.json({ ok: false, fehler: p.fehler }, 400);
    const sperre = await pruefeLimit(c, "anfrage");
    if (sperre) return c.json({ ok: false, limit: true, fehler: sperre }, 429);
    const d = p.d;
    const kal = kalenderFuer(c, d.betrieb.id);
    if (!kal) return c.json({ ok: true, kalender: false });
    try {
      // Kurz vor dem Eintragen noch einmal prüfen: Ist die Zeit wirklich noch frei?
      const belegt = await kal.belegt(d.z.blockVon - 86_400_000, d.z.blockBis + 86_400_000);
      const frei = freieZeiten(d.betrieb, d.t.id, { von: d.datum, tage: 1, belegt })[0];
      if (!frei || !frei.slots.includes(d.z.zeit)) return c.json({ ok: false, belegt: true, fehler: TEXT.belegt }, 409);
      const id = await kal.eintragen(eintrag(d));
      console.log(`[termin] ${d.betrieb.id}/${d.t.id} ${d.datum} ${d.z.zeit}`);
      return c.json({ ok: true, kalender: true, id, token: await absageToken({ b: d.betrieb.id, e: id, s: d.z.start }), start: isoBerlin(d.z.start), ende: isoBerlin(d.z.ende) });
    } catch (e: any) {
      console.error("[termin-buchen]", e?.message || e);
      return c.json({ ok: false, kalender: true, fehler: TEXT.kalender }, 502);
    }
  });

  app.post("/api/demo/termin/absagen", async (c) => {
    const b: any = await c.req.json().catch(() => ({}));
    const t = await leseAbsageToken(b.token);
    if (!t) return c.json({ ok: false, fehler: "Ungültiger Link." }, 400);
    if (t.s < Date.now()) return c.json({ ok: false, fehler: "Der Termin liegt schon in der Vergangenheit." }, 400);
    const kal = kalenderFuer(c, t.b);
    if (!kal) return c.json({ ok: false, fehler: TEXT.kalender }, 503);
    try { await kal.loeschen(t.e); return c.json({ ok: true }); }
    catch (e: any) { console.error("[termin-absagen]", e?.message || e); return c.json({ ok: false, fehler: TEXT.fehler }, 502); }
  });
}
