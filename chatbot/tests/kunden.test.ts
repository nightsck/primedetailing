// Mehrere Kunden auf einem Server: Jeder bekommt nur seine Konfiguration, seine
// Limits und seine Daten. Läuft im Demo-Modus (ohne KI) über die HTTP-Schnittstelle.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.LLM_PROVIDER = "demo";
process.env.SESSION_SECRET = "test-geheimnis";
const { app } = await import("../src/app.ts");
const { neuerSpeicher, beispiel, anlegen, leseStream } = await import("./kunden-hilfe.ts");
const { _reset } = await import("../src/limits.ts");
const { pruefeKunde, feldHilfen } = await import("../src/kunde/schema.ts");
const { VORLAGEN, ausVorlage } = await import("../src/kunde/vorlagen.ts");
const { laufzeitVon, bewerberBetriebVon, erlaubteHerkunft, betriebsStatus } = await import("../src/kunde/umwandeln.ts");
const { mitKunde } = await import("../src/kontext.ts");
const { systemBlocks } = await import("../src/prompt.ts");
const { systemFuer } = await import("../src/bewerber.ts");
const { pruefeAntwort, katalogBetraege } = await import("../src/guard.ts");

const post = (pfad: string, body: any, kopf: Record<string, string> = {}) =>
  app.request(pfad, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9", ...kopf }, body: JSON.stringify(body) });
const chat = async (kunde: string, nachricht: string, ip = "9.9.9.9") => leseStream(await (await post(`/k/${kunde}/api/chat`, { nachricht }, { "x-forwarded-for": ip })).text());
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 10, 37, 37, 69, 79, 70, 10, 10]);

/* ---------- Schema ---------- */
test("Schema: Pflichtfelder, deutsche Fehlertexte, Standardwerte", () => {
  const leer = pruefeKunde({});
  assert.equal(leer.ok, false);
  const felder = (leer as any).fehler.map((f: any) => f.feld);
  assert.ok(felder.includes("id") && felder.includes("stammdaten"), felder.join(","));
  const r = pruefeKunde({ id: "Maler Müller", stammdaten: { firmenname: "M", brancheText: "Maler", email: "keine-mail" } }) as any;
  assert.equal(r.ok, false);
  assert.ok(r.fehler.every((f: any) => !/^(Invalid|Required|Expected|Too)/.test(f.text)), "Fehlertexte sind deutsch: " + JSON.stringify(r.fehler));
  assert.ok(r.fehler.some((f: any) => f.feld === "stammdaten.email"));
  const ok = pruefeKunde({ id: "maler-mueller", stammdaten: { firmenname: "Malerbetrieb Müller", brancheText: "Malerbetrieb", email: "Info@Maler.de" } }) as any;
  assert.equal(ok.ok, true);
  assert.equal(ok.kunde.stammdaten.email, "info@maler.de");
  assert.equal(ok.kunde.status, "test");
  assert.equal(ok.kunde.rechtliches.aufbewahrungTage, 180);
  assert.equal(ok.kunde.module.kundenChat.aktiv, false, "Module sind erst einmal aus");
});

test("Schema: Module nur im passenden Paket, Anruf-Retter bleibt aus, doppelte Stellen fallen auf", () => {
  const basis = { id: "test-kunde", stammdaten: { firmenname: "Test GmbH", brancheText: "Test", email: "a@b.de" } };
  const r1 = pruefeKunde({ ...basis, paket: "bewerber", module: { kundenChat: { aktiv: true } } }) as any;
  assert.equal(r1.ok, false);
  assert.match(r1.fehler[0].text, /nicht enthalten/);
  assert.equal(pruefeKunde({ ...basis, paket: "chat", module: { kundenChat: { aktiv: true } } }).ok, true);
  assert.equal(pruefeKunde({ ...basis, paket: "komplett", module: { anrufRetter: { aktiv: true } } }).ok, false);
  assert.equal(pruefeKunde({ ...basis, paket: "komplett", module: { terminBot: { aktiv: true, zeiten: { mo: "8 bis 12" } } } }).ok, false, "Zeitfenster falsch geschrieben");
  const st = { id: "geselle", name: "Geselle" };
  assert.equal(pruefeKunde({ ...basis, module: { bewerberChat: { aktiv: true, stellen: [st, st] } } }).ok, false);
});

