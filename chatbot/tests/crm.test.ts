// Vertriebs-CRM: Datenmodell, Dubletten, Anrufe, Sperre, Einwilligung, Verträge, Zahlungen, Bot-Ablage, Anmeldung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { testSql } from "./crm-hilfe.ts";
const { crmKern, plusWerktage, tagAus, domainVon, cent } = await import("../src/crm/kern.ts");

// Montag, 2. November 2026, 10:00 Uhr deutscher Zeit
let jetzt = Date.parse("2026-11-02T09:00:00Z");
const neuerKern = () => crmKern(testSql(), () => jetzt);

const ALLE = { vertrag: true, avv: true, sepa: true };

test("Hilfsfunktionen: Werktage, Tag in deutscher Zeit, Domain, Cent", () => {
  assert.equal(plusWerktage("2026-11-06", 1), "2026-11-09", "Freitag + 1 Werktag = Montag");
  assert.equal(plusWerktage("2026-11-02", 5), "2026-11-09");
  assert.equal(tagAus(Date.parse("2026-11-02T23:30:00Z")), "2026-11-03");
  assert.equal(domainVon("https://www.Muster-Werkstatt.de/kontakt"), "muster-werkstatt.de");
  assert.equal(domainVon("muster.de"), "muster.de");
  assert.equal(domainVon(""), null);
  assert.equal(cent("199,90"), 19990);
  assert.equal(cent(990), 99000);
});

test("Firma anlegen, Dubletten über Domain, Telefon, Name+PLZ, Quell-ID", () => {
  const k = neuerKern();
  const a = k.firmaAnlegen({ name: "Autohaus Muster", plz: "70173", telefon: "0711 123456", website: "https://www.autohaus-muster.de" }, "Tom");
  assert.equal(a.neu, true);
  assert.equal(k.firmaAnlegen({ name: "Anders", website: "autohaus-muster.de/impressum" }, "Tom").id, a.id, "gleiche Domain");
  assert.equal(k.firmaAnlegen({ name: "Anders", telefon: "+49 711 123456" }, "Tom").id, a.id, "gleiche Nummer");
  assert.equal(k.firmaAnlegen({ name: "autohaus muster", plz: "70173" }, "Tom").id, a.id, "Name + PLZ");
  const b = k.firmaAnlegen({ name: "Andere Werkstatt", quelle_id: "node/1" }, "Bot", "bot");
  assert.equal(k.firmaAnlegen({ name: "X", quelle_id: "node/1" }, "Bot", "bot").id, b.id, "Quell-ID");
  assert.throws(() => k.firmaAnlegen({ name: "  " }, "Tom"));
  assert.equal(k.firmen().length, 2);
  assert.equal(k.firmen({ q: "Muster" }).length, 1);
  const f = k.firma(a.id)!;
  assert.equal(f.kontakte[0].ergebnis, "Firma angelegt");
});

test("Anruf erfassen: nicht erreicht, Infos mit Einwilligung, Widerspruch sperrt", () => {
  const k = neuerKern();
  const { id } = k.firmaAnlegen({ name: "Werkstatt A", email: "info@a.de" }, "Tom");
  let r = k.anrufErfassen(id, { ergebnis: "nicht_erreicht" }, "Giosuè");
  assert.equal(r.status, "angerufen");
  assert.equal(r.wiedervorlage, "2026-11-04", "2 Werktage später");
  assert.equal(k.heuteAnrufen("2026-11-04").length, 1);
  assert.equal(k.infomailErlaubt(id).ok, false, "ohne Einwilligung keine Info-Mail");
  r = k.anrufErfassen(id, { ergebnis: "infos_mail", einwilligung: true, notiz: "Herr A. möchte Infos" }, "Giosuè");
  assert.equal(r.status, "infos_mail");
  const f = k.firma(id)!;
  assert.equal(f.einwilligung, true);
  assert.match(f.einwilligung_nachweis, /Telefonat am 2026-11-02 durch Giosuè/);
  const ok = k.infomailErlaubt(id);
  assert.equal(ok.ok, true);
  r = k.anrufErfassen(id, { ergebnis: "widerspruch" }, "Giosuè");
  const g = k.firma(id)!;
  assert.equal(g.gesperrt, true);
  assert.equal(g.status, "kein_interesse");
  assert.equal(k.infomailErlaubt(id).ok, false, "gesperrt: keine Mail trotz Einwilligung");
  assert.equal(k.heuteAnrufen("2026-12-01").length, 0, "gesperrte Firmen tauchen nicht mehr auf");
  assert.throws(() => k.anrufErfassen(id, { ergebnis: "quatsch" }, "Tom"));
});

