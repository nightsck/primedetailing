// Ende-zu-Ende über die HTTP-Schnittstelle (Demo-Modus, ohne KI):
// Spam-Limits, Notbremse, Zeichenlimits und Foto-Check.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.LLM_PROVIDER = "demo";
process.env.SESSION_SECRET = "test-geheimnis";
const { app } = await import("../src/app.ts");
const { texte, config } = await import("../src/config.ts");
const { grenzen, zaehle, zaehleBudget } = await import("../src/limits.ts");
const fotoAn = !!config.foto?.aktiv;

const JPEG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]).toString("base64");

async function chat(body: any, ip = "1.2.3.4", env?: any) {
  const res = await app.request("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }, env);
  const roh = await res.text();
  let text = "", token = "", ui: any[] = [];
  for (const block of roh.split("\n\n")) {
    const ev = (block.match(/^event: (.*)$/m) || [])[1];
    const data = JSON.parse((block.match(/^data: (.*)$/m) || [, "{}"])[1]);
    if (ev === "text") text += data.text;
    if (ev === "verlauf") token = data.token;
    if (ev === "ui") ui.push(data);
  }
  return { text, token, ui };
}

test("9. Nachricht in einer Minute wird gebremst, andere Besucher nicht", async () => {
  for (let i = 0; i < grenzen.chat.minute!; i++) assert.notEqual((await chat({ nachricht: "Innenreinigung" }, "10.0.0.1")).text, texte.zuViele, `Nachricht ${i + 1}`);
  const r = await chat({ nachricht: "Innenreinigung" }, "10.0.0.1");
  assert.equal(r.text, texte.zuViele);
  assert.ok(r.ui.some((u) => u.typ === "uebergabe"), "WhatsApp/Telefon wird angeboten");
  assert.notEqual((await chat({ nachricht: "Innenreinigung" }, "10.0.0.2")).text, texte.zuViele);
});

test("Notbremse pausiert den Chat", async () => {
  const r = await chat({ nachricht: "Hallo" }, "10.0.0.3", { KILL_SWITCH: "1" });
  assert.equal(r.text, texte.pausiert);
});

test("Zu lange Nachricht wird gekürzt, zu langes Gespräch beendet", async () => {
  let token = "", ende = false;
  for (let i = 0; i < 40 && !ende; i++) {
    const r = await chat({ nachricht: "x".repeat(5000), verlauf: token }, "10.1.0." + i);
    if (r.text === texte.zuLang) ende = true;
    token = r.token;
    const verlauf = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    assert.ok(verlauf.filter((m: any) => m.role === "user").every((m: any) => m.content.length <= config.limits.maxZeichenProNachricht));
  }
  assert.ok(ende, "Gespräch wird bei maxZeichenProGespraech beendet");
});

test("Foto-Check: Foto wird angenommen, nach 3 Fotos ist Schluss", { skip: !fotoAn && "Foto-Check aus" }, async () => {
  let token = "";
  for (let i = 0; i < config.limits.maxFotosProGespraech; i++) {
    const r = await chat({ nachricht: "", bild: JPEG, verlauf: token }, "10.2.0." + i);
    assert.ok(r.text.includes("Foto"), r.text);
    token = r.token;
  }
  const verlauf = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
  assert.ok(verlauf[0].content.startsWith("[Foto]"));
  assert.ok(!JSON.stringify(verlauf).includes("base64"), "Foto wird nicht im Verlauf gespeichert");
  const r = await chat({ bild: JPEG, verlauf: token }, "10.2.9.9");
  assert.equal(r.text, texte.zuVieleFotos);
});

test("Gefälschtes Foto wird abgelehnt", { skip: !fotoAn && "Foto-Check aus" }, async () => {
  const r = await chat({ bild: "data:image/jpeg;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" }, "10.3.0.1");
  assert.ok(r.text.includes("nicht öffnen"));
});

test("Fotos haben ein eigenes, strengeres Limit pro Besucher", { skip: !fotoAn && "Foto-Check aus" }, async () => {
  let gebremst = false;
  for (let i = 0; i < grenzen.foto.minute! + 1; i++) {
    const r = await chat({ bild: JPEG }, "10.4.0.1");
    if (r.text === texte.zuVieleFotos) gebremst = true;
  }
  assert.ok(gebremst);
});

test("Formular-Anfragen: max. 2 pro Minute pro Besucher", async () => {
  const senden = () => app.request("/api/anfrage", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "10.5.0.1" }, body: JSON.stringify({ name: "Test", kontakt: "t@example.com", einwilligung: true }) });
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await senden()).status);
  assert.equal(codes[2], 429);
});