test("Branchen-Vorlagen: alle neun ergeben eine gültige Konfiguration mit Stellen und Erklärungen", () => {
  assert.equal(Object.keys(VORLAGEN).length, 9);
  for (const b of Object.keys(VORLAGEN)) {
    const r = pruefeKunde(ausVorlage(b, { id: "vorlage-" + b, paket: "komplett", stammdaten: { firmenname: "Vorlage " + b, email: "a@b.de" } })) as any;
    assert.equal(r.ok, true, b + ": " + JSON.stringify(r.fehler));
    assert.ok(r.kunde.module.bewerberChat.stellen.length >= 2, b);
    assert.ok(r.kunde.wissen.nieSagen.length >= 2, b);
  }
  const h = feldHilfen();
  assert.ok(h["rechtliches.aufbewahrungTage"] && h["module.terminBot.kalenderId"] && h["wissen.leistungen"]);
});

/* ---------- Prompt-Zusammenbau ---------- */
test("Prompt: aus Vorlage + Konfiguration, ohne Reste eines anderen Kunden", () => {
  const k = beispiel("maler-mueller", "maler", { wissen: { leistungen: [{ kategorie: "Innen", name: "Zimmer streichen", preis: 290, ab: true }], nieSagen: ["Keine Aussagen zu Lieferzeiten."] } });
  const l = laufzeitVon(k);
  const text = mitKunde(l, () => systemBlocks().map((b) => b.text).join("\n"));
  assert.match(text, /Malerbetrieb Müller \(Malerbetrieb\)/);
  assert.match(text, /Keine Aussagen zu Lieferzeiten\./);
  assert.match(text, /Zimmer streichen/);
  assert.doesNotMatch(text, /Prime Detailing|Tropfi|Fahrzeugaufbereitung/);
  assert.doesNotMatch(text, /290/, "Preise stehen nicht im Prompt, nur in den Werkzeugen");
  // Preisprüfung kennt nur die Preise dieses Kunden
  mitKunde(l, () => {
    assert.deepEqual([...katalogBetraege], [290]);
    assert.equal(pruefeAntwort("Das kostet ab 290 €.", [...katalogBetraege]).ok, true);
    assert.equal(pruefeAntwort("Das kostet 59,99 €.", [...katalogBetraege]).ok, false);
  });
  // Außerhalb des Kunden-Kontexts gilt wieder der Standard-Kunde
  assert.match(systemBlocks()[0].text, /Prime Detailing/);
});

test("Bewerber-Prompt: Stellen des Kunden, Löschfrist aus der Konfiguration, kein Demo-Hinweis", () => {
  const k = beispiel("maler-mueller", "maler", { rechtliches: { datenschutzUrl: "https://x.de/d", aufbewahrungTage: 90 } });
  const b = bewerberBetriebVon(k)!;
  const text = systemFuer(b, "geselle", false);
  assert.match(text, /Malerbetrieb Müller/);
  assert.match(text, /Maler und Lackierer Geselle/);
  assert.match(text, /nach 3 Monaten gelöscht/);
  assert.match(text, /Bewerte niemals/);
  assert.doesNotMatch(text, /erfundener Beispielbetrieb/);
  assert.equal(bewerberBetriebVon(beispiel("maler-mueller", "maler", { module: { bewerberChat: { aktiv: false } } })), null);
});

test("Status und erlaubte Websites", () => {
  const k = beispiel("maler-mueller", "maler");
  assert.deepEqual(erlaubteHerkunft(k).sort(), ["https://maler-mueller.de", "https://www.maler-mueller.de"]);
  assert.equal(betriebsStatus({ ...k, status: "pausiert" }).an, false);
  assert.equal(betriebsStatus({ ...k, status: "test", testBis: "2026-11-10" }, "2026-11-11").an, false);
  assert.equal(betriebsStatus({ ...k, status: "test", testBis: "2026-11-11" }, "2026-11-11").an, true);
  assert.equal(betriebsStatus({ ...k, status: "aktiv", testBis: "2020-01-01" }).an, true);
});