test("Gesperrte Firma wird vom Bot erkannt (Sperrliste)", () => {
  const k = neuerKern();
  const { id } = k.firmaAnlegen({ name: "Gesperrt GmbH", website: "gesperrt.de" }, "Tom");
  k.sperren(id, "Abmeldung", "Tom");
  assert.equal(k.istGesperrt({ name: "Neu", website: "https://www.gesperrt.de" }), true);
  assert.equal(k.istGesperrt({ name: "Ganz neu", website: "frei.de" }), false);
});

test("Rechenbeispiel aus dem Bauplan: 990 € Einrichtung + 199 € monatlich ab 1. Dezember", () => {
  const k = neuerKern();
  const { id } = k.firmaAnlegen({ name: "Kunde GmbH" }, "Tom");
  jetzt = Date.parse("2026-12-01T09:00:00Z");
  const v = k.vertragAnlegen(id, { beginn: "2026-12-01", einmal: "990", monatlich: "199", produkt: "Chat + Termin-Bot", mindestlaufzeit: 12, unterlagen: ALLE }, "Tom");
  assert.equal(v.nummer, "V-2026-001");
  let z = k.zahlungen({ firma_id: id });
  const einr = z.find((x: any) => x.art === "einrichtung");
  assert.equal(einr.betrag_ct, 99000);
  assert.equal(einr.faellig, "2026-12-15");
  assert.equal(z.filter((x: any) => x.art === "monatlich").length, 1, "Dezember angelegt");
  assert.equal(k.firma(id)!.status, "kunde");
  // ein Jahr später: 12 Monatsposten, nichts doppelt
  jetzt = Date.parse("2027-11-20T09:00:00Z");
  k.monatsposten(); k.monatsposten();
  z = k.zahlungen({ firma_id: id });
  const monat = z.filter((x: any) => x.art === "monatlich");
  assert.equal(monat.length, 12);
  const summe = z.reduce((n: number, x: any) => n + x.betrag_ct, 0);
  assert.equal(summe, 337800, "990 + 12 × 199 = 3.378 €");
  // Zahlstatus und Erinnerung
  assert.equal(k.zahlungen({ offen: true }).filter((x: any) => x.zahlstatus === "ueberfaellig").length, 13, "alle 13 Posten sind am 20.11. überfällig (November war am 15. fällig)");
  const erinnern = k.ueberfaelligMelden("2027-11-20");
  assert.ok(erinnern.length >= 11);
  assert.equal(k.ueberfaelligMelden("2027-11-20").length, 0, "nur einmal erinnern");
  k.zahlungBezahlt(einr.id, true, "2026-12-10");
  assert.equal(k.zahlungen({ firma_id: id }).find((x: any) => x.id === einr.id).zahlstatus, "bezahlt");
});

