// Echter Bewerber-Chat (/jobs/): Fragen, Unterlagen hochladen, absenden, herunterladen.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.LLM_PROVIDER = "demo";
process.env.SESSION_SECRET = "test-geheimnis";
const { app } = await import("../src/app.ts");
const { dateiTyp, sichererName, jobsBetrieb, MAX_DATEI } = await import("../src/jobs.ts");
const { systemFuer } = await import("../src/bewerber.ts");

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 1, 2, 3]);
const hoch = (bytes: Uint8Array, name: string, ip: string, typ = "application/pdf") => {
  const fd = new FormData();
  fd.append("datei", new File([bytes], name, { type: typ }));
  return app.request("/api/jobs/datei", { method: "POST", body: fd, headers: { "x-forwarded-for": ip } });
};
const json = (pfad: string, body: any, ip: string) =>
  app.request(pfad, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

test("Stellen kommen aus dem CMS und landen im Prompt, ohne Beispielbetrieb-Hinweis", () => {
  const b = jobsBetrieb();
  assert.ok(b, "jobs.yml fehlt oder ist aus");
  assert.ok(Object.keys(b!.stellen).length >= 1);
  const p = systemFuer(b!, Object.keys(b!.stellen)[0], false);
  assert.match(p, /Prime Detailing/);
  assert.doesNotMatch(p, /erfundener Beispielbetrieb/);
  assert.match(p, /Bewerte niemals/);
});

test("Dateityp wird an den Bytes erkannt, nicht am Namen", () => {
  assert.equal(dateiTyp(PDF, "x.exe")?.endung, "pdf");
  assert.equal(dateiTyp(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "a.pdf")?.endung, "jpg");
  assert.equal(dateiTyp(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), "lebenslauf.pdf"), null); // .exe
  assert.equal(dateiTyp(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "a.zip"), null);
  assert.equal(dateiTyp(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "Lebenslauf.docx")?.endung, "docx");
  const heic = new Uint8Array([0, 0, 0, 0x18, ...[..."ftypheic"].map((c) => c.charCodeAt(0))]);
  assert.equal(dateiTyp(heic, "IMG_1.HEIC")?.endung, "heic");
});

test("Dateiname wird bereinigt und bekommt die echte Endung", () => {
  assert.equal(sichererName("../../etc/Lebenslauf Max.exe", "pdf"), "Lebenslauf Max.pdf");
  assert.equal(sichererName('a"<b>.pdf', "pdf"), "ab.pdf");
  assert.equal(sichererName("", "jpg"), "Unterlage.jpg");
});

test("Hochladen → absenden → herunterladen", async () => {
  const r = await (await hoch(PDF, "Lebenslauf Müller.pdf", "40.0.0.1")).json();
  assert.equal(r.ok, true);
  assert.match(r.id, /^[a-f0-9]{64}$/);
  assert.equal(r.name, "Lebenslauf Müller.pdf");

  const a = await (await json("/api/jobs/absenden", { dateien: [r.id, "quatsch", r.id] }, "40.0.0.1")).json();
  assert.equal(a.ok, true);
  assert.equal(a.dateien.length, 1);
  assert.match(a.dateien[0].url, new RegExp(`/api/jobs/datei/${r.id}$`));

  const d = await app.request(`/api/jobs/datei/${r.id}`);
  assert.equal(d.status, 200);
  assert.equal(d.headers.get("content-type"), "application/pdf");
  assert.match(d.headers.get("content-disposition")!, /^attachment;/);
  assert.match(d.headers.get("content-disposition")!, /filename\*=UTF-8''Lebenslauf%20M%C3%BCller\.pdf/);
  assert.equal(d.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await d.arrayBuffer()), PDF);
});

test("Falscher Typ, leere Datei und unbekannte IDs werden abgelehnt", async () => {
  assert.equal((await hoch(new Uint8Array([0x4d, 0x5a, 0x90, 0]), "virus.pdf", "40.0.0.2")).status, 415);
  assert.equal((await hoch(new Uint8Array([]), "leer.pdf", "40.0.0.3")).status, 400);
  assert.equal((await app.request("/api/jobs/datei/abc")).status, 404);
  assert.equal((await app.request(`/api/jobs/datei/${"a".repeat(64)}`)).status, 404);
});

test("Zu große Datei wird abgelehnt", async () => {
  const gross = new Uint8Array(MAX_DATEI + 10); gross.set(PDF);
  assert.equal((await hoch(gross, "riesig.pdf", "40.0.0.4")).status, 413);
});

test("Datei-Limit pro Besucher greift", async () => {
  let letzte = 200;
  for (let i = 0; i < 12; i++) letzte = (await hoch(PDF, `z${i}.pdf`, "40.0.0.5")).status;
  assert.equal(letzte, 429);
});

test("Frage ohne KI meldet demo:true", async () => {
  const r = await (await json("/api/jobs/frage", { nachricht: "Wann arbeitet man?", stelle: "minijob" }, "40.0.0.6")).json();
  assert.equal(r.ok, true);
  assert.equal(r.demo, true);
});