/* ---------- Zwei Kunden über HTTP ---------- */
test("Jeder Kunde bekommt seine eigene Konfiguration; unbekannte und nicht veröffentlichte Kunden gibt es nicht", async () => {
  const s = await neuerSpeicher(); _reset();
  await anlegen(s, beispiel("maler-mueller", "maler"));
  await anlegen(s, beispiel("elektro-schmidt", "elektro"));
  await anlegen(s, beispiel("nur-entwurf", "handwerk", { id: "nur-entwurf" }), false);
  const a: any = await (await app.request("/k/maler-mueller/api/config")).json();
  const b: any = await (await app.request("/k/elektro-schmidt/api/config")).json();
  const alt: any = await (await app.request("/api/config")).json();
  assert.equal(a.betrieb.name, "Malerbetrieb Müller");
  assert.equal(b.betrieb.name, "Elektro Schmidt");
  assert.equal(alt.betrieb.name, "Prime Detailing", "alte Adresse zeigt weiter Prime Detailing");
  assert.deepEqual(a.start.buttons, ["Räume streichen", "Fassade", "Tapezieren", "Frage stellen"]);
  assert.equal((await app.request("/k/gibt-es-nicht/api/config")).status, 404);
  assert.equal((await app.request("/k/nur-entwurf/api/config")).status, 404, "Entwurf ist nicht live");
  const antwort = await chat("maler-mueller", "Hallo");
  assert.ok(antwort.text.length > 5 && antwort.token);
  assert.doesNotMatch(antwort.text, /Prime Detailing|Tropfi/);
});

test("Widget je Kunde: eigene Farben und Adresse; fremde Website wird abgewiesen", async () => {
  const s = await neuerSpeicher(); _reset();
  await anlegen(s, beispiel("maler-mueller", "maler", { aussehen: { primaerfarbe: "#7a3b1d" } }));
  const js = await (await app.request("http://chat.test/k/maler-mueller/widget.js")).text();
  assert.match(js, /"primaer":"#7a3b1d"/);
  assert.match(js, /"api":"http:\/\/chat\.test\/k\/maler-mueller"/);
  assert.doesNotMatch(js, /Tropfi/);
  const erlaubt = await app.request("/k/maler-mueller/api/config", { headers: { Origin: "https://www.maler-mueller.de" } });
  assert.equal(erlaubt.status, 200);
  assert.equal(erlaubt.headers.get("access-control-allow-origin"), "https://www.maler-mueller.de");
  const fremd = await app.request("/k/maler-mueller/api/config", { headers: { Origin: "https://boese-seite.example" } });
  assert.equal(fremd.status, 403);
  const vorab = await app.request("/k/maler-mueller/api/chat", { method: "OPTIONS", headers: { Origin: "https://maler-mueller.de" } });
  assert.equal(vorab.status, 204);
});

test("Pausierter Kunde: Chat aus, Widget leer; Modul aus: Schnittstelle zu", async () => {
  const s = await neuerSpeicher(); _reset();
  await anlegen(s, beispiel("maler-mueller", "maler", { status: "pausiert" }));
  await anlegen(s, beispiel("elektro-schmidt", "elektro", { module: { kundenChat: { aktiv: false }, bewerberChat: { aktiv: true } } }));
  assert.equal((await app.request("/k/maler-mueller/api/config")).status, 403);
  assert.match(await (await app.request("/k/maler-mueller/widget.js")).text(), /ausgeschaltet/);
  assert.equal((await app.request("/k/elektro-schmidt/api/config")).status, 404);
  assert.equal((await app.request("/k/elektro-schmidt/bewerben")).status, 200);
});

