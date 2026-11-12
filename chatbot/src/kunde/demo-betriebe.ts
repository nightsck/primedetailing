// Beispielbetriebe für Vorführungen: je Branchen-Vorlage ein erfundener Betrieb.
//
// Im Admin-Panel legt „Branchen-Demos anlegen“ sie als ganz normale Kunden an
// (Kunden-ID „demo-<branche>“). Giosuè zeigt im Gespräch die passende Branche:
//   /demos                        Übersicht aller Beispielbetriebe
//   /k/demo-maler/                Kunden-Chat des Beispiel-Malers
//   /k/demo-maler/bewerben        Bewerber-Chat
//   /k/demo-maler/verwalten       Kunden-Zugang (Anmeldung mit einer Admin-Adresse)
//
// Alles ist erkennbar erfunden („Muster“, Musterstadt). Preise stehen nur bei
// Branchen, in denen Preislisten üblich sind – so sieht man, dass der Bot Preise
// nennt, wenn sie eingetragen sind, und sonst an das Team verweist.
import { VORLAGEN, ausVorlage } from "./vorlagen.ts";
import { pruefeKunde, type Kunde } from "./schema.ts";

type Demo = { firma: string; bot: string; farbe: string; preise?: Record<string, [preis: number, ab?: boolean]> };

export const DEMO_BETRIEBE: Record<string, Demo> = {
  handwerk: { firma: "Muster Handwerk", bot: "Max", farbe: "#1f3a5f" },
  maler: { firma: "Malerbetrieb Muster", bot: "Lena", farbe: "#2f6f5e", preise: { "Räume streichen": [290, true], "Tapezieren": [390, true] } },
  elektro: { firma: "Elektro Muster", bot: "Paul", farbe: "#1d4e89", preise: { "E-Check": [149, true], "Wallbox": [890, true] } },
  fahrzeugpflege: { firma: "Muster Fahrzeugpflege", bot: "Mia", farbe: "#23395b", preise: { "Innenreinigung": [79, true], "Außenwäsche von Hand": [49, true], "Politur": [299, true] } },
  autohaus: { firma: "Autohaus Muster", bot: "Jonas", farbe: "#263238", preise: { "HU/AU": [149], "Reifenwechsel und Einlagerung": [39, true] } },
  gastro: { firma: "Gasthaus Muster", bot: "Anna", farbe: "#6d2e2e" },
  friseur: { firma: "Salon Muster", bot: "Emma", farbe: "#5b3a6b", preise: { "Waschen, Schneiden, Föhnen": [49, true], "Haarschnitt": [29], "Kinderhaarschnitt": [18] } },
  arztpraxis: { firma: "Praxis Dr. Muster", bot: "Clara", farbe: "#1f6f8b" },
  makler: { firma: "Muster Immobilien", bot: "Felix", farbe: "#2c3e50" },
  shk: { firma: "Muster Sanitär & Heizung", bot: "Ben", farbe: "#17557a", preise: { "Heizungswartung": [149, true] } },
  dachdecker: { firma: "Dachdeckerei Muster", bot: "Lukas", farbe: "#7a2e2e" },
  gartenbau: { firma: "Muster Gartenbau", bot: "Hanna", farbe: "#2e6b3a" },
  reinigung: { firma: "Muster Gebäudereinigung", bot: "Nina", farbe: "#1f6a7a" },
  kosmetik: { firma: "Kosmetikstudio Muster", bot: "Sophie", farbe: "#8a4a66", preise: { "Gesichtsbehandlung": [69, true], "Maniküre": [35], "Kosmetische Fußpflege": [39] } },
  physio: { firma: "Physiotherapie Muster", bot: "Marie", farbe: "#256d6d" },
  steuerberater: { firma: "Steuerkanzlei Muster", bot: "David", farbe: "#2b3a55" },
  schreiner: { firma: "Schreinerei Muster", bot: "Jakob", farbe: "#6b4a2b" },
  kfzwerkstatt: { firma: "Kfz-Werkstatt Muster", bot: "Tim", farbe: "#30363d", preise: { "Ölwechsel": [89, true], "HU und AU": [149], "Reifenwechsel und Einlagerung": [35, true] } },
  zahnarzt: { firma: "Zahnarztpraxis Dr. Muster", bot: "Laura", farbe: "#1f7a8c" },
  hotel: { firma: "Hotel Muster", bot: "Julia", farbe: "#4a3728", preise: { "Einzelzimmer": [79, true], "Doppelzimmer": [109, true], "Frühstück": [14] } },
  einzelhandel: { firma: "Modehaus Muster", bot: "Lisa", farbe: "#5a2d4f" },
  fahrschule: { firma: "Fahrschule Muster", bot: "Noah", farbe: "#b3541e" },
};

export const istDemo = (id: string) => id.startsWith("demo-");
export const demoId = (branche: string) => `demo-${branche}`;

/**
 * Baut den Beispielbetrieb einer Branche.
 * @param kontakt  Adresse, an die Anfragen und Bewerbungen aus der Demo gehen (eine Admin-Adresse)
 * @param zugang   Wer sich im Kunden-Zugang der Demo anmelden darf (die Admin-Adressen)
 *
 * Als Website ist unsere eigene Seite eingetragen. Damit darf das Chat-Fenster jeder Demo auch
 * dort eingebaut werden (auf diesem Server selbst läuft es ohnehin immer).
 */
export const DEMO_WEBSITE = "https://xn--ki-fr-meinen-betrieb-sec.de"; // ki-für-meinen-betrieb.de
export function demoKunde(branche: string, o: { kontakt: string; zugang: string[]; datenschutzUrl: string }): Kunde {
  const d = DEMO_BETRIEBE[branche];
  if (!d || !VORLAGEN[branche]) throw new Error(`Für die Branche „${branche}“ gibt es keinen Beispielbetrieb.`);
  const roh = ausVorlage(branche, {
    id: demoId(branche), status: "aktiv", paket: "komplett",
    notiz: "Automatisch angelegter Beispielbetrieb für Vorführungen. Alle Angaben sind erfunden. Anfragen und Bewerbungen aus der Demo gehen an die Kontakt-Adresse.",
    stammdaten: { firmenname: d.firma, strasse: "Musterstraße 1", plz: "78000", ort: "Musterstadt", telefon: "07000 123456", email: o.kontakt, website: DEMO_WEBSITE, einsatzgebiet: "Musterstadt und Umgebung" },
    aussehen: { botName: d.bot, primaerfarbe: d.farbe },
    module: { kundenChat: { aktiv: true }, bewerberChat: { aktiv: true } },
    rechtliches: { datenschutzUrl: o.datenschutzUrl },
    zugang: { aktiv: true, adressen: o.zugang },
    // Vorführungen brauchen wenig; so kann niemand über die Demo Kosten treiben
    technik: { tagesbudget: 150, monatsbudget: 1500 },
  } as any);
  for (const l of roh.wissen.leistungen) {
    const p = d.preise?.[l.name];
    if (p) { l.preis = p[0]; l.ab = !!p[1]; }
  }
  const r = pruefeKunde(roh);
  if (!r.ok) throw new Error(`Beispielbetrieb ${branche} ist ungültig: ${JSON.stringify(r.fehler)}`);
  return r.kunde;
}
