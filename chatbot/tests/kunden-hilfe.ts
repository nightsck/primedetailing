// Gemeinsame Helfer für die Kunden-Tests: Speicher im Arbeitsspeicher, zwei Beispielkunden.
import { nodeSpeicher } from "../src/speicher/node.ts";
import { setzeSpeicher } from "../src/speicher/schnittstelle.ts";
import { pruefeKunde } from "../src/kunde/schema.ts";
import { ausVorlage } from "../src/kunde/vorlagen.ts";
import { vergissKunde } from "../src/kunden-routen.ts";

export async function neuerSpeicher(jetzt?: () => number) {
  const s = await nodeSpeicher(":memory:", jetzt);
  setzeSpeicher(s); vergissKunde();
  return s;
}

export function beispiel(id: string, branche: string, eigene: any = {}) {
  const r = pruefeKunde(ausVorlage(branche, {
    id, paket: "komplett",
    stammdaten: { firmenname: id === "maler-mueller" ? "Malerbetrieb Müller" : "Elektro Schmidt", email: `info@${id}.de`, website: `https://www.${id}.de`, telefon: "07721 12345" },
    rechtliches: { datenschutzUrl: `https://www.${id}.de/datenschutz` },
    module: { kundenChat: { aktiv: true }, bewerberChat: { aktiv: true } },
    ...eigene,
  }));
  if (!r.ok) throw new Error(JSON.stringify(r.fehler));
  return r.kunde;
}

export async function anlegen(s: Awaited<ReturnType<typeof neuerSpeicher>>, kunde: any, live = true) {
  await s.kundeSpeichern(kunde, "test");
  if (live) await s.kundeVeroeffentlichen(kunde.id, "test");
  vergissKunde(kunde.id);
}

export function leseStream(roh: string) {
  let text = "", token = "", ui: any[] = [];
  for (const block of roh.split("\n\n")) {
    const ev = (block.match(/^event: (.*)$/m) || [])[1];
    const data = JSON.parse((block.match(/^data: (.*)$/m) || [, "{}"])[1]);
    if (ev === "text") text += data.text;
    if (ev === "verlauf") token = data.token;
    if (ev === "ui") ui.push(data);
  }
  return { text, token, ui };
}
