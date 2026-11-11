// Kunden-Zugang: Was der Kunde selbst ändern darf – und nur das.
//
// Der Kunde sieht und schickt nie die ganze Konfiguration, sondern eine kleine
// „Sicht“ mit den freigegebenen Feldern. Alles andere (feste Antworten, Verbote,
// Module, Paket, Limits, Technik, Benachrichtigungen) kommt in der Sicht gar nicht
// vor und lässt sich über diesen Weg nicht ändern, egal was jemand schickt.
//
// Preise: Der Kunde kann einen Preis eintragen, der Bot nennt aber weiter den
// alten. Der neue steht als „Wunsch“ an der Leistung und gilt erst nach der
// Freigabe im Admin-Panel (ein Zahlendreher soll nicht sofort bei Besuchern landen).
import { z } from "zod";
import { pruefeKunde, deutsch, type Kunde, type Fehler } from "../kunde/schema.ts";
import { istInjection } from "../guard.ts";

const text = (max: number) => z.string().max(max);
const index = z.number().int().min(0).max(200).nullable();

const Eingabe = z.object({
  oeffnungszeiten: text(200), hinweis: text(300), begruessung: text(400),
  zahlung: text(200), anfahrt: text(300), wartezeit: text(200),
  leistungen: z.array(z.object({
    von: index, kategorie: text(60), name: text(80).min(1, "Die Leistung braucht einen Namen."), beschreibung: text(300),
    preis: z.number().min(0).max(99999).nullable(), ab: z.boolean(),
  }).strict()).max(80),
  faq: z.array(z.object({ frage: text(200).min(1, "Bitte die Frage eintragen."), antwort: text(800).min(1, "Bitte die Antwort eintragen.") }).strict()).max(60),
  bewerber: z.object({
    arbeitszeiten: text(200), bietet: text(400),
    stellen: z.array(z.object({ von: index, name: text(100).min(1, "Die Stelle braucht einen Namen."), umfang: text(80), text: text(500) }).strict()).max(15),
  }).strict(),
}).partial().strict();
export type Eingabe = z.infer<typeof Eingabe>;

export type Sicht = Required<Omit<Eingabe, "leistungen" | "bewerber">> & {
  leistungen: (NonNullable<Eingabe["leistungen"]>[number] & { wartet: boolean; livePreis: number | null; liveAb: boolean })[];
  bewerber: Eingabe["bewerber"] | null;
  /** Welche Bereiche der Kunde überhaupt hat (steuert, was die Oberfläche zeigt). */
  bereiche: { kundenChat: boolean; bewerberChat: boolean };
};

/** Die freigegebenen Felder eines Kunden, so wie sie die Oberfläche zeigt. */
export function sichtVon(k: Kunde): Sicht {
  const b = k.module.bewerberChat;
  return {
    oeffnungszeiten: k.stammdaten.oeffnungszeiten, hinweis: k.wissen.hinweis || "", begruessung: k.aussehen.begruessung,
    zahlung: k.wissen.zahlung, anfahrt: k.wissen.anfahrt, wartezeit: k.wissen.wartezeit,
    leistungen: k.wissen.leistungen.map((l, i) => ({
      von: i, kategorie: l.kategorie, name: l.name, beschreibung: l.beschreibung,
      // Hat der Kunde schon einen Preis eingetragen, der auf Freigabe wartet, sieht er seinen eigenen Wert
      preis: l.wunsch ? l.wunsch.preis : l.preis, ab: l.wunsch ? l.wunsch.ab : l.ab,
      wartet: !!l.wunsch, livePreis: l.preis, liveAb: l.ab,
    })),
    faq: k.wissen.faq.map((f) => ({ frage: f.frage, antwort: f.antwort })),
    bewerber: b.aktiv ? { arbeitszeiten: b.arbeitszeiten, bietet: b.bietet, stellen: b.stellen.map((s, i) => ({ von: i, name: s.name, umfang: s.umfang, text: s.text })) } : null,
    bereiche: { kundenChat: k.module.kundenChat.aktiv, bewerberChat: b.aktiv },
  };
}

const sauber = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "").replace(/\r\n?/g, "\n").trim();
const slug = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const euro = (preis: number | null, ab = false) => (preis === null ? "auf Anfrage" : `${ab ? "ab " : ""}${preis.toLocaleString("de-DE", { minimumFractionDigits: Number.isInteger(preis) ? 0 : 2, maximumFractionDigits: 2 })} €`);
const kurz = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Alle Texte säubern (Steuerzeichen raus) und auf Umprogrammier-Versuche prüfen. */
function pruefeTexte(wert: unknown, pfad: string, fehler: Fehler[]): unknown {
  if (typeof wert === "string") {
    const s = sauber(wert);
    if (istInjection(s)) fehler.push({ feld: pfad, text: "Dieser Text kann so nicht gespeichert werden. Bitte anders formulieren." });
    return s;
  }
  if (Array.isArray(wert)) return wert.map((x, i) => pruefeTexte(x, `${pfad}.${i}`, fehler));
  if (wert && typeof wert === "object") return Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, pruefeTexte(v, pfad ? `${pfad}.${k}` : k, fehler)]));
  return wert;
}

