// Gesetzliche Feiertage in Deutschland – damit der Bot an Feiertagen keine Termine vergibt.
//
// Der Chat antwortet an Feiertagen ganz normal weiter; nur buchen kann man nicht, und der
// Chat-Knopf sagt, dass gerade niemand da ist. Das ist die richtige Richtung: Lieber eine
// Anfrage aufnehmen, die am nächsten Werktag bearbeitet wird, als einen Termin bestätigen,
// an dem der Betrieb geschlossen hat.
//
// Welche Tage gelten, hängt vom Bundesland ab (Fronleichnam gilt in Baden-Württemberg,
// in Niedersachsen nicht). Ohne Bundesland gelten nur die bundesweiten Feiertage.

export const LAENDER = {
  bw: "Baden-Württemberg", by: "Bayern", be: "Berlin", bb: "Brandenburg", hb: "Bremen",
  hh: "Hamburg", he: "Hessen", mv: "Mecklenburg-Vorpommern", ni: "Niedersachsen", nw: "Nordrhein-Westfalen",
  rp: "Rheinland-Pfalz", sl: "Saarland", sn: "Sachsen", st: "Sachsen-Anhalt", sh: "Schleswig-Holstein", th: "Thüringen",
} as const;
export type Land = keyof typeof LAENDER;

const tag = (j: number, m: number, t: number) => new Date(Date.UTC(j, m - 1, t));
const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const schluessel = (d: Date) => d.toISOString().slice(0, 10);

/** Ostersonntag nach der Gaußschen Osterformel (gregorianischer Kalender). */
export function ostern(jahr: number): Date {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), t = ((h + l - 7 * m + 114) % 31) + 1;
  return tag(jahr, monat, t);
}

/** Mittwoch vor dem 23. November (Buß- und Bettag, nur Sachsen). */
function bussUndBettag(jahr: number): Date {
  const d = tag(jahr, 11, 22);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** Alle gesetzlichen Feiertage eines Jahres: Datum (JJJJ-MM-TT) → Name. */
export function feiertage(jahr: number, land?: Land | ""): Map<string, string> {
  const o = ostern(jahr), m = new Map<string, string>();
  const setze = (d: Date, name: string) => m.set(schluessel(d), name);
  // Bundesweit
  setze(tag(jahr, 1, 1), "Neujahr");
  setze(plus(o, -2), "Karfreitag");
  setze(plus(o, 1), "Ostermontag");
  setze(tag(jahr, 5, 1), "Tag der Arbeit");
  setze(plus(o, 39), "Christi Himmelfahrt");
  setze(plus(o, 50), "Pfingstmontag");
  setze(tag(jahr, 10, 3), "Tag der Deutschen Einheit");
  setze(tag(jahr, 12, 25), "1. Weihnachtsfeiertag");
  setze(tag(jahr, 12, 26), "2. Weihnachtsfeiertag");
  if (!land) return m;

  const gilt = (laender: Land[]) => laender.includes(land);
  if (gilt(["bw", "by", "st"])) setze(tag(jahr, 1, 6), "Heilige Drei Könige");
  if (gilt(["be", "mv"])) setze(tag(jahr, 3, 8), "Internationaler Frauentag");
  if (gilt(["bb"])) { setze(o, "Ostersonntag"); setze(plus(o, 49), "Pfingstsonntag"); }
  if (gilt(["bw", "by", "he", "nw", "rp", "sl"])) setze(plus(o, 60), "Fronleichnam");
  if (gilt(["sl"])) setze(tag(jahr, 8, 15), "Mariä Himmelfahrt");
  if (gilt(["th"])) setze(tag(jahr, 9, 20), "Weltkindertag");
  if (gilt(["bb", "hb", "hh", "mv", "ni", "sh", "sn", "st", "th"])) setze(tag(jahr, 10, 31), "Reformationstag");
  if (gilt(["bw", "by", "nw", "rp", "sl"])) setze(tag(jahr, 11, 1), "Allerheiligen");
  if (gilt(["sn"])) setze(bussUndBettag(jahr), "Buß- und Bettag");
  return m;
}

const gemerkt = new Map<string, Map<string, string>>();
/** Ist dieser Tag ein Feiertag? Gibt den Namen zurück oder null. Datum als JJJJ-MM-TT. */
export function feiertagAm(datum: string, land?: Land | ""): string | null {
  const jahr = Number(datum.slice(0, 4));
  if (!Number.isInteger(jahr) || jahr < 1970 || jahr > 2200) return null;
  const k = `${jahr}|${land || ""}`;
  let tage = gemerkt.get(k);
  if (!tage) { tage = feiertage(jahr, land); if (gemerkt.size > 60) gemerkt.clear(); gemerkt.set(k, tage); }
  return tage.get(datum) || null;
}

/** Die nächsten Feiertage ab heute, für das Chat-Fenster (damit der Knopf sie kennt). */
export function kommendeFeiertage(abDatum: string, land: Land | "" | undefined, anzahl = 12): { datum: string; name: string }[] {
  const jahr = Number(abDatum.slice(0, 4));
  if (!Number.isInteger(jahr)) return [];
  const alle = [...feiertage(jahr, land), ...feiertage(jahr + 1, land)]
    .map(([datum, name]) => ({ datum, name }))
    .filter((f) => f.datum >= abDatum)
    .sort((a, b) => a.datum.localeCompare(b.datum));
  return alle.slice(0, anzahl);
}
