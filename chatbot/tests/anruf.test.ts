// Anruf-Retter: Nummern, SMS-Text, Signatur von sipgate, Tageslimit, Ablauf, Webhook.
// Läuft ohne Fremdpakete (die Route wird mit einer Mini-App statt Hono geprüft).
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "test-geheimnis";
const A = await import("../src/anruf.ts");

const ctx = (env: Record<string, string> = {}) => ({ env });

test("Nummern: sipgate-Format, Inland, unterdrückt", () => {
  assert.equal(A.normNummer("4915791234567"), "+4915791234567");
  assert.equal(A.normNummer("+49 157 9123 4567"), "+4915791234567");
  assert.equal(A.normNummer("015791234567"), "+4915791234567");
  assert.equal(A.normNummer("0049771234567"), "+49771234567");
  assert.equal(A.normNummer("anonymous"), null);
  assert.equal(A.normNummer(""), null);
  assert.equal(A.normNummer("123"), null);
});

test("Nur deutsche Handynummern bekommen eine SMS", () => {
  assert.ok(A.istHandy("+4915791234567"));
  assert.ok(A.istHandy("+491711234567"));
  assert.ok(A.istHandy("+4916012345678"));
  assert.ok(!A.istHandy("+49772012345"), "Festnetz");
  assert.ok(!A.istHandy("+4318001234"), "Ausland");
  assert.ok(!A.istHandy(null));
});

test("Betrieb je Nummer, Standard Fahrzeugpflege", () => {
  assert.equal(A.betriebFuer(ctx(), "4977201234567", undefined).id, "fahrzeug");
  assert.equal(A.betriebFuer(ctx({ ANRUF_BETRIEB: "elektro" }), "4977201234567", undefined).id, "elektro");
  const c = ctx({ ANRUF_BETRIEB: "elektro", ANRUF_BETRIEB_4977201234567: "maler" });
  assert.equal(A.betriebFuer(c, "4930999", "4977201234567").id, "maler", "ursprünglich gewählte Nummer zählt");
  assert.equal(A.betriebFuer(ctx({ ANRUF_BETRIEB: "gibtsnicht" }), "1", undefined).id, "fahrzeug");
});

test("SMS-Text: eine Nachricht, ohne Umlaute, mit Name und Link", () => {
  const b = A.betriebFuer(ctx(), "", "");
  const t = A.smsText(ctx(), b);
  assert.ok(t.startsWith("Muster Fahrzeugpflege:"));
  assert.ok(t.includes("https://primedetailing.eu/demo/anfrage/?betrieb=fahrzeug"));
  assert.ok(t.length <= 160, `zu lang: ${t.length}`);
  assert.ok(!/[äöüÄÖÜß]/.test(t), "Umlaute machen die SMS teurer");
  const eigen = A.smsText(ctx({ ANRUF_SMS_TEXT: "{name} ruft zurueck. {link}", ANRUF_LINK: "https://x.de/a" }), b);
  assert.equal(eigen, "Muster Fahrzeugpflege ruft zurueck. https://x.de/a");
});

test("Antwort an sipgate: leer oder mit Ansage", () => {
  assert.equal(A.antwortXml(), '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  assert.ok(A.antwortXml("https://a.de/ansage.wav?x=1&y=2").includes("<Play><Url>https://a.de/ansage.wav?x=1&amp;y=2</Url></Play>"));
  assert.ok(!A.antwortXml("http://unsicher.de/a.wav").includes("<Play>"), "nur https");
});

test("Signatur: echte Meldung ja, verändert oder ohne Signatur nein", async () => {
  const paar = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const spki = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("spki", paar.publicKey))));
  const body = "event=newCall&direction=in&from=4915791234567&to=4977201234567&callId=abc";
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", paar.privateKey, new TextEncoder().encode(body)))));
  assert.equal(await A.echteSignatur(body, sig, spki), true);
  assert.equal(await A.echteSignatur(body.replace("4915791234567", "4915700000000"), sig, spki), false);
  assert.equal(await A.echteSignatur(body, undefined, spki), false);
  assert.equal(await A.echteSignatur(body, "kaputt!!", spki), false);
  // mit dem echten sipgate-Schlüssel: fremde Signatur wird abgelehnt, ohne Absturz
  assert.equal(await A.echteSignatur(body, sig), false);
});

test("Höchstens eine SMS pro Nummer und Tag", async () => {
  A._resetAnruf();
  const t0 = Date.parse("2026-11-02T10:00:00Z");
  assert.equal(await A.smsErlaubt(ctx(), "+4915791234567", t0), true);
  assert.equal(await A.smsErlaubt(ctx(), "+4915791234567", t0 + 3_600_000), false);
  assert.equal(await A.smsErlaubt(ctx(), "+4916012345678", t0 + 3_600_000), true, "andere Nummer");
  assert.equal(await A.smsErlaubt(ctx(), "+4915791234567", t0 + 25 * 3_600_000), true, "nach 24 Stunden wieder");
});

test("SMS über sipgate: richtige Adresse, Anmeldung und Inhalt", async () => {
  const echt = globalThis.fetch;
  let anfrage: any = null;
  globalThis.fetch = (async (url: string, o: any) => { anfrage = { url, ...o }; return new Response(null, { status: 204 }); }) as any;
  try {
    const c = ctx({ SIPGATE_TOKEN_ID: "token-ABC", SIPGATE_TOKEN: "geheim", SIPGATE_SMS_ID: "s1" });
    assert.equal(await A.sendeSms(c, "+4915791234567", "Hallo"), "gesendet");
    assert.equal(anfrage.url, "https://api.sipgate.com/v2/sessions/sms");
    assert.equal(anfrage.headers.Authorization, "Basic " + btoa("token-ABC:geheim"));
    assert.deepEqual(JSON.parse(anfrage.body), { smsId: "s1", recipient: "+4915791234567", message: "Hallo" });
    globalThis.fetch = (async () => new Response("nope", { status: 403 })) as any;
    assert.equal(await A.sendeSms(c, "+4915791234567", "Hallo"), "fehler");
    assert.equal(await A.sendeSms(ctx(), "+4915791234567", "Hallo"), "probelauf", "ohne Token keine SMS");
  } finally { globalThis.fetch = echt; }
});