export type Ergebnis = { ok: true; kunde: Kunde; aenderungen: string[]; wartet: number } | { ok: false; fehler: Fehler[] };

/**
 * Wendet die Eingabe des Kunden auf die Live-Fassung an. Gibt die neue Fassung und eine
 * Liste der Änderungen in Worten zurück (für die Mail an uns und an den Kunden).
 */
export function wendeAn(live: Kunde, roh: unknown): Ergebnis {
  const r = Eingabe.safeParse(roh);
  if (!r.success) return { ok: false, fehler: r.error.issues.map((i) => ({ feld: i.path.join("."), text: deutsch(i) })) };
  const fehler: Fehler[] = [];
  const e = pruefeTexte(r.data, "", fehler) as Eingabe;
  if (fehler.length) return { ok: false, fehler };

  const k: Kunde = structuredClone(live), z: string[] = [];
  const feld = (name: string, alt: string, neu: string | undefined, setze: (w: string) => void) => {
    if (neu === undefined || neu === alt) return;
    setze(neu);
    z.push(`${name}: ${neu ? `„${kurz(neu, 120)}“` : "(leer)"}${alt ? ` – vorher „${kurz(alt, 120)}“` : ""}`);
  };
  feld("Öffnungszeiten", live.stammdaten.oeffnungszeiten, e.oeffnungszeiten, (w) => { k.stammdaten.oeffnungszeiten = w; });
  feld("Aktueller Hinweis", live.wissen.hinweis || "", e.hinweis, (w) => { k.wissen.hinweis = w; });
  feld("Begrüßung", live.aussehen.begruessung, e.begruessung, (w) => { k.aussehen.begruessung = w; });
  feld("Bezahlung", live.wissen.zahlung, e.zahlung, (w) => { k.wissen.zahlung = w; });
  feld("Anfahrt", live.wissen.anfahrt, e.anfahrt, (w) => { k.wissen.anfahrt = w; });
  feld("Wartezeit auf einen Termin", live.wissen.wartezeit, e.wartezeit, (w) => { k.wissen.wartezeit = w; });

  if (e.leistungen) {
    const benutzt = new Set<number>();
    k.wissen.leistungen = e.leistungen.map((x) => {
      // „von“ zeigt auf die bisherige Leistung. Unbekannt oder doppelt benutzt = neue Leistung.
      const alt = x.von !== null && !benutzt.has(x.von) ? live.wissen.leistungen[x.von] : undefined;
      if (alt) benutzt.add(x.von!);
      const preis = x.preis, ab = preis === null ? false : x.ab;
      const livePreis = alt ? alt.preis : null, liveAb = alt ? alt.ab : false;
      const wunsch = preis === livePreis && ab === liveAb ? null : { preis, ab };
      const kategorie = x.kategorie || "Leistungen";
      if (!alt) z.push(`Neue Leistung: „${x.name}“${wunsch ? ` (Preis ${euro(preis, ab)} wartet auf Freigabe)` : ""}`);
      else {
        if (alt.name !== x.name) z.push(`Leistung umbenannt: „${alt.name}“ → „${x.name}“${livePreis !== null ? ` (ACHTUNG: der Preis ${euro(livePreis, liveAb)} gilt weiter, bitte prüfen)` : ""}`);
        if (alt.beschreibung !== x.beschreibung || alt.kategorie !== kategorie) z.push(`Leistung „${x.name}“: Beschreibung oder Kategorie geändert`);
        const vorher = alt.wunsch ?? null;
        if (wunsch && (!vorher || vorher.preis !== wunsch.preis || vorher.ab !== wunsch.ab)) z.push(`Preis „${x.name}“: ${euro(livePreis, liveAb)} → ${euro(preis, ab)} (wartet auf Freigabe)`);
        if (!wunsch && vorher) z.push(`Preis „${x.name}“: Änderungswunsch zurückgenommen`);
      }
      return { kategorie, name: x.name, beschreibung: x.beschreibung, preis: livePreis, ab: liveAb, wunsch };
    });
    live.wissen.leistungen.forEach((l, i) => { if (!benutzt.has(i)) z.push(`Leistung entfernt: „${l.name}“`); });
  }

  if (e.faq) {
    const alt = new Map(live.wissen.faq.map((f) => [f.frage, f.antwort])), neu = new Map(e.faq.map((f) => [f.frage, f.antwort]));
    for (const [frage, antwort] of neu) {
      if (!alt.has(frage)) z.push(`Neue Frage: „${kurz(frage)}“ – Antwort: „${kurz(antwort, 160)}“`);
      else if (alt.get(frage) !== antwort) z.push(`Antwort geändert bei „${kurz(frage)}“: „${kurz(antwort, 160)}“`);
    }
    for (const frage of alt.keys()) if (!neu.has(frage)) z.push(`Frage entfernt: „${kurz(frage)}“`);
    k.wissen.faq = e.faq.map((f) => ({ frage: f.frage, antwort: f.antwort }));
  }

  if (e.bewerber && live.module.bewerberChat.aktiv) {
    const b = live.module.bewerberChat;
    feld("Arbeitszeiten (Bewerber)", b.arbeitszeiten, e.bewerber.arbeitszeiten, (w) => { k.module.bewerberChat.arbeitszeiten = w; });
    feld("Das bieten wir (Bewerber)", b.bietet, e.bewerber.bietet, (w) => { k.module.bewerberChat.bietet = w; });
    const benutzt = new Set<number>(), ids = new Set<string>(["initiativ"]);
    // Erst die Kurznamen der bleibenden Stellen sichern, damit eine neue Stelle keinen davon bekommt
    for (const s of e.bewerber.stellen) if (s.von !== null && b.stellen[s.von]) ids.add(b.stellen[s.von].id);
    k.module.bewerberChat.stellen = e.bewerber.stellen.map((s) => {
      const alt = s.von !== null && !benutzt.has(s.von) ? b.stellen[s.von] : undefined;
      if (alt) {
        benutzt.add(s.von!);
        if (alt.name !== s.name || alt.umfang !== s.umfang || alt.text !== s.text) z.push(`Stelle geändert: „${s.name}“`);
        return { ...alt, name: s.name, umfang: s.umfang, text: s.text };
      }
      let id = slug(s.name).slice(0, 34).replace(/-$/, "");
      if (id.length < 3) id = "stelle";
      for (let n = 2, basis = id; ids.has(id); n++) id = `${basis}-${n}`;
      ids.add(id);
      z.push(`Neue Stelle: „${s.name}“`);
      return { id, name: s.name, umfang: s.umfang, text: s.text, fragen: ["erfahrung", "start"] as ("erfahrung" | "start")[] };
    });
    b.stellen.forEach((s, i) => { if (!benutzt.has(i)) z.push(`Stelle entfernt: „${s.name}“`); });
  }

  // Zum Schluss durch dieselbe Prüfung wie im Admin-Panel
  const p = pruefeKunde({ ...k, id: live.id });
  if (!p.ok) return { ok: false, fehler: p.fehler.map((f) => ({ feld: f.feld.replace(/^(stammdaten|wissen|aussehen)\./, "").replace(/^module\.bewerberChat\./, "bewerber."), text: f.text })) };
  return { ok: true, kunde: p.kunde, aenderungen: z, wartet: p.kunde.wissen.leistungen.filter((l) => l.wunsch).length };
}