test("Kündigung: Monatsposten nur bis zum Vertragsende", () => {
  const k = neuerKern();
  const { id } = k.firmaAnlegen({ name: "Kurz GmbH" }, "Tom");
  jetzt = Date.parse("2027-01-10T09:00:00Z");
  const v = k.vertragAnlegen(id, { beginn: "2027-01-01", monatlich: "100", unterlagen: ALLE }, "Tom");
  assert.throws(() => k.vertragAendern(v.id, { status: "gekuendigt" }, "Tom"), /Vertragsende/);
  k.vertragAendern(v.id, { status: "gekuendigt", ende: "2027-03-31" }, "Tom");
  jetzt = Date.parse("2027-08-01T09:00:00Z");
  k.monatsposten();
  assert.deepEqual(k.zahlungen({ firma_id: id }).map((z: any) => z.leistungsmonat).sort(), ["2027-01", "2027-02", "2027-03"]);
  assert.equal(k.vertraege({ laufend: true }).length, 0);
  assert.equal(k.vertraege({ laufend: false }).length, 1);
  assert.equal(k.firma(id)!.status, "kunde", "Status bleibt, bis der Vertrag geändert wird");
  k.vertragAendern(v.id, { status: "beendet" }, "Tom");
  assert.equal(k.firma(id)!.status, "beendet");
});

test("Kundenakte: Dokument über 1 MB wird in Teilen gespeichert und vollständig zurückgegeben", () => {
  const k = neuerKern();
  const { id } = k.firmaAnlegen({ name: "Akte GmbH" }, "Tom");
  const daten = new Uint8Array(2_500_000).map((_, i) => i % 251);
  k.dokumentAblegen({ id: "d1", firma_id: id, titel: "Vertrag", typ: "vertrag", name: "vertrag.pdf", mime: "application/pdf" }, daten.buffer);
  const d = k.dokument("d1")!;
  assert.equal(d.meta.groesse, 2_500_000);
  assert.deepEqual(new Uint8Array(d.daten), daten);
  assert.equal(k.firma(id)!.dokumente.length, 1);
  k.dokumentLoeschen("d1");
  assert.equal(k.dokument("d1"), null);
});

test("Bot: Suche reihum, Bewertung mit Schwelle, Impulse einmal pro Woche, Löschfrist", () => {
  jetzt = Date.parse("2026-11-02T09:00:00Z");
  const k = neuerKern();
  k.einstellungenSetzen({ zielbranchen: ["autowerkstatt", "maler"], zielregionen: "Stuttgart, Ulm" as any, schwelle: 70, impulse_pro_tag: 1 });
  const s = [k.naechsteSuche(), k.naechsteSuche(), k.naechsteSuche(), k.naechsteSuche(), k.naechsteSuche()];
  assert.deepEqual(s.map((x) => `${x!.branche}/${x!.region}`), ["autowerkstatt/Stuttgart", "maler/Stuttgart", "autowerkstatt/Ulm", "maler/Ulm", "autowerkstatt/Stuttgart"]);
  const a = k.firmaAnlegen({ name: "Gute Werkstatt", quelle_id: "node/10" }, "Bot", "bot").id;
  const b = k.firmaAnlegen({ name: "Mittel", quelle_id: "node/11" }, "Bot", "bot").id;
  assert.equal(k.zuBewerten(5).length, 2);
  assert.equal(k.bewertungSpeichern(a, { score: 85, begruendung: "Keine Online-Buchung", einstieg: "Hallo", inhaber: "Max Muster" })!.status, "anruf_impuls");
  assert.equal(k.bewertungSpeichern(b, { score: 40, begruendung: "Klein" })!.status, "bewertet");
  assert.equal(k.zuBewerten(5).length, 0);
  assert.equal(k.firma(a)!.ansprechpartner[0].name, "Max Muster");
  let i = k.impulseFuerHeute("2026-11-03");
  assert.equal(i.neu.length, 1);
  assert.equal(k.impulseFuerHeute("2026-11-04").neu.length, 0, "nicht jeden Tag dieselbe Firma");
  assert.equal(k.impulseFuerHeute("2026-11-11").neu.length, 1, "nach einer Woche wieder, wenn noch nicht angerufen");
  // Löschfrist: nie kontaktiert, unter Schwelle, älter als 6 Monate
  jetzt = Date.parse("2027-06-01T09:00:00Z");
  assert.equal(k.aufraeumen(), 1);
  assert.equal(k.firma(b), null);
  assert.ok(k.firma(a), "Anruf-Impulse bleiben");
});

