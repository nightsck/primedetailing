// Die eigentliche Web-App (Hono), unabhängig von der Plattform.
// Läuft unter Node (src/node.ts) und auf Cloudflare Workers (src/worker.ts).
//
// Gesprächsverlauf: Er wird nicht auf dem Server gespeichert, sondern als
// signiertes Token an den Browser gegeben und mit jeder Nachricht zurückgeschickt.
// Die Signatur (HMAC mit SESSION_SECRET) verhindert, dass jemand dem Bot
// gefälschte frühere Antworten unterschiebt. So funktioniert es auch auf
// Workers, wo es keinen dauerhaften Arbeitsspeicher gibt.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { config, env, texte } from "./config.ts";
import { antworte, type Msg } from "./llm.ts";
import { istInjection, INJECTION_ANTWORT } from "./guard.ts";
import { sendeAnfrage, formsubmitDaten } from "./benachrichtigung.ts";
import { WIDGET_JS, DEMO_HTML } from "./daten.generated.ts";
import { pruefeLimit } from "./limits.ts";
import { pruefeBild, fotoAktiv, maxFotos, fotosImVerlauf, FOTO_MARKER, type Bild } from "./foto.ts";

// --- Signiertes Verlaufs-Token ---------------------------------------------
const enc = new TextEncoder();
let schluessel: CryptoKey | null = null;
async function key() {
  if (schluessel) return schluessel;
  const secret = env.sessionSecret || [...crypto.getRandomValues(new Uint8Array(32))].join(",");
  if (!env.sessionSecret) console.warn("[hinweis] SESSION_SECRET fehlt – Gespräche überleben keinen Neustart.");
  schluessel = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return schluessel;
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function signiere(verlauf: Msg[]): Promise<string> {
  const body = b64(enc.encode(JSON.stringify(verlauf)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  return body + "." + b64(sig);
}
async function pruefeToken(token: unknown): Promise<Msg[]> {
  if (typeof token !== "string" || !token.includes(".") || token.length > 60_000) return [];
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), unb64(sig), enc.encode(body));
    if (!ok) return [];
    const v = JSON.parse(new TextDecoder().decode(unb64(body)));
    return Array.isArray(v) ? v.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string") : [];
  } catch { return []; }
}

export const app = new Hono();

app.use("/api/*", cors({
  origin: (o) => (env.allowedOrigins.length === 0 || env.allowedOrigins.includes(o) ? o : ""),
  allowMethods: ["POST", "GET"],
}));

app.post("/api/chat", async (c) => {
  if (Number(c.req.header("content-length") || 0) > 2_200_000) return c.json({ ok: false }, 413);
  const body = await c.req.json().catch(() => ({}));
  const L = config.limits;
  let nachricht = String(body.nachricht || "").trim().slice(0, L.maxZeichenProNachricht);
  const verlauf = await pruefeToken(body.verlauf);

  return streamSSE(c, async (stream) => {
    const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
    const fertig = async () => { await send("verlauf", { token: await signiere(verlauf) }); await send("fertig", {}); };
    const nurText = async (text: string, ui?: Record<string, unknown>) => { await send("text", { text }); if (ui) await send("ui", ui); return fertig(); };

    // Foto prüfen (Format, Größe, Anzahl pro Gespräch)
    let bild: Bild | undefined;
    if (body.bild !== undefined && body.bild !== null && body.bild !== "") {
      if (!fotoAktiv()) return nurText(texte.fehler);
      const p = pruefeBild(body.bild);
      if (!p.ok) return nurText(config.ton.anrede === "du" ? "Das Foto konnte ich nicht öffnen. Versuch es bitte mit einem normalen Handyfoto (JPG oder PNG)." : "Das Foto konnte ich nicht öffnen. Bitte versuchen Sie es mit einem normalen Handyfoto (JPG oder PNG).");
      if (fotosImVerlauf(verlauf) >= maxFotos()) return nurText(texte.zuVieleFotos, { typ: "uebergabe", grund: "fotos" });
      bild = p.bild;
      if (!nachricht) nachricht = config.ton.anrede === "du" ? "Hier ist ein Foto. Was empfiehlst du?" : "Hier ist ein Foto. Was empfehlen Sie?";
    }
    if (!nachricht) return fertig();

    const sperre = await pruefeLimit(c, bild ? "foto" : "chat");
    if (sperre) return nurText(sperre, { typ: "uebergabe", grund: "limit" });
    const zeichen = verlauf.reduce((n, m) => n + String(m.content).length, 0);
    if (verlauf.length >= L.maxNachrichtenProGespraech * 2 || zeichen > (L.maxZeichenProGespraech ?? 12000))
      return nurText(texte.zuLang, { typ: "uebergabe", grund: "limit" });

    verlauf.push({ role: "user", content: bild ? `${FOTO_MARKER} ${nachricht}` : nachricht });
    if (istInjection(nachricht)) {
      console.log(`[injection] ${nachricht.slice(0, 120)}`);
      await send("text", { text: INJECTION_ANTWORT });
      verlauf.push({ role: "assistant", content: INJECTION_ANTWORT });
      return fertig();
    }
    // Einmal automatisch neu versuchen, wenn die KI kurz nicht erreichbar ist
    // (Überlastung, Netzwerk, vereinzelte 403 vom Anbieter) – aber nur, solange
    // der Kunde noch nichts von dieser Antwort gesehen hat.
    let schonGesendet = false;
    const uiGesendet = new Set<string>();
    const emit = async (e: any) => {
      if (e.type === "text") { if (e.text.trim()) schonGesendet = true; await send("text", { text: e.text }); }
      else if (e.type === "ui") { uiGesendet.add(e.ui?.typ); await send("ui", e.ui); }
      else if (e.type === "blockiert") console.warn(`[blockiert] ${e.grund}: ${e.detail}`);
    };
    for (let versuch = 1; versuch <= 2; versuch++) {
      try {
        const antwort = await antworte(verlauf, emit, { bild });
        let text = antwort;
        // Nie stumm bleiben: Kam keine Antwort, trotzdem weiterhelfen
        if (!schonGesendet) {
          const terminWunsch = /termin|anfrag|buch|reserv|vorbei|wann|zeit/i.test(nachricht) || uiGesendet.has("anfrage_formular");
          text = terminWunsch ? texte.fehlerTermin : texte.fehler;
          await send("text", { text });
          if (terminWunsch && !uiGesendet.has("anfrage_formular")) await send("ui", { typ: "anfrage_formular", felder: { wunschtermin: nachricht.slice(0, 120) } });
          if (!terminWunsch && !uiGesendet.has("uebergabe")) await send("ui", { typ: "uebergabe", grund: "leer" });
        }
        verlauf.push({ role: "assistant", content: text || "…" });
        break;
      } catch (err: any) {
        console.error(`[llm] Versuch ${versuch}:`, err?.status || "", err?.message || err);
        if (versuch === 1 && !schonGesendet) { await new Promise((r) => setTimeout(r, 700)); continue; }
        // Auch im Fehlerfall weiterhelfen: bei Terminwunsch direkt das Formular zeigen
        const terminWunsch = /termin|anfrag|buch|reserv|vorbei|wann|zeit/i.test(nachricht);
        await send("text", { text: terminWunsch ? texte.fehlerTermin : texte.fehler });
        if (terminWunsch) await send("ui", { typ: "anfrage_formular", felder: { wunschtermin: nachricht.slice(0, 120) } });
        else await send("ui", { typ: "uebergabe", grund: "fehler" });
        verlauf.pop();
      }
    }
    return fertig();
  });
});

