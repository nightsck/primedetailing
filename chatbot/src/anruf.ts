// Anruf-Retter (Missed-Call-Bot): verpasster Anruf → SMS mit Link an den Anrufer
// und sofort eine Mail an den Betrieb.
//
//   POST /api/anruf/sipgate   Webhook von sipgate.io (Push-API, Ereignis „newCall“)
//   POST /api/anruf/probe     Probeanruf ohne sipgate, nur wenn ANRUF_PROBE = "1"
//
// Ablauf im Betrieb: Das Handy des Chefs leitet „bei Nichtmelden“ (z. B. nach
// 20 Sekunden) auf eine sipgate-Nummer um. Jeder Anruf, der dort ankommt, ist also
// ein verpasster Anruf beim Betrieb. sipgate meldet ihn an diese Adresse, der Bot
// antwortet mit einer optionalen Ansage und erledigt den Rest im Hintergrund.
//
// Einstellungen (Cloudflare → Worker → Variablen; Details in CLOUDFLARE.md):
//   SIPGATE_TOKEN_ID, SIPGATE_TOKEN   Secrets: persönlicher Zugangs-Token mit SMS-Recht.
//                                     Fehlen sie, läuft alles im Probelauf: keine SMS, nur die Mail.
//   SIPGATE_SMS_ID                    SMS-Absender-ID aus sipgate, Standard „s0“
//   ANRUF_BETRIEB                     welcher Betrieb (fahrzeug, maler, elektro), Standard fahrzeug
//   ANRUF_BETRIEB_<NUMMER>            optional je Rufnummer, z. B. ANRUF_BETRIEB_4977201234567 = maler
//   ANRUF_LINK / ANRUF_LINK_<ID>      Link in der SMS
//   ANRUF_SMS_TEXT                    eigener Text, Platzhalter {name} und {link}
//   ANRUF_ANSAGE                      optional: Adresse einer WAV-Datei (mono, 16 Bit, 8 kHz)
//   ANRUF_MAIL_BETRIEB / _<ID>        Empfänger der Mail, sonst TERMIN_MAIL_BETRIEB
//   ANRUF_SIGNATUR = "aus"            Signaturprüfung abschalten, NUR für lokale Tests
//
// Die SMS antwortet nur auf den Anruf des Kunden und enthält keine Werbung.
// Gespeichert wird nichts außer einem Zähler (Nummer nur als Hash, 24 Stunden),
// damit niemand mehr als eine SMS pro Tag bekommt.
import type { Hono } from "hono";
// @ts-ignore – gemeinsame Datei mit der Website (reines JavaScript)
import { BETRIEBE, TZ } from "../../src/assets/betriebe.js";
import { sendeMail, gueltigeMail, type Mail } from "./mail.ts";

const wert = (c: any, k: string): string => String(c?.env?.[k] ?? process.env[k] ?? "").trim();
const enc = new TextEncoder();

/* ---------- Rufnummern ---------- */
/** sipgate liefert Nummern ohne „+“ (4915791234567) oder „anonymous“. */
export function normNummer(roh: unknown): string | null {
  const s = String(roh ?? "").trim();
  if (!s || /anonym/i.test(s)) return null;
  let z = s.replace(/[^\d+]/g, "");
  if (z.startsWith("+")) z = z.slice(1);
  else if (z.startsWith("00")) z = z.slice(2);
  else if (z.startsWith("0")) z = "49" + z.slice(1);
  return /^\d{8,15}$/.test(z) ? "+" + z : null;
}
/** Deutsche Handynummer (015x, 016x, 017x). Nur dorthin geht eine SMS. */
export const istHandy = (n: string | null) => !!n && /^\+491[567]\d{7,10}$/.test(n);
/** Lesbar für die Mail: +49 157 91234567 */
export const zeigeNummer = (n: string) => n.startsWith("+49") ? "+49 " + n.slice(3, 6) + " " + n.slice(6) : n;

