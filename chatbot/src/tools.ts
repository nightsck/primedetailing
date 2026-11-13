// Werkzeuge, die das Modell aufrufen darf. Alle Preise kommen ausschließlich
// aus data/preise.json. Das Modell erfindet keine Beträge, es fragt sie hier ab.
import { allePakete, preise, config, type Paket } from "./config.ts";
import { jeKunde } from "./kontext.ts";

/** Betrag für die Preiskarte: glatte Beträge ohne Nachkommastellen („290 €“ statt „290,00 €“). */
export const fmtEuroKurz = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("de-DE") + " €" : fmtEuro(n);

export const fmtEuro = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const norm = (s: string) => s.toLowerCase().replace(/ß/g, "ss").normalize("NFKD").replace(/[^a-z0-9]/g, "");

export function findePaket(idOderName: string): Paket | undefined {
  const q = norm(idOderName || "");
  return (
    allePakete.find((p) => norm(p.id) === q) ||
    allePakete.find((p) => norm(p.name) === q) ||
    allePakete.find((p) => norm(p.name).includes(q) || q.includes(norm(p.name)))
  );
}

const kategorieVon = jeKunde((l) => new Map(l.preise.kategorien.flatMap((k) => k.pakete.map((p) => [p.id, k.name] as const))));
/** gilt_fuer: Paket-IDs oder Kategorienamen. Fehlt es, gilt der Aufschlag für alle Pakete. */
export function aufschlagGilt(p: Paket): boolean {
  const g = preise.aufschlaege?.gilt_fuer;
  if (!preise.aufschlaege) return false;
  if (!g || !g.length) return true;
  return g.some((x) => norm(x) === norm(p.id) || norm(x) === norm(kategorieVon().get(p.id) || ""));
}

function paketInfo(p: Paket) {
  return {
    id: p.id,
    name: p.name,
    preis: p.preis === null ? "auf Anfrage" : (p.ab ? "ab " : "") + fmtEuro(p.preis),
    ...(p.beschreibung ? { beschreibung: p.beschreibung } : {}),
    leistungen: p.leistungen,
    empfohlen: !!p.empfohlen,
    ...(preise.aufschlaege ? { aufschlag_je: aufschlagGilt(p) ? preise.aufschlaege.bezeichnung : "keiner" } : {}),
  };
}

/** Werkzeug-Beschreibungen für die KI, je Kunde (Kategorien und Feldnamen kommen aus seiner Preisliste). */
export const toolDefinitions = jeKunde(() => [
  {
    name: "liste_pakete",
    description:
      "Listet Pakete mit Preis und Leistungen. Ohne Kategorie: alle Kategorien. Immer nutzen, bevor du Pakete oder Preise nennst.",
    input_schema: {
      type: "object",
      properties: {
        kategorie: { type: "string", description: "Name einer Kategorie aus der Preisliste: " + preise.kategorien.map((k) => k.name).join(", ") },
      },
    },
  },
  {
    name: "get_preis",
    description:
      "Liefert den exakten Preis eines Pakets (optional mit Extras und Variante" + (preise.aufschlaege ? ", z. B. " + preise.aufschlaege.bezeichnung : "") + ") inkl. Summe. Einzige erlaubte Quelle für Beträge.",
    input_schema: {
      type: "object",
      properties: {
        paket: { type: "string", description: "Paket-ID oder Name, z. B. innen-comfort" },
        variante: { type: "string", description: preise.aufschlaege ? `${preise.aufschlaege.bezeichnung}: ${Object.keys(preise.aufschlaege.optionen).join(", ")}` : "nicht verwendet" },
        extras: { type: "array", items: { type: "string" }, description: "z. B. scheibenversiegelung, felgenversiegelung" },
      },
      required: ["paket"],
    },
  },
  {
    name: "anfrage_vorbereiten",
    description:
      "Zeigt dem Kunden ein vorausgefülltes Anfrageformular, das er selbst prüft und mit einem Klick absendet. Nutze es, wenn der Kunde einen Termin oder ein Angebot möchte. Du sendest damit NICHTS ab und sagst keinen Termin zu.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" }, kontakt: { type: "string", description: "Telefon oder E-Mail" },
        fahrzeug: { type: "string", description: config.formular?.objektLabel || "Fahrzeug" }, paket: { type: "string" },
        wunschtermin: { type: "string" }, notiz: { type: "string" },
      },
    },
  },
  {
    name: "an_mensch_uebergeben",
    description:
      "Übergibt an das Team. Pflicht bei: Thema nicht in der Wissensbasis, Beschwerde, Rabatt-/Firmenangebot, Kunde will einen Menschen, unklare Sonderfälle.",
    input_schema: {
      type: "object",
      properties: {
        grund: { type: "string", enum: ["unbekanntes_thema", "beschwerde", "rabatt_oder_firmenangebot", "kunde_will_mensch", "sonderfall"] },
        zusammenfassung: { type: "string", description: "1–2 Sätze, worum es geht" },
      },
      required: ["grund", "zusammenfassung"],
    },
  },
]);

export type ToolResult = { result: unknown; betraege: number[]; ui?: Record<string, unknown> };

