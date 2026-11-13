// Öffnungszeiten aus dem Freitext der Stammdaten lesen („Mo–Fr 7–16 Uhr, Sa 9–12 Uhr“).
//
// Damit weiß das Chat-Fenster, ob der Betrieb gerade besetzt ist, und kann den Knopf
// anpassen: tagsüber „Wir antworten sofort“, abends „Wir sind gerade nicht da –
// schreiben Sie trotzdem“. Jemand, der abends auf der Seite landet, geht sonst wieder weg.
//
// Grundsatz: Im Zweifel lieber nichts sagen. Nur wenn die Zeile eindeutig zu lesen ist,
// gibt es einen Hinweis – eine falsche Angabe wäre schlimmer als gar keine.

/** Zeiten je Wochentag, Montag = 0. Jeweils Minuten seit Mitternacht. */
export type Zeiten = { tag: number; von: number; bis: number }[];

const TAGE: Record<string, number> = {
  mo: 0, di: 1, mi: 2, do: 3, fr: 4, sa: 5, so: 6,
  montag: 0, dienstag: 1, mittwoch: 2, donnerstag: 3, freitag: 4, samstag: 5, sonntag: 6,
};
const tagNr = (s: string) => {
  const k = s.toLowerCase().replace(/[.\s]/g, "");
  return TAGE[k] ?? TAGE[k.slice(0, 2)] ?? null;
};
const minuten = (std: string, min?: string) => Number(std) * 60 + Number(min || 0);

/**
 * Liest die Zeile. Gibt null zurück, wenn sie nicht eindeutig ist – dann zeigt
 * das Chat-Fenster keinen Hinweis zur Erreichbarkeit.
 */
export function leseZeiten(text: string): Zeiten | null {
  const roh = String(text || "").trim();
  if (!roh || roh.length > 300) return null;
  // Formulierungen, die keine festen Zeiten sind
  if (/nach absprache|nach vereinbarung|rund um die uhr|24\s*\/\s*7|jederzeit|termin/i.test(roh)) return null;
  const zeiten: Zeiten = [];
  let gefunden = 0, unklar = 0;
  for (const teil of roh.split(/[,;]|\s+und\s+/)) {
    const t = teil.trim();
    if (!t) continue;
    // „Mo–Fr 7–16 Uhr“ oder „Sa 9:30–14 Uhr“ oder „Mo, Mi 8–12“
    const m = /^([A-Za-zäöü.]{2,10})(?:\s*[–\-\/bis]+\s*([A-Za-zäöü.]{2,10}))?\s+(\d{1,2})(?::(\d{2}))?\s*(?:Uhr)?\s*[–\-bis]+\s*(\d{1,2})(?::(\d{2}))?\s*(?:Uhr)?$/i.exec(t);
    if (!m) { if (/\d/.test(t)) unklar++; continue; }
    const von = tagNr(m[1]), bis = m[2] ? tagNr(m[2]) : von;
    const auf = minuten(m[3], m[4]), zu = minuten(m[5], m[6]);
    if (von === null || bis === null || auf >= zu || zu > 24 * 60) { unklar++; continue; }
    for (let d = von; ; d = (d + 1) % 7) {
      zeiten.push({ tag: d, von: auf, bis: zu });
      if (d === bis || zeiten.length > 7) break;
    }
    gefunden++;
  }
  // Steht etwas Unverstandenes mit Zahlen drin, verlassen wir uns lieber nicht darauf
  return gefunden && !unklar ? zeiten : null;
}

/** Ist der Betrieb zu diesem Zeitpunkt besetzt? (Zeitpunkt als Wochentag 0–6 und Minute des Tages.) */
export const istOffen = (z: Zeiten, tag: number, minute: number) =>
  z.some((e) => e.tag === tag && minute >= e.von && minute < e.bis);
