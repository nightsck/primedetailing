// Admin-Panel über die HTTP-Schnittstelle: Anmeldung, Kunden anlegen, Entwurf
// und Veröffentlichen, Einrichtungs-Check, Test-Vorschau, Einbau-Code, Verlauf.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.LLM_PROVIDER = "demo";
process.env.SESSION_SECRET = "test-geheimnis";
process.env.ADMIN_LOGIN = "tom@test.de, giosue@test.de";
const { app } = await import("../src/app.ts");
const { neuerSpeicher, leseStream } = await import("./kunden-hilfe.ts");
const { _reset } = await import("../src/limits.ts");
const { _letzterCode } = await import("../src/admin/anmeldung.ts");

const B = "http://chat.test";
const ruf = (pfad: string, o: { m?: string; body?: any; cookie?: string; kopf?: Record<string, string> } = {}) =>
  app.request(B + pfad, { method: o.m || (o.body ? "POST" : "GET"), headers: { "Content-Type": "application/json", "X-Admin": "1", ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.kopf || {}) }, body: o.body ? JSON.stringify(o.body) : undefined });

async function anmelden(email = "tom@test.de") {
  await ruf("/admin/api/anmelden", { body: { email } });
  const r = await ruf("/admin/api/einloesen", { body: { email, code: _letzterCode()!.code } });
  return (r.headers.get("set-cookie") || "").split(";")[0];
}
const NEU = { id: "maler-mueller", paket: "chat", stammdaten: { firmenname: "Malerbetrieb Müller", branche: "maler", email: "info@maler-mueller.de", website: "https://www.maler-mueller.de" }, module: { kundenChat: { aktiv: true }, bewerberChat: { aktiv: true } } };

test("Anmeldung: nur freigeschaltete Adressen, Code einmal gültig, Link wird erst beim Klick verbraucht", async () => {
  await neuerSpeicher(); _reset();
  assert.equal((await ruf("/admin/api/start")).status, 401, "ohne Anmeldung kein Zugriff");
  await ruf("/admin/api/anmelden", { body: { email: "fremd@example.org" } });
  assert.equal(_letzterCode(), null, "fremde Adresse bekommt keinen Code");
  const a = await ruf("/admin/api/anmelden", { body: { email: "Tom@Test.de" } });
  assert.equal(a.status, 200);
  const { code, token } = _letzterCode()!;
  assert.match(code, /^\d{6}$/);
  assert.equal((await ruf("/admin/api/einloesen", { body: { email: "tom@test.de", code: code === "000000" ? "111111" : "000000" } })).status, 401, "falscher Code");
  // Der Link aus der Mail: Öffnen der Seite (auch mehrfach, z. B. durch die Mail-Vorschau) verbraucht ihn nicht
  for (let i = 0; i < 3; i++) assert.equal((await app.request(`${B}/admin?t=${token}`)).status, 200);
  const ok = await ruf("/admin/api/einloesen", { body: { token } });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\/admin/);
  assert.equal((await ruf("/admin/api/einloesen", { body: { token } })).status, 401, "Link nur einmal");
  // Der Code aus derselben Mail geht daneben noch (z. B. am zweiten Gerät), aber auch nur einmal
  assert.equal((await ruf("/admin/api/einloesen", { body: { email: "tom@test.de", code } })).status, 200);
  assert.equal((await ruf("/admin/api/einloesen", { body: { email: "tom@test.de", code } })).status, 401);
  const c = cookie.split(";")[0];
  assert.equal(((await (await ruf("/admin/api/start", { cookie: c })).json()) as any).ich, "tom@test.de");
  assert.equal((await ruf("/admin/api/start", { cookie: c.slice(0, -3) + "abc" })).status, 401, "verändertes Cookie gilt nicht");
  assert.equal((await ruf("/admin/api/kunden", { cookie: c, body: { kunde: NEU }, kopf: { "X-Admin": "" } })).status, 403, "Schreiben ohne X-Admin-Kopf abgelehnt");
});

