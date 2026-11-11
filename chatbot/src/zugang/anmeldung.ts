// Anmeldung im Kunden-Zugang (/k/<kunde>/verwalten) – ohne Passwort.
//
// Ablauf: E-Mail eintragen → Mail mit 6-stelligem Code → Code eintippen.
// Es gibt bewusst keinen Anmelde-Link: Ein Link kann weitergeleitet werden oder
// in einem Verlauf landen, ein Code nicht.
//
// Schutz (siehe sicherheit.ts):
//   - Nur Adressen, die beim Kunden hinterlegt sind (Admin-Panel → Kunden-Zugang).
//   - Der Code gilt 10 Minuten und einmal, liegt nur als Hash im Speicher,
//     und ein neuer Code macht den alten ungültig.
//   - Pro Adresse höchstens 6 Code-Mails und 8 falsche Codes am Tag,
//     dazu das Limit pro Besucher (limits.ts, Art „login“).
//   - Die Antwort ist immer gleich, egal ob es die Adresse gibt.
//   - Sitzung: 12 Stunden, Cookie nur für diese eine Kunden-Seite
//     (HttpOnly, Secure, SameSite=Strict), an Kunde und Adresse gebunden.
//     Wird die Adresse entfernt oder der Zugang abgeschaltet, ist sofort Schluss.
import type { Kunde } from "../kunde/schema.ts";
import { speicherVon } from "../speicher/schnittstelle.ts";
import { sendeMail, mailAktiv } from "../mail.ts";
import { sha, zufallsCode, signiere, pruefeSignatur, cookieWert } from "../sicherheit.ts";

const GUELTIG_MIN = 10, SITZUNG_STD = 12, MAX_MAILS_TAG = 6, MAX_FALSCH_TAG = 8;
const LOGIN_ZAEHLER = "_login", ZWECK = "kunden-zugang", COOKIE = "__Secure-kz";

export const zugangAn = (k: Kunde): boolean => !!k.zugang?.aktiv;
/** Wer sich bei diesem Kunden anmelden darf. */
export function zugangsAdressen(k: Kunde): string[] {
  const a = k.zugang?.adressen?.length ? k.zugang.adressen : [k.stammdaten.email];
  return a.map((s) => s.trim().toLowerCase()).filter(Boolean);
}
const pfad = (k: Kunde) => `/k/${k.id}/verwalten`;
const schluessel = (k: Kunde, email: string) => `k:${k.id}:${email}`;
const adresse = (roh: unknown) => String(roh || "").trim().toLowerCase().slice(0, 120);
const heute = () => new Date().toISOString().slice(0, 10);
async function zaehler(c: any, art: string): Promise<number> {
  return (await speicherVon(c).auswertung(LOGIN_ZAEHLER, 1)).find((z) => z.tag === heute() && z.art === art)?.n || 0;
}

let letzter: { kunde: string; email: string; code: string } | null = null;
/** Nur für Tests und lokale Entwicklung: der zuletzt erzeugte Code. */
export const _letzterKundenCode = () => letzter;
export const _vergissKundenCode = () => { letzter = null; };

/** Schickt den Code. Sagt nie, ob es die Adresse gibt. */
export async function schickeKundenCode(c: any, k: Kunde, emailRoh: unknown): Promise<void> {
  const email = adresse(emailRoh);
  if (!zugangAn(k) || !zugangsAdressen(k).includes(email)) return;
  const sp = speicherVon(c), key = schluessel(k, email), kurzId = (await sha(key)).slice(0, 20); // im Zähler steht keine Adresse im Klartext
  if ((await zaehler(c, "mail:" + kurzId)) >= MAX_MAILS_TAG) return;
  await sp.zaehle(LOGIN_ZAEHLER, "mail:" + kurzId);
  const code = zufallsCode();
  await sp.loginLoeschen(key); // ältere Codes gelten ab jetzt nicht mehr
  await sp.loginMerken(await sha(`kcode|${key}|${code}`), key, Date.now() + GUELTIG_MIN * 60_000);
  letzter = { kunde: k.id, email, code };
  if (!mailAktiv(c)) {
    console.log(`[kunden-zugang] Mailversand ist nicht eingerichtet. Code für ${email} (${k.id}): ${code}`);
    return;
  }
  const firma = k.stammdaten.firmenname.replace(/[<>&"]/g, "");
  await sendeMail(c, {
    an: email, betreff: `${code} ist Ihr Code für den Website-Assistenten`, absenderName: "ki-für-meinen-betrieb.de",
    text: `Ihr Code für die Einstellungen des Website-Assistenten von ${firma}: ${code}\n\nDer Code gilt ${GUELTIG_MIN} Minuten. Geben Sie ihn nie weiter – wir fragen nie danach.\nNicht angefordert? Dann können Sie diese Mail ignorieren; ohne den Code kommt niemand hinein.`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#1f2a37"><p>Ihr Code für die Einstellungen des Website-Assistenten von <b>${firma}</b>:</p><p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:8px 0 18px">${code}</p><p style="color:#556;font-size:13px">Der Code gilt ${GUELTIG_MIN} Minuten. Geben Sie ihn nie weiter – wir fragen nie danach.<br>Nicht angefordert? Dann können Sie diese Mail ignorieren; ohne den Code kommt niemand hinein.</p></div>`,
  });
}

/** Löst den Code ein. Gibt das Sitzungs-Cookie zurück oder null. */
export async function loeseKundenCodeEin(c: any, k: Kunde, emailRoh: unknown, codeRoh: unknown): Promise<string | null> {
  const email = adresse(emailRoh), code = String(codeRoh || "").replace(/\D/g, "").slice(0, 6);
  if (!zugangAn(k) || code.length !== 6 || !zugangsAdressen(k).includes(email)) return null;
  const sp = speicherVon(c), key = schluessel(k, email), kurzId = (await sha(key)).slice(0, 20);
  // Schutz gegen Durchprobieren: nach 8 falschen Codes ist für diese Adresse heute Schluss
  if ((await zaehler(c, "falsch:" + kurzId)) >= MAX_FALSCH_TAG) return null;
  if ((await sp.loginPruefen(await sha(`kcode|${key}|${code}`), true)) !== key) {
    await sp.zaehle(LOGIN_ZAEHLER, "falsch:" + kurzId);
    return null;
  }
  await sp.loginLoeschen(key);
  const wert = await signiere(ZWECK, { k: k.id, e: email, bis: Date.now() + SITZUNG_STD * 3_600_000 });
  return `${COOKIE}=${wert}; Path=${pfad(k)}; Max-Age=${SITZUNG_STD * 3600}; HttpOnly; Secure; SameSite=Strict`;
}
export const abmeldeCookie = (k: Kunde) => `${COOKIE}=; Path=${pfad(k)}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

/** Wer ist bei diesem Kunden angemeldet? Gibt die E-Mail zurück oder null. */
export async function kundeAngemeldet(c: any, k: Kunde): Promise<string | null> {
  const d = await pruefeSignatur(ZWECK, cookieWert(c, COOKIE));
  // Das Cookie gilt nur für genau diesen Kunden, und nur solange die Adresse noch freigeschaltet ist
  return d && d.k === k.id && typeof d.e === "string" && zugangAn(k) && zugangsAdressen(k).includes(d.e) ? d.e : null;
}