/* ---------- Betrieb, Link, Text ---------- */
export function betriebFuer(c: any, an: unknown, umleitung: unknown): any {
  const ids = [umleitung, an].map((x) => String(x ?? "").replace(/\D/g, "")).filter(Boolean);
  const gewaehlt = ids.map((n) => wert(c, "ANRUF_BETRIEB_" + n)).find(Boolean) || wert(c, "ANRUF_BETRIEB") || "fahrzeug";
  return (BETRIEBE as any)[gewaehlt] || (BETRIEBE as any).fahrzeug;
}
export const linkFuer = (c: any, b: any) =>
  wert(c, "ANRUF_LINK_" + b.id.toUpperCase()) || wert(c, "ANRUF_LINK") || `https://primedetailing.eu/demo/anfrage/?betrieb=${b.id}`;

const STANDARD_TEXT = "{name}: Wir konnten gerade nicht rangehen. Schreiben Sie uns hier, gern mit Fotos: {link}";
/** Text ohne Umlaute, damit die SMS in eine Nachricht (160 Zeichen) passt. Längere Texte kosten mehrere SMS. */
export function smsText(c: any, b: any): string {
  const vorlage = wert(c, "ANRUF_SMS_TEXT") || STANDARD_TEXT;
  return vorlage.replaceAll("{name}", b.name).replaceAll("{link}", linkFuer(c, b)).slice(0, 459);
}

/* ---------- Antwort an sipgate ---------- */
const escX = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]!));
export function antwortXml(ansage?: string): string {
  const play = ansage && /^https:\/\//.test(ansage) ? `<Play><Url>${escX(ansage)}</Url></Play>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${play}</Response>`;
}

