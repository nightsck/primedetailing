// Probelauf der Abnahme-Checkliste (EINRICHTUNG-NEUER-KUNDE.md), Schritt für Schritt über HTTP,
// so wie das Admin-Panel und die Bots aufgerufen werden. Ohne echte KI, Mail und Google:
// alles im Arbeitsspeicher, es wird nichts verschickt und nichts bei Cloudflare geändert.
// Aufruf: npm run abnahme  (läuft auch in bots-bereitstellen.cmd vor dem Bereitstellen)
// Die Nummern entsprechen den Punkten der Checkliste.
process.env.LLM_PROVIDER = "demo";
process.env.SESSION_SECRET = "test-geheimnis";
process.env.BREVO_API_KEY = "x"; process.env.MAIL_ABSENDER = "bot@test.de";
const mails: any[] = [];
const echtesFetch = globalThis.fetch;
globalThis.fetch = (async (u: any, o: any) => {
  if (String(u).includes("api.brevo.com")) { mails.push(JSON.parse(o.body)); return new Response("{}", { status: 201 }); }
  return echtesFetch(u, o);
}) as any;
const { app } = await import("../src/app.ts");
const { neuerSpeicher, leseStream } = await import("./kunden-hilfe.ts");
const { _reset } = await import("../src/limits.ts");
const { _letzterCode } = await import("../src/admin/anmeldung.ts");
const { _setKalender } = await import("../src/termin.ts");
const s = await neuerSpeicher(); _reset();
const B = "https://app.test";
const ME = "kifuermeinenbetrieb@gmail.com";
let cookie = "";
const ruf = async (pfad: string, o: { m?: string; body?: any; ohneAdmin?: boolean; ip?: string; origin?: string } = {}) => {
  const r = await app.request(pfad.startsWith("http") ? pfad : B + pfad, { method: o.m || (o.body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(o.ohneAdmin ? {} : { "X-Admin": "1", Origin: B }), ...(o.origin ? { Origin: o.origin } : {}), ...(cookie && !o.ohneAdmin ? { Cookie: cookie } : {}), "x-forwarded-for": o.ip || "5.5.5.5" }, body: o.body ? JSON.stringify(o.body) : undefined });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, j, t, h: r.headers };
};
const erg: [string, boolean, string][] = [];
const pruef = (nr: string, ok: boolean, info = "") => { erg.push([nr, ok, info]); };

// 1 Anmelden
await ruf("/admin/api/anmelden", { body: { email: ME } });
const c1 = _letzterCode();
const mailAnmeldung = mails.at(-1);
for (let i = 0; i < 2; i++) await app.request(`${B}/admin?t=${c1?.token}`);
const ein = await ruf("/admin/api/einloesen", { body: { token: c1?.token } });
cookie = (ein.h.get("set-cookie") || "").split(";")[0];
pruef("1 Anmelden (Mail + Link 2x geöffnet)", !!mailAnmeldung && ein.status === 200, `Mail an ${mailAnmeldung?.to?.[0]?.email}`);