test("Anmeldung: nach 10 falschen Codes hilft auch der richtige nicht mehr, der Link schon", async () => {
  await neuerSpeicher(); _reset();
  await ruf("/admin/api/anmelden", { body: { email: "tom@test.de" } });
  const { code, token } = _letzterCode()!;
  const falsch = code === "123456" ? "654321" : "123456";
  for (let i = 0; i < 10; i++) assert.equal((await ruf("/admin/api/einloesen", { body: { email: "tom@test.de", code: falsch }, kopf: { "x-forwarded-for": "3.3.3." + i } })).status, 401);
  assert.equal((await ruf("/admin/api/einloesen", { body: { email: "tom@test.de", code }, kopf: { "x-forwarded-for": "3.3.4.1" } })).status, 401, "Code gesperrt");
  assert.equal((await ruf("/admin/api/einloesen", { body: { token }, kopf: { "x-forwarded-for": "3.3.4.2" } })).status, 200, "Link geht weiter");
});

test("Neuer Kunde aus Branchen-Vorlage: Entwurf ist nicht live, Check zeigt, was fehlt, Veröffentlichen erst danach", async () => {
  await neuerSpeicher(); _reset();
  const cookie = await anmelden();
  assert.equal((await ruf("/admin/api/kunden", { cookie, body: { kunde: { ...NEU, id: "prime-detailing" } } })).status, 400, "reservierte ID");
  const schlecht: any = await (await ruf("/admin/api/kunden", { cookie, body: { kunde: { ...NEU, stammdaten: { ...NEU.stammdaten, email: "falsch" } } } })).json();
  assert.equal(schlecht.fehler[0].feld, "stammdaten.email");
  assert.equal((await ruf("/admin/api/kunden", { cookie, body: { kunde: NEU } })).status, 200);
  assert.equal((await ruf("/admin/api/kunden", { cookie, body: { kunde: NEU } })).status, 409, "ID gibt es schon");

  let d: any = await (await ruf("/admin/api/kunden/maler-mueller", { cookie })).json();
  assert.equal(d.live, false);
  assert.equal(d.kunde.stammdaten.brancheText, "Malerbetrieb", "aus der Vorlage");
  assert.ok(d.kunde.wissen.leistungen.length >= 4 && d.kunde.module.bewerberChat.stellen.length === 3, "Leistungen und Stellen aus der Vorlage");
  assert.equal(d.ampel, "rot");
  assert.ok(d.check.some((p: any) => p.farbe === "rot" && /Datenschutz/.test(p.titel) && p.reiter === "recht"));
  assert.equal((await app.request(B + "/k/maler-mueller/api/config")).status, 404, "Entwurf ist nicht erreichbar");

  const zuFrueh: any = await (await ruf("/admin/api/kunden/maler-mueller/veroeffentlichen", { cookie, body: {} })).json();
  assert.equal(zuFrueh.ok, false);
  assert.match(zuFrueh.fehler, /Datenschutz/);

  d.kunde.rechtliches.datenschutzUrl = "https://www.maler-mueller.de/datenschutz";
  d.kunde.wissen.leistungen[0].preis = 290; d.kunde.wissen.leistungen[0].ab = true;
  assert.equal((await ruf("/admin/api/kunden/maler-mueller", { m: "PUT", cookie, body: { kunde: d.kunde } })).status, 200);
  assert.equal((await ruf("/admin/api/kunden/maler-mueller/veroeffentlichen", { cookie, body: {} })).status, 200);
  const cfg: any = await (await app.request(B + "/k/maler-mueller/api/config")).json();
  assert.equal(cfg.betrieb.name, "Malerbetrieb Müller");
  d = await (await ruf("/admin/api/kunden/maler-mueller", { cookie })).json();
  assert.equal(d.live, true); assert.equal(d.offen, false);
  assert.ok(d.check.filter((p: any) => p.reiter).every((p: any) => p.farbe !== "rot"));
  assert.equal(d.einbau.kundenChat.code, `<script src="${B}/k/maler-mueller/widget.js" defer></script>`);
  assert.equal(d.einbau.bewerberChat.link, `${B}/k/maler-mueller/bewerben`);
  const liste: any = await (await ruf("/admin/api/start", { cookie })).json();
  assert.equal(liste.kunden.length, 1);
  assert.deepEqual(liste.kunden[0].module, ["kundenChat", "bewerberChat"]);
  assert.equal(liste.vorlagen.length, 9);
});

