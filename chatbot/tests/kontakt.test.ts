// Kontaktformular der Firmen-Website: Prüfung, Spam-Falle, Mail über Brevo.
import { test } from "node:test";
import assert from "node:assert/strict";
const K = await import("../src/kontakt.ts");

function miniApp() {
  const routen: Record<string, Function> = {};
  const app: any = { post: (pfad: string, h: Function) => (routen[pfad] = h), get: () => {} };
  K.kontaktRouten(app);
  return async (body: any, env: any) => {
    const c = { env, req: { header: () => "1.2.3.4", json: async () => body },
      json: (d: any, status = 200) => new Response(JSON.stringify(d), { status }) };
    const r: Response = await routen["/api/kontakt"](c);
    return { status: r.status, j: (await r.json()) as any };
  };
}
const gut = { name: "Max Muster", betrieb: "Muster GmbH", email: "max@example.de", nachricht: "Hallo <b>", einwilligung: true };

test("Pflichtfelder und Einwilligung werden geprüft", () => {
  assert.equal(K.pruefeKontakt(gut).ok, true);
  assert.equal(K.pruefeKontakt({ ...gut, name: "" }).ok, false);
  assert.equal(K.pruefeKontakt({ ...gut, email: "kaputt" }).ok, false);
  assert.equal(K.pruefeKontakt({ ...gut, einwilligung: "true" }).ok, false);
});

test("Anfrage geht als Mail an KONTAKT_MAIL, Antwort-an ist der Interessent", async () => {
  const gesendet: any[] = [];
  const alt = globalThis.fetch;
  globalThis.fetch = (async (_u: string, o: any) => { gesendet.push(JSON.parse(o.body)); return new Response("{}", { status: 201 }); }) as any;
  try {
    const rufe = miniApp();
    const r = await rufe(gut, { BREVO_API_KEY: "k", MAIL_ABSENDER: "termine@primedetailing.eu", KONTAKT_MAIL: "info@example.de" });
    assert.equal(r.status, 200);
    assert.equal(r.j.ok, true);
    assert.equal(gesendet[0].to[0].email, "info@example.de");
    assert.equal(gesendet[0].replyTo.email, "max@example.de");
    assert.match(gesendet[0].htmlContent, /Hallo &lt;b&gt;/);
  } finally { globalThis.fetch = alt; }
});

test("Spam-Falle: ausgefülltes Feld wird still verworfen", async () => {
  let aufgerufen = false;
  const alt = globalThis.fetch;
  globalThis.fetch = (async () => { aufgerufen = true; return new Response("{}"); }) as any;
  try {
    const r = await miniApp()({ ...gut, _honey: "bot" }, { BREVO_API_KEY: "k", MAIL_ABSENDER: "a@b.de" });
    assert.equal(r.j.ok, true);
    assert.equal(aufgerufen, false);
  } finally { globalThis.fetch = alt; }
});

test("ohne Mail-Einrichtung kommt ein Fehler statt falscher Erfolgsmeldung", async () => {
  const r = await miniApp()(gut, {});
  assert.equal(r.status, 502);
  assert.equal(r.j.ok, false);
});