test("Anmeldung: Link nur einmal einlösbar, Sitzung läuft ab, Zähler", () => {
  jetzt = Date.parse("2026-11-02T09:00:00Z");
  const k = neuerKern();
  k.loginMerken("h1", "kifuermeinenbetrieb@gmail.com", jetzt + 20 * 60_000);
  assert.equal(k.loginEinloesen("h1"), "kifuermeinenbetrieb@gmail.com");
  assert.equal(k.loginEinloesen("h1"), null, "zweites Mal nicht");
  k.loginMerken("h2", "x@y.de", jetzt - 1);
  assert.equal(k.loginEinloesen("h2"), null, "abgelaufen");
  k.sitzungAnlegen("s1", "kifuermeinenbetrieb@gmail.com", jetzt + 1000);
  assert.equal(k.sitzung("s1"), "kifuermeinenbetrieb@gmail.com");
  jetzt += 2000;
  assert.equal(k.sitzung("s1"), null);
  assert.equal(k.zaehle("login", 2, 60_000), true);
  assert.equal(k.zaehle("login", 2, 60_000), true);
  assert.equal(k.zaehle("login", 2, 60_000), false);
  jetzt += 61_000;
  assert.equal(k.zaehle("login", 2, 60_000), true);
});

test("Einstellungen: Standardwerte, Listen aus Text, Zahlen begrenzt, unbekannte Schlüssel ignoriert", () => {
  const k = neuerKern();
  assert.equal(k.einstellungen().impulse_an, "kifuermeinenbetrieb@gmail.com");
  const e = k.einstellungenSetzen({ zielregionen: "Ulm\nStuttgart, " as any, schwelle: 5000 as any, bot_aktiv: "false" as any, hack: 1 } as any);
  assert.deepEqual(e.zielregionen, ["Ulm", "Stuttgart"]);
  assert.equal(e.schwelle, 1000);
  assert.equal(e.bot_aktiv, false);
  assert.equal((e as any).hack, undefined);
});

/* ---------- Anpassungen 11/2026 (Liste von Giosuè) ---------- */
test("Produkt mit Laufzeiten → Angebot übernimmt Gebühren, Nachfassen und Ablauf-Hinweis, Annahme → Vertrag mit Frist", () => {
  jetzt = Date.parse("2026-11-02T09:00:00Z");
  const k = neuerKern();
  const pid = k.produktSpeichern({ name: "Chat-Bot", laufzeiten: [{ monate: 0, frist_monate: 1, einmal: "490", monatlich: "249" }, { monate: 12, frist_monate: 3, einmal: "290", monatlich: "199" }] });
  assert.throws(() => k.produktSpeichern({ name: "X", laufzeiten: [{ monate: 12 }, { monate: 12 }] }), /nur einmal/);
  const lz = k.produkte()[0].laufzeiten;
  assert.deepEqual(lz.map((l: any) => [l.name, l.einmal_ct, l.monat_ct, l.kuendigungsfrist]), [["Monatlich kündbar", 49000, 24900, "1 Monat zum Monatsende"], ["12 Monate", 29000, 19900, "3 Monate zum Laufzeitende"]]);
  const { id } = k.firmaAnlegen({ name: "Kunde A", telefon: "0711 1" }, "Giosuè");
  const a = k.angebotAnlegen(id, { produkt_id: pid, laufzeit_id: lz[1].id }, "Giosuè");
  assert.equal(a.nummer, "A-2026-001");
  assert.equal(k.firma(id)!.status, "angebot");
  const auf = k.aufgaben({ firma_id: id });
  assert.deepEqual(auf.map((x: any) => [x.art, x.faellig]), [["nachfassen", "2026-11-05"], ["nachfassen", "2026-11-16"], ["ablauf", "2026-11-29"]]);
  assert.throws(() => k.angebotEntscheiden(a.id, { status: "abgelehnt" }, "Tom"), /Verlustgrund/);
  const r = k.angebotEntscheiden(a.id, { status: "angenommen", beginn: "2026-12-01", unterlagen: { vertrag: true } }, "Tom");
  assert.equal(r.vertrag.status, "unterlagen", "ohne AVV und SEPA noch nicht aktiv");
  const v = k.firma(id)!.vertraege[0];
  assert.equal(v.mindestlaufzeit, 12); assert.equal(v.frist_monate, 3); assert.equal(v.einmal_ct, 29000); assert.equal(v.kuendigungsfrist, "3 Monate zum Laufzeitende");
  assert.equal(k.zahlungen({ firma_id: id }).length, 0, "keine Zahlungen vor Vollständigkeit");
  assert.equal(k.aufgaben({ firma_id: id }).filter((x: any) => x.art === "nachfassen").length, 0, "Nachfassen erledigt");
  k.unterlageSetzen(v.id, "avv", true, "Tom");
  assert.equal(k.unterlageSetzen(v.id, "sepa", true, "Tom").status, "aktiv");
  assert.equal(k.firma(id)!.status, "kunde");
  assert.ok(k.zahlungen({ firma_id: id }).some((z: any) => z.art === "einrichtung" && z.betrag_ct === 29000));
  // Einrichtung (Übergabe an Tom)
  const ein = k.aufgaben({ firma_id: id }).find((x: any) => x.art === "einrichtung");
  assert.equal(ein.zustaendig, "Tom");
  for (const s of ["einrichtung", "test", "golive"]) k.onboardingSetzen(v.id, s, true, "Tom");
  assert.equal(k.firma(id)!.vertraege[0].onboarding_stand, "Live");
  assert.equal(k.aufgaben({ firma_id: id }).length, 0, "Einrichtungs-Aufgabe erledigt");
});