test("Limits zählen je Kunde: Kunde A am Limit bremst Kunde B nicht", async () => {
  const s = await neuerSpeicher(); _reset();
  await anlegen(s, beispiel("maler-mueller", "maler", { technik: { tagesbudget: 50, monatsbudget: 100 } }));
  await anlegen(s, beispiel("elektro-schmidt", "elektro"));
  for (let i = 0; i < 8; i++) await chat("maler-mueller", "Hallo", "7.7.7.7");
  assert.match((await chat("maler-mueller", "Hallo", "7.7.7.7")).text, /Zu viele Nachrichten/);
  assert.doesNotMatch((await chat("elektro-schmidt", "Hallo", "7.7.7.7")).text, /Zu viele Nachrichten/, "gleiche IP, anderer Kunde");
  // Tagesbudget des einen Kunden (50) ist nach 50 Nachrichten verschiedener Besucher erschöpft
  for (let i = 0; i < 45; i++) await chat("maler-mueller", "Hallo", "8.8.0." + i);
  assert.match((await chat("maler-mueller", "Hallo", "8.8.1.1")).text, /ausgelastet/);
  assert.doesNotMatch((await chat("elektro-schmidt", "Hallo", "8.8.1.1")).text, /ausgelastet/);
});

test("Monatsbudget: Kostenbremse je Kunde", async () => {
  const s = await neuerSpeicher(); _reset();
  await anlegen(s, beispiel("maler-mueller", "maler", { technik: { tagesbudget: 500, monatsbudget: 100 } }));
  await s.zaehle("maler-mueller", "chat", 100);
  assert.match((await chat("maler-mueller", "Hallo")).text, /ausgelastet/);
});

test("Anfrage: wird beim richtigen Kunden gespeichert und gezählt, Kunde B sieht sie nie", async () => {
  const s = await neuerSpeicher(); _reset();
  await anlegen(s, beispiel("maler-mueller", "maler"));
  await anlegen(s, beispiel("elektro-schmidt", "elektro"));
  const ohneOk = await post("/k/maler-mueller/api/anfrage", { name: "Eva", kontakt: "0171 1234567" });
  assert.equal(ohneOk.status, 400, "ohne Einwilligung keine Anfrage");
  const r: any = await (await post("/k/maler-mueller/api/anfrage", { name: "Eva Beispiel", kontakt: "eva@example.org", fahrzeug: "Wohnung, 3 Zimmer", paket: "Räume streichen", einwilligung: true })).json();
  assert.equal(r.ok, true);
  assert.equal(r.formsubmit, null, "kein Formulardienst im Browser nötig");
  await new Promise((x) => setTimeout(x, 20));
  const a = await s.vorgaenge("maler-mueller");
  assert.equal(a.length, 1);
  assert.equal(a[0].art, "anfrage");
  assert.equal(a[0].titel, "Räume streichen – Eva Beispiel");
  assert.equal((a[0].daten as any).objekt, "Wohnung, 3 Zimmer");
  assert.equal((await s.vorgaenge("elektro-schmidt")).length, 0);
  assert.equal(await s.vorgangStatus("elektro-schmidt", a[0].id, "erledigt"), false, "fremder Kunde kann den Status nicht ändern");
  assert.equal(await s.summeMonat("maler-mueller", "anfrage"), 1);
  assert.equal(await s.summeMonat("elektro-schmidt", "anfrage"), 0);
});