export function runTool(name: string, input: any): ToolResult {
  if (name === "liste_pakete") {
    const k = norm(input?.kategorie || "");
    const kats = preise.kategorien.filter((c) => !k || norm(c.name).includes(k) || k.includes(norm(c.name).slice(0, 5)));
    const list = (kats.length ? kats : preise.kategorien).map((c) => ({ kategorie: c.name, pakete: c.pakete.map(paketInfo) }));
    const betraege = list.flatMap((c) => c.pakete).map((p) => findePaket(p.id)!.preis).filter((x): x is number => x !== null);
    // Übersicht als Karte: Name und Preis nebeneinander, damit man sie vergleichen kann
    const zeilen = (kats.length ? kats : preise.kategorien).flatMap((c) => c.pakete.map((p) => ({
      name: p.name, preis: p.preis === null ? "auf Anfrage" : (p.ab ? "ab " : "") + fmtEuroKurz(p.preis), empfohlen: !!p.empfohlen,
    }))).slice(0, 8);
    return { result: list, betraege, ui: zeilen.length > 1 ? { typ: "preisliste", titel: kats.length === 1 ? kats[0].name : "Unsere Leistungen", zeilen } : undefined };
  }

  if (name === "get_preis") {
    const p = findePaket(input?.paket);
    if (!p) return { result: { fehler: "Paket nicht gefunden. Nutze liste_pakete." }, betraege: [] };
    if (p.preis === null)
      return { result: { paket: p.name, preis: "auf Anfrage", hinweis: "Preis nur nach Rücksprache. Biete eine Anfrage an." }, betraege: [] };
    const extras = (input?.extras || []).map((e: string) => findePaket(e)).filter(Boolean) as Paket[];
    const hinweise = [] as string[];
    let aufschlag = 0;
    if (preise.aufschlaege && !aufschlagGilt(p) && input?.variante) {
      hinweise.push(`Für ${p.name} gibt es keinen Aufschlag je ${preise.aufschlaege.bezeichnung}.`);
    } else if (input?.variante && preise.aufschlaege) {
      const key = Object.keys(preise.aufschlaege.optionen).find((k) => norm(k) === norm(input.variante) || norm(input.variante).includes(norm(k)));
      if (preise.aufschlaege.offen || key === undefined)
        hinweise.push(`Aufschläge je ${preise.aufschlaege.bezeichnung} sind noch nicht festgelegt – das klärt das Team persönlich. Keinen Aufschlag nennen.`);
      else if (preise.aufschlaege.optionen[key] > 0) { aufschlag = preise.aufschlaege.optionen[key]; hinweise.push(`Aufschlag ${key}: ${fmtEuro(aufschlag)} (in der Summe enthalten).`); }
    }
    const summe = Math.round((p.preis + aufschlag + extras.reduce((s, e) => s + (e.preis || 0), 0)) * 100) / 100;
    const ab = p.ab || extras.some((e) => e.ab);
    if (ab) hinweise.push("„ab“-Preis: endgültiger Preis hängt vom Einzelfall ab und wird vor dem Termin bestätigt.");
    if ((preise as any).zuschlaege) hinweise.push("Zuschläge: " + Object.entries((preise as any).zuschlaege).map(([k, v]) => `${k}: ${v}`).join("; "));
    return {
      // Die Karte zeigt den Preis sichtbar an, statt ihn im Fließtext zu verstecken.
      // Der Text der KI steht darüber; die Zahlen kommen aus dieser Karte.
      ui: {
        typ: "preis",
        titel: p.name,
        preis: fmtEuroKurz(summe),
        ab,
        leistungen: p.leistungen.slice(0, 5),
        hinweis: ab ? "Endgültiger Preis nach Besichtigung – wir bestätigen ihn vor dem Termin." : "",
        ...(extras.length || aufschlag ? { grundpreis: (p.ab ? "ab " : "") + fmtEuroKurz(p.preis), zusatz: [...extras.map((e) => ({ name: e.name, preis: fmtEuroKurz(e.preis!) })), ...(aufschlag ? [{ name: String(input.variante), preis: fmtEuroKurz(aufschlag) }] : [])] } : {}),
      },
      result: {
        paket: p.name, grundpreis: (p.ab ? "ab " : "") + fmtEuro(p.preis),
        extras: extras.map((e) => ({ name: e.name, preis: (e.ab ? "ab " : "") + fmtEuro(e.preis!) })),
        summe: extras.length || aufschlag ? (ab ? "ab " : "") + fmtEuro(summe) : undefined,
        ...(p.beschreibung ? { beschreibung: p.beschreibung } : {}),
        leistungen: p.leistungen, hinweise,
      },
      betraege: [p.preis, summe, aufschlag, ...extras.map((e) => e.preis!)].filter((x) => x > 0),
    };
  }

  if (name === "anfrage_vorbereiten") {
    const felder = {
      name: input?.name || "", kontakt: input?.kontakt || "", fahrzeug: input?.fahrzeug || "",
      paket: input?.paket || "", wunschtermin: input?.wunschtermin || "", notiz: input?.notiz || "",
    };
    return {
      result: { status: "Formular wird dem Kunden angezeigt. Er prüft und sendet selbst. Sag kurz, dass er die Angaben prüfen und auf „Anfrage senden“ klicken soll." },
      betraege: [],
      ui: { typ: "anfrage_formular", felder },
    };
  }

  if (name === "an_mensch_uebergeben") {
    console.log(`[uebergabe] ${input?.grund}: ${input?.zusammenfassung}`);
    return {
      result: { status: "Übergabe angezeigt.", kontakt: { telefon: config.betrieb.telefon, email: config.betrieb.email } },
      betraege: [],
      ui: { typ: "uebergabe", grund: input?.grund, zusammenfassung: input?.zusammenfassung },
    };
  }

  return { result: { fehler: "Unbekanntes Werkzeug" }, betraege: [] };
}
