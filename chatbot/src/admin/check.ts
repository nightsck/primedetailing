// Einrichtungs-Check: Ist bei diesem Kunden alles so eingestellt, dass die Bots
// live gehen können? Jeder Punkt hat eine Farbe und sagt, wie man ihn behebt.
//   rot  = so nicht veröffentlichen (wird beim Veröffentlichen geprüft)
//   gelb = läuft, sollte man sich aber ansehen
//   gruen = passt
import type { Kunde } from "../kunde/schema.ts";
import { MODULE, MODUL_NAMEN, NOCH_NICHT } from "../kunde/schema.ts";
import { betriebsStatus, terminBetriebVon } from "../kunde/umwandeln.ts";
import { mailAktiv } from "../mail.ts";
import { env } from "../config.ts";

export type Punkt = { farbe: "gruen" | "gelb" | "rot"; titel: string; hilfe: string; reiter?: string };
const wert = (c: any, k: string): string => String(c?.env?.[k] ?? process.env[k] ?? "").trim();

/** Was am Server selbst eingerichtet ist (gilt für alle Kunden). */
export function serverStand(c: any) {
  return {
    ki: env.provider === "bedrock" || !!(env.anthropicKey || wert(c, "ANTHROPIC_API_KEY")),
    mail: mailAktiv(c),
    sitzung: !!(process.env.SESSION_SECRET || wert(c, "SESSION_SECRET")),
    kalender: !!wert(c, "GOOGLE_SA_JSON"),
    pausiert: env.killSwitch || wert(c, "KILL_SWITCH") === "1",
  };
}

