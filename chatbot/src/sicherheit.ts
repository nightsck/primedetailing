// Gemeinsame Sicherheits-Bausteine für alle Bereiche mit Anmeldung
// (Admin-Panel, Kunden-Zugang) und für die Antwort-Köpfe aller Seiten.
//
// Orientiert an den frei verfügbaren OWASP-Empfehlungen:
//   Anmelde-Codes   – OWASP Authentication / Multifactor Cheat Sheet:
//                     zufällig, kurz gültig, nur einmal benutzbar, nur als Hash gespeichert,
//                     alte Codes werden ungültig, Versuche sind begrenzt.
//   Sitzungen       – OWASP Session Management Cheat Sheet:
//                     Cookie mit HttpOnly, Secure, SameSite=Strict, enger Pfad, feste Laufzeit.
//   Fremde Websites – OWASP CSRF Cheat Sheet: Herkunft prüfen + eigener Kopf bei jedem
//                     schreibenden Aufruf.
//   Antwort-Köpfe   – OWASP Secure Headers Project: HSTS, nosniff, Referrer-Policy,
//                     Content-Security-Policy, Permissions-Policy, COOP, CORP.
import type { MiddlewareHandler } from "hono";
import { env } from "./config.ts";

const enc = new TextEncoder();
export const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
export const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** 6-stelliger Code, jede Ziffernfolge gleich wahrscheinlich (ohne die kleine Schieflage von „Zufallszahl modulo 1.000.000“). */
export function zufallsCode(): string {
  const grenze = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  for (;;) {
    const z = crypto.getRandomValues(new Uint32Array(1))[0];
    if (z < grenze) return String(z % 1_000_000).padStart(6, "0");
  }
}
/** Langes Zufalls-Token für Links und für die Script-Freigabe einer Seite (nonce). */
export const zufallsToken = (bytes = 24) => b64u(crypto.getRandomValues(new Uint8Array(bytes)));

// --- Signierte Werte (Sitzungs-Cookies) --------------------------------------
const schluessel = new Map<string, Promise<CryptoKey>>();
// Ohne SESSION_SECRET gilt ein Zufallswert bis zum Neustart: sicher, aber Sitzungen überleben keinen Neustart.
const ersatzGeheimnis = [...crypto.getRandomValues(new Uint8Array(32))].join(",");
function key(zweck: string): Promise<CryptoKey> {
  let k = schluessel.get(zweck);
  // Jeder Zweck bekommt einen eigenen Schlüssel: Ein Admin-Cookie gilt nie als Kunden-Cookie und umgekehrt.
  if (!k) schluessel.set(zweck, k = crypto.subtle.importKey("raw", enc.encode(zweck + "|" + (env.sessionSecret || ersatzGeheimnis)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
  return k;
}
/** Daten signieren → "inhalt.unterschrift". Der Inhalt ist lesbar, aber nicht fälschbar. */
export async function signiere(zweck: string, daten: Record<string, unknown>): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(daten)));
  return body + "." + b64u(new Uint8Array(await crypto.subtle.sign("HMAC", await key(zweck), enc.encode(body))));
}
/** Prüft Unterschrift und Ablauf (Feld `bis`). Gibt die Daten zurück oder null. */
export async function pruefeSignatur(zweck: string, wert: string | undefined | null): Promise<any | null> {
  if (!wert || wert.length > 2000 || wert.split(".").length !== 2) return null;
  const [body, sig] = wert.split(".");
  try {
    if (!(await crypto.subtle.verify("HMAC", await key(zweck), unb64u(sig), enc.encode(body)))) return null;
    const d = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return d && typeof d === "object" && typeof d.bis === "number" && d.bis > Date.now() ? d : null;
  } catch { return null; }
}
export const cookieWert = (c: any, name: string): string | null => {
  for (const teil of String(c.req.header("cookie") || "").split(";")) {
    const i = teil.indexOf("=");
    if (i > 0 && teil.slice(0, i).trim() === name) return teil.slice(i + 1).trim();
  }
  return null;
};

// --- Schutz vor untergeschobenen Aufrufen von fremden Websites ----------------
/**
 * Kommt der Aufruf von unserer eigenen Seite? Der Browser schickt bei schreibenden
 * Aufrufen die Herkunft mit (Origin) und sagt, ob sie von derselben Seite stammen
 * (Sec-Fetch-Site). Stimmt eines davon nicht, ist es eine fremde Website.
 */
export function eigeneHerkunft(c: any): boolean {
  const eigene = new URL(c.req.url).origin, herkunft = c.req.header("origin");
  if (herkunft && herkunft !== eigene) return false;
  const sfs = c.req.header("sec-fetch-site");
  return !sfs || sfs === "same-origin" || sfs === "none";
}

// --- Antwort-Köpfe -------------------------------------------------------------
/**
 * Regeln für unsere eigenen Seiten mit Anmeldung: Der Browser führt nur das Skript mit
 * der passenden Freigabe (nonce) aus, lädt nichts von fremden Servern, schickt Daten
 * nur an uns und zeigt die Seite nicht in fremden Rahmen. Eingeschleuster Code läuft so nicht.
 */
export function seitenKoepfe(nonce: string, opt: { rahmenSelbst?: boolean } = {}): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'none'", `script-src 'nonce-${nonce}'`, "style-src 'unsafe-inline'", "img-src 'self' data:",
      "connect-src 'self'", opt.rahmenSelbst ? "frame-src 'self'" : "frame-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
    ].join("; "),
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
}
/** Setzt die Script-Freigabe in eine fertige HTML-Seite ein. */
export const mitNonce = (html: string, nonce: string) => html.replace(/<script>/g, `<script nonce="${nonce}">`);

/**
 * Grund-Schutz für JEDE Antwort des Servers:
 *   - nur verschlüsselt (HSTS), sobald die Seite über https läuft
 *   - der Browser rät keine Dateitypen (nosniff)
 *   - beim Klick auf fremde Links wird höchstens unsere Adresse ohne Pfad verraten
 * Köpfe, die eine Route selbst gesetzt hat, bleiben unverändert.
 */
export const grundSchutz: MiddlewareHandler = async (c, next) => {
  await next();
  try {
    const h = c.res.headers;
    const https = new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https";
    if (https && !h.has("Strict-Transport-Security")) h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (!h.has("X-Content-Type-Options")) h.set("X-Content-Type-Options", "nosniff");
    if (!h.has("Referrer-Policy")) h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  } catch { /* Antwort mit festen Köpfen (z. B. durchgereicht): so lassen */ }
};