/** Überträgt die freigegebenen Felder aus der neuen Live-Fassung in einen abweichenden Entwurf (alles andere im Entwurf bleibt). */
export function inEntwurf(entwurf: Kunde, neuLive: Kunde): Kunde {
  const k: Kunde = structuredClone(entwurf);
  k.stammdaten.oeffnungszeiten = neuLive.stammdaten.oeffnungszeiten;
  k.aussehen.begruessung = neuLive.aussehen.begruessung;
  for (const f of ["hinweis", "zahlung", "anfahrt", "wartezeit", "leistungen", "faq"] as const) (k.wissen as any)[f] = structuredClone(neuLive.wissen[f]);
  for (const f of ["arbeitszeiten", "bietet", "stellen"] as const) (k.module.bewerberChat as any)[f] = structuredClone(neuLive.module.bewerberChat[f]);
  return k;
}

/** Preiswünsche des Kunden übernehmen (annehmen) oder verwerfen. Gibt zurück, wie viele es waren. */
export function entscheideWuensche(k: Kunde, annehmen: boolean): { kunde: Kunde; anzahl: number; zeilen: string[] } {
  const neu: Kunde = structuredClone(k), zeilen: string[] = [];
  for (const l of neu.wissen.leistungen) {
    if (!l.wunsch) continue;
    zeilen.push(`„${l.name}“: ${euro(l.preis, l.ab)} → ${euro(l.wunsch.preis, l.wunsch.ab)}`);
    if (annehmen) { l.preis = l.wunsch.preis; l.ab = l.wunsch.ab; }
    l.wunsch = null;
  }
  return { kunde: neu, anzahl: zeilen.length, zeilen };
}