test("Mail an den Betrieb: Nummer, Rückruf-Knopf, Status", () => {
  const b = A.betriebFuer(ctx(), "", "");
  assert.equal(A.anrufMail(ctx(), b, "+4915791234567", "gesendet"), null, "ohne Empfänger keine Mail");
  const m = A.anrufMail(ctx({ TERMIN_MAIL_BETRIEB: "support@primedetailing.eu" }), b, "+4915791234567", "gesendet", Date.parse("2026-11-02T17:30:00Z"))!;
  assert.equal(m.an, "support@primedetailing.eu");
  assert.ok(m.betreff.includes("Verpasster Anruf: +49 157 91234567"));
  assert.ok(m.html.includes('href="tel:+4915791234567"'));
  assert.ok(m.text.includes("18:30"), "Uhrzeit in deutscher Zeit");
  assert.ok(m.text.includes("SMS mit dem Link"));
  const anonym = A.anrufMail(ctx({ ANRUF_MAIL_BETRIEB: "chef@example.org" }), b, null, "unterdrueckt")!;
  assert.equal(anonym.an, "chef@example.org");
  assert.ok(!anonym.html.includes("tel:"));
});

test("Ablauf: Festnetz, unterdrückt, Handy im Probelauf, zweiter Anruf", async () => {
  A._resetAnruf();
  const c = ctx();
  assert.equal((await A.verarbeiteAnruf(c, { von: "anonymous", an: "1" })).sms, "unterdrueckt");
  assert.equal((await A.verarbeiteAnruf(c, { von: "49772012345", an: "1" })).sms, "festnetz");
  assert.equal((await A.verarbeiteAnruf(c, { von: "4915791234567", an: "1" })).sms, "probelauf");
  assert.equal((await A.verarbeiteAnruf(c, { von: "4915791234567", an: "1" })).sms, "schon_heute");
  A._resetAnruf();
  assert.equal((await A.verarbeiteAnruf(c, { von: "4915791234567", an: "1" }, true)).sms, "probelauf");
  assert.equal((await A.verarbeiteAnruf(c, { von: "4915791234567", an: "1" }, true)).sms, "probelauf", "Probe verbraucht keinen Tageszähler");
});

// --- Webhook mit einer Mini-App statt Hono --------------------------------------
function miniApp() {
  const routen: Record<string, Function> = {};
  return { routen, post: (p: string, h: Function) => { routen[p] = h; }, get: () => {} };
}
function anfrage(body: string, env: Record<string, string>, header: Record<string, string> = {}) {
  const antwort: any = {};
  const c = {
    env, req: { text: async () => body, header: (k: string) => header[k.toLowerCase()] ?? (k === "content-length" ? String(body.length) : undefined), json: async () => JSON.parse(body) },
    body: (s: string, status: number, h: any) => Object.assign(antwort, { s, status, h }),
    json: (o: any, status = 200) => Object.assign(antwort, { o, status }),
    get executionCtx(): any { throw new Error("kein Worker"); },
  };
  return { c, antwort };
}

test("Webhook: ohne gültige Signatur abgelehnt", async () => {
  const app = miniApp(); A.anrufRouten(app as any);
  const { c, antwort } = anfrage("event=newCall&direction=in&from=4915791234567&to=1", {});
  await app.routen["/api/anruf/sipgate"](c);
  assert.equal(antwort.status, 403);
});

test("Webhook: eingehender Anruf → Antwort-XML, ausgehende Anrufe ignoriert", async () => {
  A._resetAnruf();
  const app = miniApp(); A.anrufRouten(app as any);
  const env = { ANRUF_SIGNATUR: "aus", ANRUF_ANSAGE: "https://primedetailing.eu/ansage.wav" };
  let r = anfrage("event=newCall&direction=in&from=4915791234567&to=4977201234567", env);
  await app.routen["/api/anruf/sipgate"](r.c);
  assert.equal(r.antwort.status, 200);
  assert.equal(r.antwort.h["Content-Type"], "application/xml; charset=utf-8");
  assert.ok(r.antwort.s.includes("<Play><Url>https://primedetailing.eu/ansage.wav</Url></Play>"));
  r = anfrage("event=newCall&direction=out&from=4977201234567&to=4915791234567", env);
  await app.routen["/api/anruf/sipgate"](r.c);
  assert.ok(!r.antwort.s.includes("<Play>"), "ausgehend: nichts tun");
  r = anfrage("event=newCall&direction=in&from=4915791234567&to=1", { ...env, KILL_SWITCH: "1" });
  await app.routen["/api/anruf/sipgate"](r.c);
  assert.ok(!r.antwort.s.includes("<Play>"), "Notbremse");
});

test("Probeanruf nur wenn eingeschaltet", async () => {
  const app = miniApp(); A.anrufRouten(app as any);
  let r = anfrage(JSON.stringify({ von: "4915791234567" }), {});
  await app.routen["/api/anruf/probe"](r.c);
  assert.equal(r.antwort.status, 404);
  r = anfrage(JSON.stringify({ von: "4915791234567" }), { ANRUF_PROBE: "1" });
  await app.routen["/api/anruf/probe"](r.c);
  assert.equal(r.antwort.o.ok, true);
  assert.equal(r.antwort.o.sms, "probelauf");
});
