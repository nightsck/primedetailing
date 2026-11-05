// Kontaktformular der Firmen-Website ki-für-meinen-betrieb.de
//
//   POST /api/kontakt   { name, betrieb, branche, telefon, email, nachricht, einwilligung, _honey }
//
// Ersetzt FormSubmit: Die Anfrage geht über unseren Worker und Brevo (EU) als
// Mail an uns. Nichts wird gespeichert.
//
// Einstellungen (Cloudflare → Worker → Variablen):
//   KONTAKT_MAIL   Empfänger, Standard kifuermeinenbetrieb@gmail.com
// Absender kommt aus MAIL_ABSENDER (wie beim Termin-Bot).
import type { Hono } from "hono";
import { sendeMail, gueltigeMail } from "./mail.ts";
import { pruefeLimit } from "./limits.ts";

const wert = (c: any, k: string): string => String(c?.env?.[k] ?? process.env[k] ?? "").trim();
const kurz = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, max);
const html = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

export function pruefeKontakt(b: any): { ok: true; d: Record<string, string> } | { ok: false; fehler: string } {
  const d = {
    name: kurz(b?.name, 100), betrieb: kurz(b?.betrieb, 120), branche: kurz(b?.branche, 60),
    telefon: kurz(b?.telefon, 40), email: kurz(b?.email, 120), nachricht: kurz(b?.nachricht, 3000),
  };
  if (!d.name || !d.betrieb) return { ok: false, fehler: "Bitte Name und Betrieb angeben." };
  if (!gueltigeMail(d.email)) return { ok: false, fehler: "Bitte eine gültige E-Mail-Adresse angeben." };
  if (b?.einwilligung !== true) return { ok: false, fehler: "Bitte dem Datenschutzhinweis zustimmen." };
  return { ok: true, d };
}

export function kontaktRouten(app: Hono) {
  app.post("/api/kontakt", async (c) => {
    const b = await c.req.json().catch(() => ({}));
    // Spam-Falle: echte Besucher sehen dieses Feld nicht
    if (kurz((b as any)?._honey, 200)) return c.json({ ok: true });
    const p = pruefeKontakt(b);
    if (!p.ok) return c.json({ ok: false, fehler: p.fehler }, 400);
    if (await pruefeLimit(c, "anfrage")) return c.json({ ok: false, fehler: "Zu viele Anfragen. Bitte schreiben Sie uns eine E-Mail." }, 429);
    const d = p.d;
    const an = [wert(c, "KONTAKT_MAIL"), "kifuermeinenbetrieb@gmail.com"].find((x) => x && gueltigeMail(x))!;
    const zeilen: [string, string][] = [["Name", d.name], ["Betrieb", d.betrieb], ["Branche", d.branche || "–"], ["Telefon", d.telefon || "–"], ["E-Mail", d.email]];
    const ok = await sendeMail(c, {
      an, absenderName: "Website KI für meinen Betrieb", antwortAn: d.email,
      betreff: `Anfrage Erstgespräch – ${d.betrieb}`,
      text: [...zeilen.map(([k, v]) => `${k}: ${v}`), "", "Nachricht:", d.nachricht || "–"].join("\n"),
      html: `<p>Neue Anfrage über das Kontaktformular:</p><table cellpadding="4">${zeilen.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${html(v)}</td></tr>`).join("")}</table>`
        + `<p><b>Nachricht:</b><br>${html(d.nachricht || "–").replace(/\n/g, "<br>")}</p><p style="color:#667">Mit „Antworten“ schreiben Sie direkt dem Interessenten.</p>`,
    });
    console.log(`[kontakt] Anfrage ${ok ? "verschickt" : "NICHT verschickt"}`);
    if (!ok) return c.json({ ok: false, fehler: "Senden fehlgeschlagen." }, 502);
    return c.json({ ok: true });
  });
}