/* ---------- Echtheit der Meldung (Signatur von sipgate) ---------- */
// Öffentlicher Schlüssel aus der offiziellen sipgate.io-Bibliothek (sipgateio-node,
// lib/webhook/signatureVerifier.ts). sipgate signiert den Rohtext mit RSA-SHA256
// und schickt die Signatur im Header „x-sipgate-signature“ (Base64).
const SIPGATE_SCHLUESSEL = `MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAvFdlnqRfO5TmqzjtsFVC
qPz+oW+poi3lXQFvMJJMEAtlU4MbX+yuIkgnC+Qt3AQWIK+oWSEQiybg+p39wEMl
16PZxEzf9gONQvTg1XhyHnwqYUFQj/AoxPKGYC3jmdjZ224SrESiTN3CdxoOc3vk
cXiQstYE7SxnksPtzfk0aIOkicim5/tAP9izNQ18/zmX3ChjK2k72gf5dDlq+qZ8
pRiHAPZ64TySH6cLQDhaoh6Nbq8FEG3usXXPClbUMh2DZaTMPafpd+LNuTngJ/y+
KoZasVuFfXAeBqGA6l5d4Uedfr99Z6qjwDrJ8sU4z2Do9bJrbuqP+mOXEebhSI1K
vi8trEfrIt8hnDBGsBaB9NEO3kYxvDT2/PhC9fNYFocjEpZNd7/mUqTJDYlpa4UC
NDQaU+ATdXG8/P5sGAegks6MQTu+qe9XTO0CV48eswDkz6g3UbLOwmrJK59SjD3J
yAZ52sluwyDKRWw/PPTt8BTQLjvkdbiLUlc4ehJ4b1X7D7diYWHDPeFL47cAvaXh
dXVrZDeBJYibvD1jRx4ES0KlfhwzNXBYUoM/Movg9zMM2PzyHHKS//xIjwUC/FJ6
/6eykno0Hy2B1ev6s3hdY6VkN2zd7Wf+EK4DxRliwsg1U99szFE3ewLfexF+Uag5
M+TfPtOUumI/NHMTvsRW9+ECAwEAAQ==`;
const ausBase64 = (s: string) => Uint8Array.from(atob(s.replace(/\s+/g, "")), (ch) => ch.charCodeAt(0));
const schluesselCache = new Map<string, Promise<CryptoKey>>();
function ladeSchluessel(spkiBase64: string) {
  if (!schluesselCache.has(spkiBase64)) {
    schluesselCache.set(spkiBase64, crypto.subtle.importKey("spki", ausBase64(spkiBase64), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  }
  return schluesselCache.get(spkiBase64)!;
}
export async function echteSignatur(rohtext: string, signatur: string | undefined, spkiBase64 = SIPGATE_SCHLUESSEL): Promise<boolean> {
  if (!signatur || signatur.length > 2000) return false;
  try { return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", await ladeSchluessel(spkiBase64), ausBase64(signatur), enc.encode(rohtext)); }
  catch { return false; }
}

/* ---------- Höchstens eine SMS pro Nummer und Tag ---------- */
const lokaleSperre = new Map<string, number>();
/** Nur für Tests. */
export function _resetAnruf() { lokaleSperre.clear(); }
async function nummerHash(n: string) {
  const geheim = process.env.SESSION_SECRET || process.env.ANTHROPIC_API_KEY || "anruf";
  const d = await crypto.subtle.digest("SHA-256", enc.encode("anruf|" + geheim + "|" + n));
  return [...new Uint8Array(d)].slice(0, 16).map((x) => x.toString(16).padStart(2, "0")).join("");
}
/** true = diese Nummer darf heute noch eine SMS bekommen (und wird jetzt gezählt). */
export async function smsErlaubt(c: any, n: string, jetzt = Date.now()): Promise<boolean> {
  const h = await nummerHash(n);
  const ns = c?.env?.LIMITS;
  if (ns?.idFromName) {
    try { return !(await ns.get(ns.idFromName("anruf:" + h)).zaehle("anfrage", { tag: 1 })); }
    catch (e: any) { console.error("[anruf-limit]", e?.message || e); }
  }
  if (lokaleSperre.size > 5000) lokaleSperre.clear();
  const zuletzt = lokaleSperre.get(h);
  if (zuletzt && jetzt - zuletzt < 86_400_000) return false;
  lokaleSperre.set(h, jetzt);
  return true;
}

/* ---------- SMS über sipgate ---------- */
export const smsAktiv = (c: any) => !!(wert(c, "SIPGATE_TOKEN_ID") && wert(c, "SIPGATE_TOKEN"));
export async function sendeSms(c: any, an: string, text: string): Promise<"gesendet" | "probelauf" | "fehler"> {
  if (!smsAktiv(c)) { console.log(`[anruf] Probelauf: SMS an ${an.slice(0, 6)}… nicht verschickt`); return "probelauf"; }
  try {
    const r = await fetch("https://api.sipgate.com/v2/sessions/sms", {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${wert(c, "SIPGATE_TOKEN_ID")}:${wert(c, "SIPGATE_TOKEN")}`), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ smsId: wert(c, "SIPGATE_SMS_ID") || "s0", recipient: an, message: text }),
    });
    if (!r.ok) { console.error(`[anruf] SMS ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`); return "fehler"; }
    return "gesendet";
  } catch (e: any) { console.error("[anruf] SMS", e?.message || e); return "fehler"; }
}

/* ---------- Mail an den Betrieb ---------- */
const escH = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
const uhrzeit = (ms: number) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
export type SmsStatus = "gesendet" | "probelauf" | "fehler" | "festnetz" | "unterdrueckt" | "schon_heute";
const STATUS_TEXT: Record<SmsStatus, string> = {
  gesendet: "Der Anrufer hat eine SMS mit dem Link zur Anfrage bekommen.",
  probelauf: "Probelauf: Es wurde keine SMS verschickt (sipgate noch nicht verbunden).",
  fehler: "Die SMS konnte nicht verschickt werden. Bitte selbst zurückrufen.",
  festnetz: "Keine SMS: Anruf von einer Festnetznummer. Bitte selbst zurückrufen.",
  unterdrueckt: "Keine SMS: Der Anrufer hat seine Nummer unterdrückt.",
  schon_heute: "Keine SMS: Diese Nummer hat heute schon eine bekommen.",
};
export function anrufMail(c: any, b: any, nummer: string | null, status: SmsStatus, jetzt = Date.now(), probe = false): Mail | null {
  const an = [wert(c, "ANRUF_MAIL_BETRIEB_" + b.id.toUpperCase()), wert(c, "ANRUF_MAIL_BETRIEB"), wert(c, "TERMIN_MAIL_BETRIEB")].find((x) => x && gueltigeMail(x));
  if (!an) return null;
  const wer = nummer ? zeigeNummer(nummer) : "Nummer unterdrückt";
  const vorsatz = probe ? "[Probe] " : process.env.TERMIN_DEMO !== "0" ? "[Demo] " : "";
  const zeilen: [string, string][] = [["Anrufer", wer], ["Wann", uhrzeit(jetzt) + " Uhr"], ["SMS", STATUS_TEXT[status]]];
  const knopf = nummer ? `<p style="margin:16px 0 0"><a href="tel:${escH(nummer)}" style="display:inline-block;background:${b.farbe};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold">Jetzt zurückrufen</a></p>` : "";
  return {
    an, absenderName: "Anruf-Retter", betreff: `${vorsatz}Verpasster Anruf: ${wer}`,
    text: ["Verpasster Anruf bei " + b.name + ":", "", ...zeilen.map(([k, v]) => `${k}: ${v}`)].join("\n"),
    html: `<!doctype html><html lang="de"><body style="margin:0;background:#F4F2EE;font-family:Arial,Helvetica,sans-serif;color:#16222A">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid #E1E4E6">
<div style="background:#1B1D1F;color:#FFFFFF;padding:16px 20px;font-size:17px;font-weight:bold">Verpasster Anruf bei ${escH(b.name)}</div>
<div style="padding:20px;font-size:15px;line-height:1.5"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${zeilen.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#5A6A73;vertical-align:top">${escH(k)}</td><td style="padding:4px 0">${escH(v)}</td></tr>`).join("")}</table>${knopf}
<p style="margin:16px 0 0;color:#5A6A73;font-size:13px">Schreibt der Anrufer über den Link eine Anfrage, kommt sie wie gewohnt per Mail.</p></div></div></div></body></html>`,
  };
}

/* ---------- Ablauf ---------- */
export async function verarbeiteAnruf(c: any, d: { von: unknown; an: unknown; umleitung?: unknown }, probe = false) {
  const b = betriebFuer(c, d.an, d.umleitung);
  const nummer = normNummer(d.von);
  let status: SmsStatus;
  if (!nummer) status = "unterdrueckt";
  else if (!istHandy(nummer)) status = "festnetz";
  else if (probe) status = "probelauf";
  else if (!(await smsErlaubt(c, nummer))) status = "schon_heute";
  else status = await sendeSms(c, nummer, smsText(c, b));
  const mail = anrufMail(c, b, nummer, status, Date.now(), probe);
  const gemailt = mail ? await sendeMail(c, mail) : false;
  console.log(`[anruf] ${b.id} sms=${status} mail=${gemailt}`);
  return { betrieb: b.id, sms: status, mail: gemailt };
}

/** Im Hintergrund weiterarbeiten, damit sipgate sofort eine Antwort bekommt. */
function imHintergrund(c: any, p: Promise<unknown>) {
  const sicher = p.catch((e) => console.error("[anruf]", e?.message || e));
  try { c.executionCtx.waitUntil(sicher); return null; } catch { return sicher; }
}

export function anrufRouten(app: Hono) {
  app.post("/api/anruf/sipgate", async (c) => {
    const xml = (s: string, status = 200) => c.body(s, status as any, { "Content-Type": "application/xml; charset=utf-8" });
    if (Number(c.req.header("content-length") || 0) > 10_000) return xml(antwortXml(), 413);
    const roh = await c.req.text();
    if (wert(c, "ANRUF_SIGNATUR") !== "aus" && !(await echteSignatur(roh, c.req.header("x-sipgate-signature")))) {
      console.warn("[anruf] Meldung ohne gültige sipgate-Signatur abgelehnt");
      return xml(antwortXml(), 403);
    }
    const f = new URLSearchParams(roh);
    if (f.get("event") !== "newCall" || f.get("direction") !== "in") return xml(antwortXml());
    if (wert(c, "KILL_SWITCH") === "1") return xml(antwortXml());
    const warten = imHintergrund(c, verarbeiteAnruf(c, { von: f.get("from"), an: f.get("to"), umleitung: f.get("diversion") }));
    if (warten) await warten;
    return xml(antwortXml(wert(c, "ANRUF_ANSAGE")));
  });

  // Probeanruf für Vorführungen und Tests: nur aktiv mit ANRUF_PROBE = "1",
  // verschickt nie eine SMS, nur die Mail an den Betrieb.
  app.post("/api/anruf/probe", async (c) => {
    if (wert(c, "ANRUF_PROBE") !== "1") return c.json({ ok: false, fehler: "Probeanrufe sind ausgeschaltet." }, 404);
    const b: any = await c.req.json().catch(() => ({}));
    const r = await verarbeiteAnruf(c, { von: b.von, an: b.an, umleitung: b.umleitung }, true);
    return c.json({ ok: true, ...r });
  });
}