test("Mit Cloudflare-Zähler (Durable Object) zählt der gemeinsame Zähler", async () => {
  const objekte = new Map<string, any>();
  const ns = {
    idFromName: (n: string) => n,
    get: (id: string) => {
      if (!objekte.has(id)) {
        const s: any = { zeiten: {} };
        objekte.set(id, { zaehle: async (art: any, g: any) => zaehle(s, art, Date.now(), g), budget: async (max: number) => zaehleBudget(s, Date.now(), max) });
      }
      return objekte.get(id);
    },
  };
  for (let i = 0; i < grenzen.chat.minute!; i++) await chat({ nachricht: "Hallo" }, "10.6.0.1", { LIMITS: ns });
  assert.equal((await chat({ nachricht: "Hallo" }, "10.6.0.1", { LIMITS: ns })).text, texte.zuViele);
  assert.ok(objekte.has("global"), "Tagesbudget wird mitgezählt");
  assert.ok([...objekte.keys()].every((k) => !k.includes("10.6.0.1")), "IP nur als Hash");
});

test("KI kurz weg: ein automatischer zweiter Versuch, Kunde merkt nichts", async () => {
  const { _setClient } = await import("../src/llm.ts");
  let aufrufe = 0;
  _setClient({ messages: { stream() {
    aufrufe++;
    if (aufrufe === 1) return { abort() {}, async *[Symbol.asyncIterator]() { throw Object.assign(new Error("Request not allowed"), { status: 403 }); }, async finalMessage() { return {}; } };
    return { abort() {}, async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text: "Klar, gern. " } }; }, async finalMessage() { return { content: [{ type: "text", text: "Klar, gern. " }], stop_reason: "end_turn" }; } };
  } } });
  const r = await chat({ nachricht: "Hallo" }, "10.7.0.1");
  assert.equal(aufrufe, 2);
  assert.ok(r.text.includes("Klar, gern"));
  _setClient(null);
});

test("KI dauerhaft weg + Terminwunsch: Formular statt Abbruch", async () => {
  const { _setClient } = await import("../src/llm.ts");
  _setClient({ messages: { stream() { return { abort() {}, async *[Symbol.asyncIterator]() { throw Object.assign(new Error("down"), { status: 500 }); }, async finalMessage() { return {}; } }; } } });
  const r = await chat({ nachricht: "Gerne den nächstbesten Termin" }, "10.7.0.2");
  assert.equal(r.text, texte.fehlerTermin);
  assert.ok(r.ui.some((u) => u.typ === "anfrage_formular"));
  _setClient(null);
});

test("Modell liefert leere Antwort auf Terminwunsch: trotzdem Formular + Text", async () => {
  const { _setClient } = await import("../src/llm.ts");
  _setClient({ messages: { stream() { return { abort() {}, async *[Symbol.asyncIterator]() {}, async finalMessage() { return { content: [], stop_reason: "end_turn" }; } }; } } });
  const r = await chat({ nachricht: "gerne den nächst besten termin" }, "10.7.0.3");
  assert.equal(r.text, texte.fehlerTermin);
  assert.ok(r.ui.some((u) => u.typ === "anfrage_formular"));
  _setClient(null);
});

test("Anfrage: FormSubmit-Daten gehen an den Browser zurück (Server sendet nicht selbst)", async () => {
  process.env.FORMSUBMIT_ZIEL = "info@example.com";
  const res = await app.request("/api/anfrage", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "10.8.0.1" }, body: JSON.stringify({ name: "Max Test", kontakt: "max@example.com", paket: "Innen Comfort", einwilligung: true }) });
  const j: any = await res.json();
  delete process.env.FORMSUBMIT_ZIEL;
  assert.equal(j.ok, true);
  assert.equal(j.formsubmit.url, "https://formsubmit.co/ajax/info%40example.com");
  assert.equal(j.formsubmit.daten.Name, "Max Test");
  assert.equal(j.formsubmit.daten._replyto, "max@example.com");
});
