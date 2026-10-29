// Leitet bestätigte Anfragen an den Betrieb weiter. Kanäle, je nachdem was
// eingerichtet ist (mehrere gleichzeitig möglich):
//   1. Web3Forms (Standard auf Workers): WEB3FORMS_KEY=<Access Key> – derselbe
//      Dienst wie das Kontaktformular der Website. Empfänger wird im
//      Web3Forms-Dashboard eingestellt. Fallback: FORMSUBMIT_ZIEL=support@...
//   2. Resend (E-Mail-API): RESEND_API_KEY + RESEND_FROM
//   3. SMTP (nur unter Node): SMTP_HOST, SMTP_USER, SMTP_PASS …
//   4. WhatsApp Cloud API an den Inhaber (Stufe 2): WHATSAPP_TOKEN …
// Ist nichts eingerichtet, wird die Anfrage unter Node in data/anfragen.log
// geschrieben und auf Workers ins Log ausgegeben.
import { config } from "./config.ts";

export type Anfrage = {
  name: string; kontakt: string; fahrzeug?: string; paket?: string;
  wunschtermin?: string; notiz?: string; verlauf?: string;
};
const E = (k: string) => process.env[k] || "";

function alsText(a: Anfrage) {
  return [
    `Neue Anfrage über den Website-Chat von ${config.betrieb.name}`, "",
    `Name: ${a.name}`, `Kontakt: ${a.kontakt}`, `${config.formular?.objektLabel || "Fahrzeug"}: ${a.fahrzeug || "-"}`,
    `Paket: ${a.paket || "-"}`, `Wunschtermin: ${a.wunschtermin || "-"}`, `Notiz: ${a.notiz || "-"}`,
    "", "— Gesprächsverlauf —", a.verlauf || "(nicht übermittelt)",
  ].join("\n");
}

/** Was der Browser an den Formulardienst schickt (Adresse + Felder).
 *  Web3Forms, wenn WEB3FORMS_KEY gesetzt ist, sonst FormSubmit (FORMSUBMIT_ZIEL). */
export function formsubmitDaten(a: Anfrage): { url: string; daten: Record<string, string> } | null {
  const betreff = `Chat-Anfrage: ${a.paket || "Allgemein"} – ${a.name}`;
  const felder: Record<string, string> = {
    Name: a.name, Kontakt: a.kontakt, [config.formular?.objektLabel || "Fahrzeug"]: a.fahrzeug || "-",
    Paket: a.paket || "-", Wunschtermin: a.wunschtermin || "-", Notiz: a.notiz || "-",
    Gesprächsverlauf: a.verlauf || "(nicht übermittelt)",
  };
  const email = a.kontakt.includes("@") ? a.kontakt : "";
  if (E("WEB3FORMS_KEY")) {
    return {
      url: "https://api.web3forms.com/submit",
      daten: {
        access_key: E("WEB3FORMS_KEY"), subject: betreff, from_name: `Website-Chat ${config.betrieb.name}`,
        ...felder, ...(email ? { replyto: email } : {}),
      },
    };
  }
  if (!E("FORMSUBMIT_ZIEL")) return null;
  return {
    url: `https://formsubmit.co/ajax/${encodeURIComponent(E("FORMSUBMIT_ZIEL"))}`,
    daten: { _subject: betreff, _template: "box", _captcha: "false", ...felder, ...(email ? { _replyto: email } : {}) },
  };
}

export async function sendeAnfrage(a: Anfrage): Promise<{ ok: boolean; kanal: string }> {
  const text = alsText(a);
  const betreff = `Chat-Anfrage: ${a.paket || "Allgemein"} – ${a.name}`;
  const kanaele: string[] = [];

  if (E("WHATSAPP_TOKEN")) await whatsapp(a).then(() => kanaele.push("whatsapp")).catch((e) => console.error("[whatsapp]", e.message));

  // Der Formulardienst läuft im Browser des Kunden (siehe formsubmitDaten): Von
  // Cloudflare-Servern aus blocken FormSubmit (429) und Web3Forms-Free
  // Anfragen, vom Browser auf der eigenen Website aus funktioniert es.
  if (E("WEB3FORMS_KEY")) kanaele.push("web3forms-browser");
  else if (E("FORMSUBMIT_ZIEL")) kanaele.push("formsubmit-browser");

  if (E("RESEND_API_KEY")) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${E("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: E("RESEND_FROM"), to: E("ANFRAGE_EMPFAENGER") || config.betrieb.email, reply_to: a.kontakt.includes("@") ? a.kontakt : undefined, subject: betreff, text }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}`);
    kanaele.push("resend");
  }

  if (E("SMTP_HOST")) {
    const nodemailer = (await import("nodemailer")).default;
    await nodemailer.createTransport({
      host: E("SMTP_HOST"), port: Number(E("SMTP_PORT") || 587), secure: E("SMTP_SECURE") === "1",
      auth: { user: E("SMTP_USER"), pass: E("SMTP_PASS") },
    }).sendMail({ from: E("SMTP_FROM") || E("SMTP_USER"), to: E("ANFRAGE_EMPFAENGER") || config.betrieb.email, replyTo: a.kontakt.includes("@") ? a.kontakt : undefined, subject: betreff, text });
    kanaele.push("smtp");
  }

  if (!kanaele.length) {
    try {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(new URL("../data/anfragen.log", import.meta.url), `${new Date().toISOString()}\n${text}\n\n`);
      console.log("[anfrage] gespeichert in data/anfragen.log (kein Versand eingerichtet)");
    } catch {
      console.log("[anfrage] kein Versand eingerichtet:\n" + text);
    }
    kanaele.push("log");
  }
  return { ok: true, kanal: kanaele.join("+") };
}

// Stufe 2: Kurze Info an den Inhaber per WhatsApp Cloud API (genehmigte Vorlage nötig).
async function whatsapp(a: Anfrage) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${E("WHATSAPP_PHONE_ID")}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${E("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: E("WHATSAPP_INHABER"), type: "template",
      template: { name: E("WHATSAPP_TEMPLATE") || "neue_anfrage", language: { code: "de" },
        components: [{ type: "body", parameters: [a.name, a.paket || "-", a.kontakt].map((t) => ({ type: "text", text: t })) }] },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}`);
}