test("Entwurf ändern lässt den Live-Stand in Ruhe; Test-Vorschau zeigt den Entwurf; Verlauf holt alte Fassung zurück", async () => {
  await neuerSpeicher(); _reset();
  const cookie = await anmelden();
  await ruf("/admin/api/kunden", { cookie, body: { kunde: { ...NEU, rechtliches: { datenschutzUrl: "https://x.de/d" } } } });
  await ruf("/admin/api/kunden/maler-mueller/veroeffentlichen", { cookie, body: {} });
  const d: any = await (await ruf("/admin/api/kunden/maler-mueller", { cookie })).json();
  d.kunde.aussehen.botName = "Pinsel"; d.kunde.aussehen.primaerfarbe = "#7a3b1d";
  await ruf("/admin/api/kunden/maler-mueller", { m: "PUT", cookie, body: { kunde: d.kunde } });

  const live: any = await (await app.request(B + "/k/maler-mueller/api/config")).json();
  assert.equal(live.betrieb.botName, "Assistent", "live noch der alte Name");
  const test_: any = await (await ruf("/admin/api/kunden/maler-mueller/test/api/config", { cookie })).json();
  assert.equal(test_.betrieb.botName, "Pinsel", "Vorschau zeigt den Entwurf");
  assert.equal((await app.request(B + "/admin/api/kunden/maler-mueller/test/api/config")).status, 401, "Vorschau nur angemeldet");
  const js = await (await ruf("/admin/api/kunden/maler-mueller/test/widget.js", { cookie })).text();
  assert.match(js, /"primaer":"#7a3b1d"/);
  assert.match(js, /\/admin\/api\/kunden\/maler-mueller\/test"/);

  // Test-Chat: läuft ohne X-Admin-Kopf (so ruft ihn das Chat-Fenster auf), zählt und speichert nichts
  const s = (await import("../src/speicher/schnittstelle.ts")).speicherVon({});
  for (let i = 0; i < 12; i++) {
    const r = await app.request(B + "/admin/api/kunden/maler-mueller/test/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ nachricht: "Hallo" }) });
    assert.doesNotMatch(leseStream(await r.text()).text, /Zu viele Nachrichten/, "im Test keine Besucher-Limits");
  }
  assert.equal(await s.summeMonat("maler-mueller", "chat"), 0, "Test zählt nicht");
  const anfrage: any = await (await app.request(B + "/admin/api/kunden/maler-mueller/test/api/anfrage", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ name: "x", kontakt: "y", einwilligung: true }) })).json();
  assert.equal(anfrage.test, true);
  assert.equal((await s.vorgaenge("maler-mueller")).length, 0, "Test speichert nichts");
  const seite = await (await ruf("/admin/api/kunden/maler-mueller/test/bewerben", { cookie })).text();
  assert.match(seite, /admin\/api\/kunden\/maler-mueller\/test"/);

  await ruf("/admin/api/kunden/maler-mueller/veroeffentlichen", { cookie, body: {} });
  let stand: any = await (await ruf("/admin/api/kunden/maler-mueller", { cookie })).json();
  assert.deepEqual(stand.versionen.map((v: any) => v.nr), [2, 1]);
  assert.equal(stand.versionen[0].wer, "tom@test.de");
  assert.equal((await ruf("/admin/api/kunden/maler-mueller/wiederherstellen", { cookie, body: { nr: 1 } })).status, 200);
  stand = await (await ruf("/admin/api/kunden/maler-mueller", { cookie })).json();
  assert.equal(stand.kunde.aussehen.botName, "Assistent");
  assert.equal(stand.offen, true, "zurückgeholte Fassung ist erst Entwurf");
  assert.equal(((await (await app.request(B + "/k/maler-mueller/api/config")).json()) as any).betrieb.botName, "Pinsel");
});

