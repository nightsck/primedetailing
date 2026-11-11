// E-Mails verschicken (Termin-Bestätigung an Kunde und Betrieb).
//
// Anbieter, je nachdem was eingerichtet ist:
//   Brevo (empfohlen, Firma in der EU):  Secret BREVO_API_KEY
//   Resend:                              Secret RESEND_API_KEY
// Absender: MAIL_ABSENDER (z. B. termine@deine-domain.de), die Domain muss beim
// Anbieter bestätigt sein. Optional MAIL_ABSENDER_NAME.
// Ohne Schlüssel oder Absender wird nichts verschickt (mailAktiv() = false).
//
// Schutz gegen Missbrauch: höchstens MAIL_TAGESLIMIT Mails pro Tag für den
// ganzen Bot (Standard 100), gezählt im gemeinsamen Zähler (Durable Object).
import { kundeImKontext } from "./kontext.ts";
const wert = (c: any, k: string): string => String(c?.env?.[k] ?? process.env[k] ?? "").trim();

export type Mail = {
  an: string; anName?: string; betreff: string; text: string; html: string;
  antwortAn?: string; absenderName?: string; anhang?: { name: string; inhalt: string }[];
};

export function mailAnbieter(c: any): "brevo" | "resend" | null {
  if (!wert(c, "MAIL_ABSENDER")) return null;
  if (wert(c, "BREVO_API_KEY")) return "brevo";
  if (wert(c, "RESEND_API_KEY")) return "resend";
  return null;
}
export const mailAktiv = (c: any) => mailAnbieter(c) !== null;
export const gueltigeMail = (s: string) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(s);

const b64 = (s: string) => { const u = new TextEncoder().encode(s); let x = ""; for (const b of u) x += String.fromCharCode(b); return btoa(x); };

// Tageskontingent für alle Mails zusammen
let lokal: Record<string, { tag: string; n: number }> = {};
async function kontingent(c: any): Promise<boolean> {
  const max = Number(wert(c, "MAIL_TAGESLIMIT")) || 100;
  const ns = c?.env?.LIMITS;
  if (ns?.idFromName) {
    try { return !(await ns.get(ns.idFromName(kundeImKontext() ? "mail:tag:" + kundeImKontext() : "mail:tag")).zaehle("anfrage", { tag: max })); }
    catch (e: any) { console.error("[mail-limit]", e?.message || e); }
  }
  const heute = new Date().toISOString().slice(0, 10);
  const k = kundeImKontext() || "";
  if (lokal[k]?.tag !== heute) lokal[k] = { tag: heute, n: 0 };
  if (lokal[k].n >= max) return false;
  lokal[k].n++; return true;
}
/** Nur für Tests. */
export function _resetMail() { lokal = {}; }

export async function sendeMail(c: any, m: Mail): Promise<boolean> {
  const anbieter = mailAnbieter(c);
  if (!anbieter || !gueltigeMail(m.an)) return false;
  if (!(await kontingent(c))) { console.warn("[mail] Tageslimit erreicht"); return false; }
  const von = wert(c, "MAIL_ABSENDER");
  const name = (m.absenderName || wert(c, "MAIL_ABSENDER_NAME") || "Termine").replace(/["<>]/g, "").slice(0, 70);
  const antwort = m.antwortAn && gueltigeMail(m.antwortAn) ? m.antwortAn : "";
  try {
    let r: Response;
    if (anbieter === "brevo") {
      r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST", headers: { "api-key": wert(c, "BREVO_API_KEY"), "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { name, email: von }, to: [{ email: m.an, ...(m.anName ? { name: m.anName.slice(0, 70) } : {}) }],
          ...(antwort ? { replyTo: { email: antwort } } : {}),
          subject: m.betreff, htmlContent: m.html, textContent: m.text,
          ...(m.anhang?.length ? { attachment: m.anhang.map((a) => ({ name: a.name, content: b64(a.inhalt) })) } : {}),
        }),
      });
    } else {
      r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${wert(c, "RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${name} <${von}>`, to: [m.an], ...(antwort ? { reply_to: antwort } : {}),
          subject: m.betreff, html: m.html, text: m.text,
          ...(m.anhang?.length ? { attachments: m.anhang.map((a) => ({ filename: a.name, content: b64(a.inhalt) })) } : {}),
        }),
      });
    }
    if (!r.ok) { console.error(`[mail] ${anbieter} ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`); return false; }
    return true;
  } catch (e: any) {
    console.error("[mail]", e?.message || e);
    return false;
  }
}