test("Fristen-Wächter: Erinnerung vor dem letzten Kündigungstag, nur einmal; Kündigung → Rückgewinnung", () => {
  jetzt = Date.parse("2026-11-02T09:00:00Z");
  const k = neuerKern();
  const { id } = k.firmaAnlegen({ name: "Langläufer" }, "Tom");
  const v = k.vertragAnlegen(id, { beginn: "2026-01-01", produkt: "Bot", monatlich: "100", mindestlaufzeit: 12, frist_monate: 3, unterlagen: ALLE }, "Tom");
  assert.deepEqual(k.firma(id)!.vertraege[0].fristen, { mindest_ende: "2026-12-31", laufzeit_ende: "2027-12-31", kuendigen_bis: "2027-09-30", verlaengert: true }, "Frist 30.09.2026 ist vorbei → nächste Laufzeit");
  assert.equal(k.fristenPruefen("2027-08-01").length, 0, "60 Tage vorher: noch nicht (Vorlauf 45)");
  const f = k.fristenPruefen("2027-08-20");
  assert.equal(f.length, 1);
  assert.equal(k.fristenPruefen("2027-08-21").length, 0, "nur einmal");
  const a = k.aufgaben({ firma_id: id }).find((x: any) => x.art === "frist");
  assert.equal(a.wichtig, true); assert.match(a.titel, /kündbar bis 30\.09\.2027/);
  k.vertragAendern(v.id, { status: "gekuendigt", ende: "2027-12-31", verlustgrund: "zu_teuer" }, "Tom");
  const rg = k.aufgaben({ firma_id: id }).find((x: any) => x.art === "rueckgewinnung");
  assert.ok(rg && rg.wichtig);
  assert.equal(k.firma(id)!.verlustgrund, "zu_teuer");
});