test("Pausieren wirkt sofort nach dem Veröffentlichen; QR-Code, Export, Import, Löschen", async () => {
  await neuerSpeicher(); _reset();
  const cookie = await anmelden("giosue@test.de");
  await ruf("/admin/api/kunden", { cookie, body: { kunde: { ...NEU, rechtliches: { datenschutzUrl: "https://x.de/d" } } } });
  await ruf("/admin/api/kunden/maler-mueller/veroeffentlichen", { cookie, body: {} });
  assert.equal((await app.request(B + "/k/maler-mueller/api/config")).status, 200);
  const d: any = await (await ruf("/admin/api/kunden/maler-mueller", { cookie })).json();
  await ruf("/admin/api/kunden/maler-mueller", { m: "PUT", cookie, body: { kunde: { ...d.kunde, status: "pausiert" } } });
  assert.equal((await ruf("/admin/api/kunden/maler-mueller/veroeffentlichen", { cookie, body: {} })).status, 200, "Abschalten geht immer");
  assert.equal((await app.request(B + "/k/maler-mueller/api/config")).status, 403);

  const qr = await ruf("/admin/api/kunden/maler-mueller/qr?stelle=geselle", { cookie });
  assert.match(qr.headers.get("content-type")!, /svg/);
  assert.match(await qr.text(), /^<svg/);
  const datei = await (await ruf("/admin/api/kunden/maler-mueller/export", { cookie })).json() as any;
  assert.equal(datei.id, "maler-mueller");
  const kopie = await ruf("/admin/api/kunden", { cookie, body: { import: true, kunde: { ...datei, id: "maler-zwei", status: "test" } } });
  assert.equal(kopie.status, 200);
  const k2: any = await (await ruf("/admin/api/kunden/maler-zwei", { cookie })).json();
  assert.equal(k2.kunde.module.bewerberChat.stellen.length, 3);
  assert.equal(k2.geaendertVon, "giosue@test.de");

  assert.equal((await ruf("/admin/api/kunden/maler-mueller", { m: "DELETE", cookie, body: { bestaetigung: "falsch" } })).status, 400);
  assert.equal((await ruf("/admin/api/kunden/maler-mueller", { m: "DELETE", cookie, body: { bestaetigung: "maler-mueller" } })).status, 200);
  assert.equal((await ruf("/admin/api/kunden/maler-mueller", { cookie })).status, 404);
  assert.equal((await ruf("/admin/api/kunden/maler-zwei", { cookie })).status, 200);
});

test("Chef-Übersicht und Auswertung je Kunde im Admin-Panel", async () => {
  await neuerSpeicher(); _reset();
  const cookie = await anmelden();
  await ruf("/admin/api/kunden", { cookie, body: { kunde: { ...NEU, rechtliches: { datenschutzUrl: "https://x.de/d" } } } });
  await ruf("/admin/api/kunden/maler-mueller/veroeffentlichen", { cookie, body: {} });
  await app.request(B + "/k/maler-mueller/api/anfrage", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "5.5.5.5" }, body: JSON.stringify({ name: "Eva Beispiel", kontakt: "0171 5550100", paket: "Fassade", einwilligung: true }) });
  await app.request(B + "/k/maler-mueller/api/chat", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "5.5.5.5" }, body: JSON.stringify({ nachricht: "Hallo" }) }).then((r) => r.text());
  await new Promise((x) => setTimeout(x, 30));
  const v: any = await (await ruf("/admin/api/kunden/maler-mueller/vorgaenge", { cookie })).json();
  assert.equal(v.vorgaenge.length, 1);
  assert.equal(v.vorgaenge[0].status, "neu");
  await ruf(`/admin/api/kunden/maler-mueller/vorgaenge/${v.vorgaenge[0].id}`, { cookie, body: { status: "Angebot geschrieben" } });
  assert.equal(((await (await ruf("/admin/api/kunden/maler-mueller/vorgaenge", { cookie })).json()) as any).vorgaenge[0].status, "Angebot geschrieben");
  const a: any = await (await ruf("/admin/api/kunden/maler-mueller/auswertung", { cookie })).json();
  const zahl = (art: string) => a.zeilen.filter((z: any) => z.art === art).reduce((n: number, z: any) => n + z.n, 0);
  assert.equal(zahl("chat"), 1); assert.equal(zahl("anfrage"), 1);
});