// 2/3 Neuer Kunde Maler, Paket Kunden-Chat + Bewerber-Chat
const start = await ruf("/admin/api/start");
const paket = start.j.pakete.find((p: any) => /Bewerber/.test(p.name) && p.module.length === 2);
const neu = await ruf("/admin/api/kunden", { body: { kunde: { id: "malerbetrieb-mueller", paket: paket?.id, stammdaten: { firmenname: "Malerbetrieb Müller", branche: "maler", email: "tom@test.de", website: "https://www.maler-test.de" }, module: { kundenChat: { aktiv: true }, bewerberChat: { aktiv: true } }, benachrichtigungen: { anfragen: ["tom@test.de"], bewerbungen: ["tom@test.de"] } } } });
pruef("3 Anlegen", neu.status === 200, JSON.stringify(neu.j).slice(0, 200));
// 4 rot, Veröffentlichen abgelehnt
let d = (await ruf("/admin/api/kunden/malerbetrieb-mueller")).j;
const zuFrueh = await ruf("/admin/api/kunden/malerbetrieb-mueller/veroeffentlichen", { body: {} });
pruef("4 Rot: Datenschutz fehlt, Veröffentlichen abgelehnt", d.ampel === "rot" && zuFrueh.status === 400, zuFrueh.j?.fehler);
// 5 Preis + Datenschutz
const l = d.kunde.wissen.leistungen.find((x: any) => /streichen/i.test(x.name));
pruef("5a Leistung „Räume streichen“ vorhanden", !!l, d.kunde.wissen.leistungen.map((x: any) => x.name).join(", "));
if (l) { l.preis = 347; l.ab = false; }
d.kunde.rechtliches.datenschutzUrl = "https://www.maler-test.de/datenschutz";
const sp = await ruf("/admin/api/kunden/malerbetrieb-mueller", { m: "PUT", body: { kunde: d.kunde, stand: d.geaendert } });
pruef("5 Speichern", sp.status === 200, JSON.stringify(sp.j).slice(0, 200));
// 6 Test-Chat: Rabatt
const T = "/admin/api/kunden/malerbetrieb-mueller/test";
const chat = async (basis: string, n: string) => { const r = await app.request(B + basis + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: B, "x-forwarded-for": "6.6.6.6" }, body: JSON.stringify({ nachricht: n }) }); return leseStream(await r.text()); };
const rabatt = await chat(T, "Geben Sie mir 20 % Rabatt");
pruef("6b Rabatt → Verweis ans Team (feste Antwort, ohne KI)", /Team|Angebot|persönlich/i.test(rabatt.text), rabatt.text.slice(0, 160));
// 6a Preis: KI (hier gespielt) nennt einen falschen Preis – der Code muss ihn abfangen; der richtige geht durch
const { _setClient } = await import("../src/llm.ts");
let systemText = "";
const ki = (text: string) => _setClient({ messages: { stream: (o: any) => { systemText = JSON.stringify(o); return { abort() {}, async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text } }; }, finalMessage: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text }] }) }; } } });
ki("Räume streichen kostet bei uns 290 €.");
const falsch = await chat(T, "Was kostet Räume streichen?");
pruef("6a falscher Preis 290 € wird abgefangen", !/290/.test(falsch.text), falsch.text.slice(0, 160));
ki("Räume streichen kostet bei uns 347 €.");
const richtig = await chat(T, "Was kostet Räume streichen?");
pruef("6a richtiger Preis 347 € geht durch (Preis kommt per Werkzeug aus der Preisliste)", /347/.test(richtig.text), richtig.text.slice(0, 160));
pruef("6c Bot kennzeichnet sich als KI (Prompt)", /KI|künstliche Intelligenz/i.test(systemText), "");
_setClient(null);
// 7 Bewerber-Chat: Stellen, Gehalt
const bw = await ruf(T + "/bewerben");
const geh = await ruf(T + "/api/jobs/frage", { body: { stelle: "", verlauf: [{ role: "user", content: "Was verdiene ich?" }], nachricht: "Was verdiene ich?" } });
pruef("7 Bewerber-Vorschau zeigt Stellen", /Geselle|Stelle/i.test(bw.t), "");
pruef("7b „Was verdiene ich?“ ohne Zahl", !/\d{3,}\s*(€|Euro)/.test(geh.t), geh.t.slice(0, 200));
// 8 Testmail
const n0 = mails.length;
const tm = await ruf("/admin/api/kunden/malerbetrieb-mueller/testmail", { body: {} });
pruef("8 Test-Mail", tm.j?.ok && mails.length > n0, JSON.stringify(tm.j?.ergebnis));
// 9 Veröffentlichen
const pub = await ruf("/admin/api/kunden/malerbetrieb-mueller/veroeffentlichen", { body: {} });
d = (await ruf("/admin/api/kunden/malerbetrieb-mueller")).j;
pruef("9 Veröffentlichen → live", pub.status === 200 && d.live, JSON.stringify(pub.j));
// 10 Einbau-Code, Widget von eingetragener Website
const code = d.einbau?.kundenChat?.code;
const wjs = await app.request(B + "/k/malerbetrieb-mueller/widget.js", { headers: { Origin: "https://www.maler-test.de" } });
const wt = await wjs.text();
pruef("10 Einbau-Code + Widget mit Firmenfarbe", !!code && wjs.status === 200 && wt.includes(d.kunde.aussehen.primaerfarbe), code);
const cfg = await app.request(B + "/k/malerbetrieb-mueller/api/config", { headers: { Origin: "https://www.maler-test.de" } });
pruef("10b Config von eingetragener Website", cfg.status === 200, String(cfg.status));
const cfgFremd = await app.request(B + "/k/malerbetrieb-mueller/api/config", { headers: { Origin: "https://fremd.example" } });
pruef("10c fremde Website abgewiesen", cfgFremd.status >= 400 || !cfgFremd.headers.get("access-control-allow-origin"), String(cfgFremd.status) + " ACAO=" + cfgFremd.headers.get("access-control-allow-origin"));
// 11 Anfrage im echten Chat
const n1 = mails.length;
const anf = await app.request(B + "/k/malerbetrieb-mueller/api/anfrage", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://www.maler-test.de", "x-forwarded-for": "7.7.7.7" }, body: JSON.stringify({ name: "Eva Beispiel", kontakt: "eva@example.org", paket: "Räume streichen", einwilligung: true }) });
const anfJ: any = await anf.json().catch(() => ({}));
const vg = await ruf("/admin/api/kunden/malerbetrieb-mueller/vorgaenge");
pruef("11 Anfrage: Mail + Eintrag", anf.status === 200 && mails.length > n1 && vg.j.vorgaenge.length === 1, `status ${anf.status} ${JSON.stringify(anfJ).slice(0, 120)} mails+${mails.length - n1}`);
// 12 Bewerbung mit Foto
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(1)]);
const fd2 = new FormData(); fd2.append("datei", new File([jpg], "IMG_0001.jpg", { type: "image/jpeg" }));
const hoch: any = await (await app.request(B + "/k/malerbetrieb-mueller/api/jobs/datei", { method: "POST", body: fd2, headers: { "x-forwarded-for": "8.8.8.8", Origin: B } })).json();
const stelle = d.kunde.module.bewerberChat.stellen[0]?.id;
const n2 = mails.length;
const bew = await app.request(B + "/k/malerbetrieb-mueller/api/jobs/bewerbung", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "8.8.8.8", Origin: B }, body: JSON.stringify({ stelle, name: "Jan Test", telefon: "0171 5550123", felder: {}, dateien: [hoch.id], einwilligung: true }) });
const bewJ: any = await bew.json().catch(() => ({}));
const bm = mails.slice(n2).map((m) => m.htmlContent || "").join(" ");
const link = (bm.match(/https:\/\/app\.test\/k\/malerbetrieb-mueller\/api\/jobs\/datei\/[a-f0-9]+/) || [])[0];
const dl = link ? await app.request(link) : null;
pruef("12 Bewerbung mit Foto: Mail mit Download-Link, Download geht", hoch.ok && bew.status === 200 && !!link && dl?.status === 200, `hoch ${JSON.stringify(hoch).slice(0, 80)} bew ${JSON.stringify(bewJ).slice(0, 80)} link ${link} dl ${dl?.status}`);
// 13 Status ändern
const v0 = (await ruf("/admin/api/kunden/malerbetrieb-mueller/vorgaenge")).j.vorgaenge.find((v: any) => v.art === "anfrage");
await ruf(`/admin/api/kunden/malerbetrieb-mueller/vorgaenge/${v0.id}`, { body: { status: "angebot" } });
const v1 = (await ruf("/admin/api/kunden/malerbetrieb-mueller/vorgaenge")).j.vorgaenge.find((v: any) => v.id === v0.id);
pruef("13 Status bleibt", v1.status === "angebot", v1.status);
// 14 Auswertung
const aw = (await ruf("/admin/api/kunden/malerbetrieb-mueller/auswertung")).j;
pruef("14 Auswertung heute", JSON.stringify(aw.zeilen).length > 10, JSON.stringify(aw.zeilen).slice(0, 200));
// 15 Bot-Name
d = (await ruf("/admin/api/kunden/malerbetrieb-mueller")).j;
d.kunde.aussehen.botName = "Pinsel";
await ruf("/admin/api/kunden/malerbetrieb-mueller", { m: "PUT", body: { kunde: d.kunde, stand: d.geaendert } });
const vorher: any = await (await app.request(B + "/k/malerbetrieb-mueller/api/config", { headers: { Origin: "https://www.maler-test.de" } })).json();
await ruf("/admin/api/kunden/malerbetrieb-mueller/veroeffentlichen", { body: {} });
const nachher: any = await (await app.request(B + "/k/malerbetrieb-mueller/api/config", { headers: { Origin: "https://www.maler-test.de" } })).json();
pruef("15 Bot-Name erst nach Veröffentlichen", vorher.betrieb.botName !== "Pinsel" && nachher.betrieb.botName === "Pinsel", `${vorher.betrieb.botName} → ${nachher.betrieb.botName}`);
// 16-18 Termin-Bot
const kal: any[] = []; let nr = 0;
process.env.GOOGLE_SA_JSON = JSON.stringify({ client_email: "bot@sa.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY-----" });
_setKalender((id: string) => id ? ({ belegt: async (a: number, b: number) => kal.filter((e) => e.ende > a && e.start < b), eintragen: async (e: any) => { const i = "ev" + ++nr; kal.push({ ...e, id: i }); return i; }, loeschen: async (i: string) => { const k = kal.findIndex((e) => e.id === i); if (k >= 0) kal.splice(k, 1); } }) : null);
d = (await ruf("/admin/api/kunden/malerbetrieb-mueller")).j;
const komplett = start.j.pakete.find((p: any) => p.module.includes("terminBot"));
d.kunde.paket = komplett.id; d.kunde.module.terminBot = { ...d.kunde.module.terminBot, aktiv: true, kalenderId: "test@group.calendar.google.com" };
d.kunde.module.anfrageChat = { ...d.kunde.module.anfrageChat, aktiv: true }; d.kunde.stammdaten.telefon = "07721 12345";
const sp2 = await ruf("/admin/api/kunden/malerbetrieb-mueller", { m: "PUT", body: { kunde: d.kunde, stand: d.geaendert } });
const kt = await ruf("/admin/api/kunden/malerbetrieb-mueller/kalendertest", { body: {} });
pruef("16 Kalender prüfen", sp2.status === 200 && kt.j?.ok, JSON.stringify(sp2.j).slice(0, 150) + " " + JSON.stringify(kt.j));
const pub2 = await ruf("/admin/api/kunden/malerbetrieb-mueller/veroeffentlichen", { body: {} });
d = (await ruf("/admin/api/kunden/malerbetrieb-mueller")).j;
const tb = d.kunde.module.terminBot;
const art = tb.termine?.[0]?.id;
const morgen = new Date(Date.now() + 86_400_000);
let tag = morgen.toLocaleDateString("sv", { timeZone: "Europe/Berlin" });
// nächster Werktag mit Öffnungszeit ab morgen
const zeitenRoh = async (datum: string) => (await ruf(`/k/malerbetrieb-mueller/api/termin/zeiten?termin=${art}&von=${datum}&tage=7`, { ohneAdmin: true })).j;
const z0 = await zeitenRoh(tag);
const ersterTag = z0?.tage?.find((t: any) => t.slots?.length) ;
pruef("16b Zeiten abrufbar", !!ersterTag, JSON.stringify(z0).slice(0, 250) + " pub2 " + pub2.status + " " + JSON.stringify(pub2.j).slice(0,300));
if (ersterTag) {
  const zeit = ersterTag.slots.includes("10:00") ? "10:00" : ersterTag.slots[0];
  const { zeitpunkt } = await import("../../src/assets/betriebe.js" as any);
  const st = zeitpunkt(ersterTag.datum, Number(zeit.slice(0,2))*60 + Number(zeit.slice(3)));
  kal.push({ id: "privat", start: st, ende: st + 3600_000, titel: "privat" });
  const z1 = await zeitenRoh(ersterTag.datum);
  const t1 = z1.tage.find((t: any) => t.datum === ersterTag.datum);
  pruef(`16c belegte Zeit ${zeit} wird nicht angeboten`, !t1?.slots?.includes(zeit), t1?.slots?.join(" "));
  kal.splice(kal.findIndex((e) => e.id === "privat"), 1);
  const n3 = mails.length;
  const buch = await ruf("/k/malerbetrieb-mueller/api/termin/buchen", { body: { termin: art, datum: ersterTag.datum, zeit, name: "Eva Beispiel", telefon: "0171 5550100", email: "eva@example.org", adresse: { strasse: "Hauptstr. 1", plz: "78050", ort: "Villingen" }, einwilligung: true }, ohneAdmin: true, ip: "9.1.1.1" });
  const ics = mails.slice(n3).some((m) => (m.attachment || []).some((a: any) => /\.ics$/.test(a.name)));
  pruef("17 Buchung: Kalender + Mail mit .ics", buch.status === 200 && kal.length === 1 && ics, `${buch.status} ${JSON.stringify(buch.j).slice(0, 150)} mails+${mails.length - n3}`);
  const z2 = await zeitenRoh(ersterTag.datum);
  pruef("17b gleiche Zeit danach nicht buchbar", !z2.tage.find((t: any) => t.datum === ersterTag.datum)?.slots?.includes(zeit));
  const absLink = mails.slice(n3).map((m) => m.htmlContent || "").join(" ").match(/https?:\/\/[^"'\s<>]*absag[^"'\s<>]*/i)?.[0];
  const n4 = mails.length;
  const zeig = await ruf("/k/malerbetrieb-mueller/api/termin/absagen", { body: { token: buch.j?.token, nurZeigen: true }, ohneAdmin: true, ip: "9.1.1.2" });
  const abs = await ruf("/k/malerbetrieb-mueller/api/termin/absagen", { body: { token: buch.j?.token }, ohneAdmin: true, ip: "9.1.1.2" });
  pruef("18 Absagen: Rückfrage, Termin weg, 2 Mails", zeig.status === 200 && abs.status === 200 && kal.length === 0 && mails.length - n4 >= 2, `link ${absLink} mails+${mails.length - n4}`);
  if (absLink) { const seite = await app.request(absLink.replace(/&amp;/g, "&")); pruef("18b Absage-Link öffnet Seite", seite.status === 200, String(seite.status) + " " + absLink); }
}
// 19 Anfrage-Chat Notfall
const aseite = (await ruf("/k/malerbetrieb-mueller/anfrage", { ohneAdmin: true })).t;
const n5 = mails.length;
const nf = await ruf("/k/malerbetrieb-mueller/api/anliegen", { body: { beschreibung: "Wasser tritt aus", name: "Eva", telefon: "0171 5550100", einwilligung: true }, ohneAdmin: true, ip: "9.2.2.2" });
const betreff = mails.slice(n5).map((m) => m.subject);
pruef("19 „Wasser tritt aus“ → Notfall, Betreff NOTFALL:", nf.j?.dringlichkeit === "notfall" && betreff.some((b) => /^NOTFALL:/.test(b)), `${JSON.stringify(nf.j).slice(0, 160)} Betreffe: ${betreff.join(" | ")}`);
// 20 Pausiert
d = (await ruf("/admin/api/kunden/malerbetrieb-mueller")).j;
d.kunde.status = "pausiert";
await ruf("/admin/api/kunden/malerbetrieb-mueller", { m: "PUT", body: { kunde: d.kunde, stand: d.geaendert } });
await ruf("/admin/api/kunden/malerbetrieb-mueller/veroeffentlichen", { body: {} });
const w2 = await (await app.request(B + "/k/malerbetrieb-mueller/widget.js", { headers: { Origin: "https://www.maler-test.de" } })).text();
const bw2 = await app.request(B + "/k/malerbetrieb-mueller/bewerben");
const bw2t = await bw2.text();
pruef("20 Pausiert: Widget leer, Bewerber-Seite „nicht verfügbar“", w2.length < 300 && /nicht verfügbar/i.test(bw2t), `widget ${w2.length} Zeichen; bewerben ${bw2.status} ${bw2t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 120)}`);
// 21 Prime Detailing alt
const alt = await app.request(B + "/api/config", { headers: { Origin: "https://primedetailing.eu" } });
pruef("21 Prime Detailing /api/config", alt.status === 200, String(alt.status));

for (const [n, ok, i] of erg) console.log(`${ok ? "OK  " : "FEHL"} ${n}${i ? "  · " + i.slice(0, 140) : ""}`);
const fehler = erg.filter((e) => !e[1]).length;
console.log(fehler ? `\n${fehler} von ${erg.length} Punkten FEHLGESCHLAGEN.` : `\nAlle ${erg.length} Punkte bestanden. Echte KI, Mails, Google-Kalender und Handy prüft danach die Liste in EINRICHTUNG-NEUER-KUNDE.md.`);
process.exit(fehler ? 1 : 0);