export function pruefeEinrichtung(c: any, k: Kunde, stand: { live: boolean; offen: boolean }): Punkt[] {
  const p: Punkt[] = [], s = serverStand(c);
  const dazu = (ok: boolean, sonst: "gelb" | "rot", titel: string, hilfe: string, reiter?: string) => p.push({ farbe: ok ? "gruen" : sonst, titel, hilfe: ok ? "" : hilfe, reiter });
  const aktiv = MODULE.filter((m) => k.module[m].aktiv);

  // Server
  dazu(s.ki, "rot", "KI ist angebunden", "Am Server fehlt der Schlüssel ANTHROPIC_API_KEY. Ohne ihn antworten die Bots nur mit festen Texten. Siehe SECRETS.md.");
  dazu(s.mail, "rot", "Mailversand ist eingerichtet", "Am Server fehlen BREVO_API_KEY und MAIL_ABSENDER. Ohne sie bekommt der Betrieb keine Mails; Anfragen stehen dann nur in der Chef-Übersicht. Siehe SECRETS.md.");
  if (s.pausiert) dazu(false, "rot", "Notbremse ist aus", "KILL_SWITCH steht auf 1: Alle Bots auf diesem Server sind pausiert.");

  // Kunde allgemein
  dazu(aktiv.length > 0, "rot", "Mindestens ein Modul ist eingeschaltet", "Unter „Module“ mindestens ein Modul einschalten.", "module");
  dazu(!!k.rechtliches.datenschutzUrl, "rot", "Link zur Datenschutzerklärung ist eingetragen", "Unter „Recht & Technik“ den Link zur Datenschutzerklärung des Kunden eintragen. Dort müssen die Bots erwähnt sein (Vorlage in EINRICHTUNG-NEUER-KUNDE.md).", "recht");
  dazu(!!k.stammdaten.telefon, "gelb", "Telefonnummer ist eingetragen", "Ohne Telefonnummer kann der Bot Besucher bei der Übergabe nur per E-Mail an den Betrieb verweisen.", "stammdaten");
  const st = betriebsStatus(k);
  dazu(st.an, "rot", "Kunde ist in Betrieb", st.an ? "" : `Die Bots sind aus (${st.grund}). Status oder Testphase unter „Stammdaten“ ändern.`, "stammdaten");
  if (k.status === "test" && !k.testBis) dazu(false, "gelb", "Testphase hat ein Enddatum", "Ohne Enddatum läuft der Test unbegrenzt. Unter „Stammdaten“ ein Datum eintragen.", "stammdaten");

  // Kunden-Chat
  if (k.module.kundenChat.aktiv) {
    dazu(!!k.stammdaten.website || k.technik.erlaubteWebsites.length > 0, "rot", "Kunden-Chat: Website ist eingetragen", "Das Chat-Fenster läuft nur auf eingetragenen Websites. Unter „Stammdaten“ die Website eintragen.", "stammdaten");
    dazu(k.wissen.leistungen.length > 0, "rot", "Kunden-Chat: Leistungen sind eingetragen", "Unter „Wissen“ mindestens eine Leistung eintragen, sonst weiß der Bot nicht, was der Betrieb anbietet.", "wissen");
    dazu(k.wissen.leistungen.some((l) => l.preis !== null), "gelb", "Kunden-Chat: Preise sind eingetragen", "Es steht bei keiner Leistung ein Preis. Der Bot sagt dann überall „auf Anfrage“. Wenn das gewollt ist: so lassen.", "wissen");
    dazu(k.wissen.faq.length >= 3, "gelb", "Kunden-Chat: mindestens 3 häufige Fragen", "Je mehr echte Fragen mit Antwort unter „Wissen“ stehen, desto seltener muss der Bot an das Team verweisen.", "wissen");
    dazu(!!k.stammdaten.oeffnungszeiten, "gelb", "Kunden-Chat: Öffnungszeiten sind eingetragen", "Eine der häufigsten Fragen. Unter „Stammdaten“ eintragen.", "stammdaten");
  }
  // Bewerber-Chat
  if (k.module.bewerberChat.aktiv) {
    const b = k.module.bewerberChat;
    dazu(b.stellen.length > 0 || b.initiativ, "rot", "Bewerber-Chat: mindestens eine Stelle", "Unter „Module → Bewerber-Chat“ eine Stelle anlegen oder die Initiativbewerbung einschalten.", "module");
    dazu(!!b.bietet, "gelb", "Bewerber-Chat: „Das bieten wir“ ist ausgefüllt", "Bewerber fragen danach. Der Bot antwortet nur mit dem, was hier steht.", "module");
    dazu(!!(b.arbeitszeiten || k.stammdaten.oeffnungszeiten), "gelb", "Bewerber-Chat: Arbeitszeiten sind eingetragen", "Die häufigste Frage von Bewerbern.", "module");
    dazu(b.stellen.every((x) => x.text.length > 20), "gelb", "Bewerber-Chat: jede Stelle hat eine Beschreibung", "Zwei, drei Sätze pro Stelle reichen: Aufgaben und was man mitbringen sollte.", "module");
  }
  // Termin-Bot
  if (k.module.terminBot.aktiv) {
    const t = k.module.terminBot;
    dazu(s.kalender, "rot", "Termin-Bot: Google-Dienstkonto ist am Server hinterlegt", "Am Server fehlt GOOGLE_SA_JSON. Ohne Kalender kann niemand buchen. Siehe SECRETS.md.");
    dazu(!!t.kalenderId, "rot", "Termin-Bot: Kalender-ID ist eingetragen", "Unter „Module → Termin-Bot“ die Kalender-ID des Kunden eintragen und mit „Kalender prüfen“ testen.", "module");
    dazu(t.termine.length > 0, "rot", "Termin-Bot: mindestens eine Terminart", "Unter „Module → Termin-Bot“ eine Terminart anlegen (z. B. Besichtigung, 45 Minuten).", "module");
    dazu(!!terminBetriebVon(k) || !t.termine.length, "rot", "Termin-Bot: an mindestens einem Wochentag sind Termine möglich", "Unter „Module → Termin-Bot“ die Zeiten je Wochentag eintragen, z. B. 8-12, 13-17.", "module");
    dazu(!t.termine.some((x) => x.ort === "kunde") || t.fahrtMin > 0, "gelb", "Termin-Bot: Fahrzeit für Termine beim Kunden", "Es gibt Termine vor Ort, aber 0 Minuten Fahrzeit. Dann liegen Termine direkt hintereinander.", "module");
  }
  // Anfrage-Chat
  if (k.module.anfrageChat.aktiv) {
    const a = k.module.anfrageChat;
    dazu(a.kategorien.length > 0, "gelb", "Anfrage-Chat: Anliegen zum Antippen", "Ohne Kategorien gibt es nur „Allgemeine Anfrage“. Unter „Module → Anfrage-Chat“ eintragen.", "module");
    dazu(a.sicherheitsregeln.length > 0, "gelb", "Anfrage-Chat: Sicherheitsregeln", "Es gibt keine feste Regel für Notfälle (z. B. Brandgeruch, Wasser tritt aus). Wenn im Betrieb Gefahr entstehen kann: unter „Module → Anfrage-Chat“ eintragen.", "module");
    dazu(!!k.stammdaten.telefon, "rot", "Anfrage-Chat: Telefonnummer für Notfälle", "Bei einem Notfall verweist die Seite auf die Telefonnummer. Unter „Stammdaten“ eintragen.", "stammdaten");
  }
  // Veröffentlichung
  if (!stand.live) dazu(false, "gelb", "Kunde ist veröffentlicht", "Noch nicht live. Erst testen (Reiter „Testen“), dann oben auf „Veröffentlichen“.");
  else if (stand.offen) dazu(false, "gelb", "Alle Änderungen sind veröffentlicht", "Es gibt gespeicherte Änderungen, die noch nicht live sind. Oben auf „Veröffentlichen“ klicken.");
  for (const m of NOCH_NICHT) if (k.module[m].aktiv) dazu(false, "rot", `${MODUL_NAMEN[m]} ist verfügbar`, "Dieses Modul gibt es für Kunden noch nicht.", "module");
  return p;
}

export const ampel = (punkte: Punkt[]): "gruen" | "gelb" | "rot" => (punkte.some((x) => x.farbe === "rot") ? "rot" : punkte.some((x) => x.farbe === "gelb") ? "gelb" : "gruen");