test("Wiedervorlage: verschieben mit Grund, an Tom übergeben, Überfälliges bleibt sichtbar, Anruf erledigt sie", () => {
  jetzt = Date.parse("2026-11-02T09:00:00Z");
  const k = neuerKern();
  const { id } = k.firmaAnlegen({ name: "Wieder GmbH", telefon: "0711 5" }, "Giosuè");
  k.anrufErfassen(id, { ergebnis: "rueckruf", entscheider: "nein", bedarf: "hoch", zeitrahmen: "sofort" }, "Giosuè");
  let a = k.aufgaben({ firma_id: id })[0];
  assert.equal(a.faellig, "2026-11-03");
  assert.equal(k.firma(id)!.bedarf, "hoch");
  a = k.aufgabeVerschieben(a.id, { faellig: "2026-11-05", grund: "Chef krank", zustaendig: "Tom" }, "Giosuè");
  assert.equal(a.zustaendig, "Tom"); assert.equal(a.verschoben, 1);
  assert.match(k.firma(id)!.kontakte[0].ergebnis, /übergeben an Tom/);
  // nicht erledigt → am nächsten Tag überfällig, aber weiter im Cockpit
  jetzt = Date.parse("2026-11-06T09:00:00Z");
  const c = k.cockpit({ zustaendig: "Tom" });
  assert.equal(c.ueberfaellig.length, 1);
  assert.equal(k.cockpit({ zustaendig: "Giosuè" }).ueberfaellig.length, 0, "Giosuès Ansicht ohne Toms Aufgabe");
  assert.equal(k.heuteAnrufen().length, 1);
  k.anrufErfassen(id, { ergebnis: "termin" }, "Tom");
  assert.equal(k.aufgaben({ firma_id: id }).length, 0);
  assert.throws(() => k.anrufErfassen(id, { ergebnis: "kein_interesse" }, "Tom"), /Verlustgrund/);
});

test("Wichtig: Firmen, Aufgaben stehen oben; Dubletten; Leitfaden je Branche; Wochenbericht", () => {
  jetzt = Date.parse("2026-11-02T09:00:00Z");
  const k = neuerKern();
  const a = k.firmaAnlegen({ name: "Alpha Bau GmbH", ort: "Ulm", plz: "89073", telefon: "0731 12345", branche: "Autowerkstatt" }, "Tom").id;
  const b = k.firmaAnlegen({ name: "Beta", telefon: "0731 2" }, "Tom").id;
  k.wichtigSetzen("firma", a, true);
  assert.equal(k.firmen()[0].id, a);
  k.aufgabeAnlegen(b, { faellig: "2026-11-02" }, "Tom"); const w = k.aufgabeAnlegen(b, { faellig: "2026-11-02", titel: "wichtig" }, "Tom");
  k.wichtigSetzen("aufgabe", w, true);
  assert.equal(k.aufgaben()[0].id, w);
  // Dubletten
  assert.equal(k.dubletten({ name: "Alpha Bau" })[0].id, a);
  assert.equal(k.dubletten({ name: "Gamma", telefon: "+49 731 12345" })[0].sicher, true);
  assert.equal(k.dubletten({ name: "Ganz anders" }).length, 0);
  // Leitfaden
  assert.equal(k.leitfadenFuer("Autowerkstatt").name, "Allgemein");
  k.leitfadenSpeichern({ name: "Kfz", stichworte: "werkstatt, autohaus", einstieg: "Hallo Werkstatt" });
  assert.equal(k.leitfadenFuer("Autowerkstatt").name, "Kfz");
  assert.equal(k.firma(a)!.leitfaden.einstieg, "Hallo Werkstatt");
  // Wochenbericht
  k.anrufErfassen(a, { ergebnis: "termin" }, "Tom");
  k.anrufErfassen(b, { ergebnis: "nicht_erreicht" }, "Giosuè");
  k.vertragAnlegen(a, { beginn: "2026-11-01", monatlich: "199", unterlagen: ALLE }, "Tom");
  const wb = k.wochenbericht("2026-11-02");
  assert.deepEqual([wb.anrufe, wb.erreicht, wb.termine, wb.abschluesse, wb.mrr_ct], [2, 1, 1, 1, 19900]);
  assert.equal(k.wochenberichte(3).length, 3);
});