// Bestätigte Anfrage: kommt direkt vom Formular, nicht vom Modell.
app.post("/api/anfrage", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const f = (k: string, max = 300) => String(b[k] || "").trim().slice(0, max);
  const name = f("name", 100), kontakt = f("kontakt", 120);
  if (!name || !kontakt) return c.json({ ok: false, fehler: "Name und Kontakt fehlen." }, 400);
  if (!b.einwilligung) return c.json({ ok: false, fehler: "Bitte der Datenschutzerklärung zustimmen." }, 400);
  if (await pruefeLimit(c, "anfrage")) return c.json({ ok: false, fehler: "Zu viele Anfragen. Bitte per WhatsApp oder Telefon melden." }, 429);
  const verlauf = (await pruefeToken(b.verlauf)).map((m) => `${m.role === "user" ? "Kunde" : "Bot"}: ${m.content}`).join("\n");
  try {
    const anfrage = { name, kontakt, fahrzeug: f("fahrzeug"), paket: f("paket"), wunschtermin: f("wunschtermin"), notiz: f("notiz", 1000), verlauf };
    const r = await sendeAnfrage(anfrage);
    // FormSubmit schickt der Browser selbst ab (von Servern aus blockiert FormSubmit)
    return c.json({ ok: r.ok, formsubmit: formsubmitDaten(anfrage) });
  } catch (e: any) {
    console.error("[anfrage]", e.message);
    return c.json({ ok: false, fehler: "Senden fehlgeschlagen. Bitte per WhatsApp melden." }, 500);
  }
});

app.get("/api/config", (c) => c.json({
  betrieb: { name: config.betrieb.name, botName: config.betrieb.botName, telefon: config.betrieb.telefon, whatsapp: config.betrieb.whatsapp, email: config.betrieb.email, datenschutzUrl: config.betrieb.datenschutzUrl, buchungsUrl: config.betrieb.buchungsUrl || "" },
  ton: config.ton, design: config.design, start: config.start, rueckfragen: config.rueckfragen, formular: config.formular || {},
  foto: fotoAktiv() ? { button: config.foto.button || "📷 Foto-Check", hinweis: config.foto.hinweis || "", max: maxFotos() } : null,
  maxZeichen: config.limits.maxZeichenProNachricht,
  demo: env.provider === "demo" || (env.provider === "anthropic" && !env.anthropicKey),
}));

app.get("/widget.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(WIDGET_JS);
});
app.get("/", (c) => c.html(DEMO_HTML.replaceAll("{{NAME}}", config.betrieb.name).replaceAll("{{BRANCHE}}", config.betrieb.branche)));
app.get("/health", (c) => c.json({ ok: true, provider: env.provider, killSwitch: env.killSwitch || (c.env as any)?.KILL_SWITCH === "1" }));