test("Bewerbung mit Unterlage: hochladen, abschicken, Download nur beim richtigen Kunden", async () => {
  const s = await neuerSpeicher(); _reset();
  await anlegen(s, beispiel("maler-mueller", "maler"));
  await anlegen(s, beispiel("elektro-schmidt", "elektro"));
  const seite = await (await app.request("http://chat.test/k/maler-mueller/bewerben")).text();
  assert.match(seite, /Malerbetrieb Müller/);
  assert.match(seite, /"versand":"server"/);
  assert.match(seite, /Maler und Lackierer Geselle/);
  const fd = new FormData(); fd.append("datei", new File([PDF], "Lebenslauf.pdf", { type: "application/pdf" }));
  const hoch: any = await (await app.request("/k/maler-mueller/api/jobs/datei", { method: "POST", body: fd, headers: { "x-forwarded-for": "9.9.9.9" } })).json();
  assert.equal(hoch.ok, true);
  const exe = new FormData(); exe.append("datei", new File([new Uint8Array([0x4d, 0x5a, 1, 2, 3, 4, 5, 6])], "virus.pdf"));
  assert.equal((await app.request("/k/maler-mueller/api/jobs/datei", { method: "POST", body: exe })).status, 415, "Dateityp wird am Inhalt erkannt");
  const r: any = await (await post("http://chat.test/k/maler-mueller/api/jobs/bewerbung", { stelle: "geselle", name: "Jan Test", telefon: "0171 5550123", felder: { Erfahrung: "ja, beruflich", "Über mich": "10 Jahre Maler" }, dateien: [hoch.id], einwilligung: true })).json();
  assert.equal(r.ok, true);
  const v = await s.vorgaenge("maler-mueller", { art: "bewerbung" });
  assert.equal(v.length, 1);
  assert.equal(v[0].titel, "Maler und Lackierer Geselle (m/w/d) – Jan Test");
  const link = (v[0].daten as any).dateien[0].url as string;
  assert.match(link, /^http:\/\/chat\.test\/k\/maler-mueller\/api\/jobs\/datei\/[a-f0-9]{64}$/);
  const laden = await app.request(link);
  assert.equal(laden.status, 200);
  assert.equal(new Uint8Array(await laden.arrayBuffer()).length, PDF.length);
  assert.equal((await app.request(link.replace("maler-mueller", "elektro-schmidt"))).status, 404, "anderer Kunde kommt nicht an die Datei");
  assert.equal((await post("/k/maler-mueller/api/jobs/bewerbung", { name: "Jan", telefon: "0171 5550123" })).status, 400, "ohne Einwilligung keine Bewerbung");
});

test("Löschfristen: Vorgänge und Unterlagen verschwinden nach der Frist des Kunden", async () => {
  let zeit = Date.UTC(2026, 10, 11, 12);
  const s = await neuerSpeicher(() => zeit); _reset();
  await anlegen(s, beispiel("maler-mueller", "maler", { rechtliches: { datenschutzUrl: "https://x.de/d", aufbewahrungTage: 30 } }));
  await s.vorgangAnlegen("maler-mueller", { art: "anfrage", titel: "alt", daten: {}, tage: 30 });
  await s.dateiAblegen("maler-mueller", { id: "a".repeat(64), name: "x.pdf", typ: "application/pdf", groesse: PDF.length }, PDF.buffer as ArrayBuffer);
  await s.dateiAblegen("maler-mueller", { id: "b".repeat(64), name: "y.pdf", typ: "application/pdf", groesse: PDF.length }, PDF.buffer as ArrayBuffer);
  await s.dateienBehalten("maler-mueller", ["b".repeat(64)], 30);
  zeit += 3 * 86_400_000;
  await s.aufraeumen();
  assert.equal(await s.dateiHolen("maler-mueller", "a".repeat(64)), null, "nicht abgeschickte Datei nach 2 Tagen weg");
  assert.ok(await s.dateiHolen("maler-mueller", "b".repeat(64)));
  zeit += 28 * 86_400_000;
  assert.equal(await s.aufraeumen(), 2);
  assert.equal((await s.vorgaenge("maler-mueller")).length, 0);
  assert.equal(await s.dateiHolen("maler-mueller", "b".repeat(64)), null);
});

test("Kunde löschen nimmt alles mit, andere Kunden bleiben", async () => {
  const s = await neuerSpeicher(); _reset();
  await anlegen(s, beispiel("maler-mueller", "maler"));
  await anlegen(s, beispiel("elektro-schmidt", "elektro"));
  for (const k of ["maler-mueller", "elektro-schmidt"]) { await s.vorgangAnlegen(k, { art: "anfrage", titel: "x", daten: {}, tage: 30 }); await s.zaehle(k, "chat"); }
  await s.kundeLoeschen("maler-mueller");
  assert.equal(await s.kundeLesen("maler-mueller"), null);
  assert.equal((await s.vorgaenge("maler-mueller")).length, 0);
  assert.equal((await s.vorgaenge("elektro-schmidt")).length, 1);
  assert.equal((await s.kundenListe()).length, 1);
});
