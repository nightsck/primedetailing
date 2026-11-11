// Anmeldung im Admin-Panel – ohne Passwort.
//
// Ablauf: E-Mail eintragen → Mail mit 6-stelligem Code UND Link. Entweder den
// Code eintippen oder den Link öffnen und dort auf „Anmelden“ klicken.
// Der Link wird erst durch diesen Klick verbraucht, nicht schon beim Öffnen.
// So schadet es nicht, wenn ein Mailprogramm den Link für die Vorschau abruft
// oder man doppelt klickt (das war das Problem beim CRM-Login).
//
// Wer rein darf: Variable ADMIN_LOGIN (kommagetrennt), sonst CRM_LOGIN.
// Angemeldet bleibt man 14 Tage (signiertes Cookie, nur für /admin).
import { env } from "../config.ts";
import { speicherVon } from "../speicher/schnittstelle.ts";
import { sendeMail, mailAktiv } from "../mail.ts";

const wert = (c: any, k: string): string => String(c?.env?.[k] ?? process.env[k] ?? "").trim();
const enc = new TextEncoder();
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

const GUELTIG_MIN = 15, SITZUNG_TAGE = 14;

export function erlaubteAdressen(c: any): string[] {
  const roh = wert(c, "ADMIN_LOGIN") || wert(c, "CRM_LOGIN") || "kifuermeinenbetrieb@gmail.com";
  return roh.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

let schluessel: CryptoKey | null = null;
async function key() {
  if (schluessel) return schluessel;
  const geheim = env.sessionSecret || [...crypto.getRandomValues(new Uint8Array(32))].join(",");
  schluessel = await crypto.subtle.importKey("raw", enc.encode("admin-sitzung|" + geheim), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return schluessel;
}

async function sitzungsCookie(email: string): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify({ e: email, bis: Date.now() + SITZUNG_TAGE * 86_400_000 })));
  const sig = b64u(new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body))));
  return `adm=${body}.${sig}; Path=/admin; Max-Age=${SITZUNG_TAGE * 86400}; HttpOnly; Secure; SameSite=Lax`;
}
export const ABMELDE_COOKIE = "adm=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Lax";

/** Wer ist angemeldet? Gibt die E-Mail zurück oder null. */
export async function angemeldet(c: any): Promise<string | null> {
  const m = /(?:^|;\s*)adm=([^;]+)/.exec(c.req.header("cookie") || "");
  if (!m || !m[1].includes(".")) return null;
  const [body, sig] = m[1].split(".");
  try {
    if (!(await crypto.subtle.verify("HMAC", await key(), unb64u(sig), enc.encode(body)))) return null;
    const d = JSON.parse(new TextDecoder().decode(unb64u(body)));
    // Auch nach dem Entfernen aus ADMIN_LOGIN ist sofort Schluss
    return typeof d?.e === "string" && d.bis > Date.now() && erlaubteAdressen(c).includes(d.e) ? d.e : null;
  } catch { return null; }
}

let letzter: { email: string; code: string; token: string } | null = null;
/** Nur für Tests und lokale Entwicklung: der zuletzt erzeugte Code. */
export const _letzterCode = () => letzter;

/** Schickt Code und Link. Antwortet immer gleich, damit niemand erlaubte Adressen erraten kann. */
export async function schickeCode(c: any, emailRoh: unknown): Promise<void> {
  const email = String(emailRoh || "").trim().toLowerCase();
  if (!erlaubteAdressen(c).includes(email)) return;
  const zahl = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const code = String(zahl).padStart(6, "0");
  const token = b64u(crypto.getRandomValues(new Uint8Array(24)));
  const bis = Date.now() + GUELTIG_MIN * 60_000, sp = speicherVon(c);
  await sp.loginMerken(await sha(`code|${email}|${code}`), email, bis);
  await sp.loginMerken(await sha(`link|${token}`), email, bis);
  letzter = { email, code, token };
  const link = `${new URL(c.req.url).origin}/admin?t=${token}`;
  if (!mailAktiv(c)) {
    // Ohne eingerichteten Mailversand steht der Code im Server-Log (lokal: Konsole; Cloudflare: Logs)
    console.log(`[admin-login] Mailversand ist nicht eingerichtet. Code für ${email}: ${code}`);
    return;
  }
  await sendeMail(c, {
    an: email, betreff: `${code} ist dein Code fürs Admin-Panel`, absenderName: "ki-für-meinen-betrieb.de",
    text: `Dein Code: ${code}\n\nOder diesen Link öffnen und auf „Anmelden“ klicken:\n${link}\n\nCode und Link gelten ${GUELTIG_MIN} Minuten. Nicht angefordert? Dann einfach ignorieren.`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#1f2a37"><p>Dein Code fürs Admin-Panel:</p><p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:8px 0 18px">${code}</p><p>Oder <a href="${link}">diesen Link öffnen</a> und auf „Anmelden“ klicken.</p><p style="color:#778;font-size:13px">Code und Link gelten ${GUELTIG_MIN} Minuten. Nicht angefordert? Dann einfach ignorieren.</p></div>`,
  });
}

/** Löst Code (mit E-Mail) oder Link-Token ein. Gibt das Cookie zurück oder null. */
export async function loeseEin(c: any, b: { email?: unknown; code?: unknown; token?: unknown }): Promise<string | null> {
  const sp = speicherVon(c);
  let email: string | null = null;
  if (typeof b.token === "string" && b.token.length < 80) email = await sp.loginPruefen(await sha(`link|${b.token}`), true);
  else if (b.email && b.code) {
    const e = String(b.email).trim().toLowerCase(), code = String(b.code).replace(/\D/g, "").slice(0, 6);
    email = await sp.loginPruefen(await sha(`code|${e}|${code}`), true);
  }
  if (!email || !erlaubteAdressen(c).includes(email)) return null;
  return sitzungsCookie(email);
}
