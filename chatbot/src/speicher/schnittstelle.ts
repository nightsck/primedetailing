// Speicher für alles, was pro Kunde dauerhaft liegt: Konfiguration (Entwurf,
// veröffentlicht, alte Versionen), Vorgänge (Anfragen, Bewerbungen, Termine),
// Dateien, Zähler für die Auswertung und Anmelde-Codes fürs Admin-Panel.
//
// Die Bot-Logik spricht nur mit dieser Schnittstelle und weiß nicht, wo die
// Daten liegen:
//   Cloudflare (Demo)  → Durable Object mit SQLite   (cloudflare.ts)
//   Hetzner / lokal    → SQLite-Datei unter Node     (node.ts)
// Beide benutzen dieselben SQL-Befehle (sql.ts).
//
// Mandanten-Trennung: Jede Funktion, die Kundendaten liest oder schreibt,
// verlangt die Kunden-ID als erstes Argument und filtert immer danach.
import type { Kunde } from "../kunde/schema.ts";

export type KundeEintrag = {
  id: string; entwurf: Kunde; veroeffentlicht: Kunde | null;
  /** true = Entwurf weicht von der veröffentlichten Fassung ab */
  offen: boolean; geaendert: number; geaendertVon: string;
};
export type KundeZeile = { id: string; firmenname: string; status: string; paket: string; testBis: string; module: string[]; live: boolean; offen: boolean; geaendert: number; letzteAktivitaet: number | null };
/** Zuletzt gelesener Text der Kunden-Website. `zeit` = letzter erfolgreicher Abruf, `versucht` = letzter Versuch. */
export type WebsiteStand = { text: string; zeit: number; versucht: number; seiten: { url: string; zeichen: number }[]; fehler: string };
export type Version = { nr: number; zeit: number; wer: string };

export type VorgangArt = "anfrage" | "bewerbung" | "termin";
export type Dringlichkeit = "normal" | "dringend" | "notfall";
export type Vorgang = {
  id: string; art: VorgangArt; status: string; dringlichkeit: Dringlichkeit;
  titel: string; daten: Record<string, unknown>; erstellt: number; loeschenAm: number;
};
export type DateiMeta = { id: string; name: string; typ: string; groesse: number };
/** Belegte Zeit im eigenen Kalender (ohne Google). */
export type TerminBlock = { id: string; start: number; ende: number; titel: string };
/** Vorgemerkte Zeit: angefragt, aber noch nicht vom Betrieb bestätigt. */
export type Vormerkung = { id: string; start: number; ende: number; daten: Record<string, unknown>; ablauf: number };

export interface Speicher {
  kundenListe(): Promise<KundeZeile[]>;
  kundeLesen(id: string): Promise<KundeEintrag | null>;
  /** Speichert den Entwurf (legt den Kunden an, wenn es ihn noch nicht gibt). */
  kundeSpeichern(kunde: Kunde, wer: string): Promise<void>;
  /** Macht den Entwurf zur Live-Fassung und legt eine Version im Verlauf ab. */
  kundeVeroeffentlichen(id: string, wer: string): Promise<boolean>;
  /** Löscht den Kunden mit allen Vorgängen, Dateien und Zählern. */
  kundeLoeschen(id: string): Promise<void>;
  versionen(id: string): Promise<Version[]>;
  versionLesen(id: string, nr: number): Promise<Kunde | null>;

  vorgangAnlegen(kunde: string, v: { art: VorgangArt; dringlichkeit?: Dringlichkeit; status?: string; titel: string; daten: Record<string, unknown>; tage: number }): Promise<string>;
  vorgaenge(kunde: string, filter?: { art?: VorgangArt; limit?: number }): Promise<Vorgang[]>;
  vorgangStatus(kunde: string, id: string, status: string): Promise<boolean>;
  vorgangLoeschen(kunde: string, id: string): Promise<void>;

  dateiAblegen(kunde: string, meta: DateiMeta, daten: ArrayBuffer): Promise<void>;
  dateiHolen(kunde: string, id: string): Promise<{ meta: DateiMeta; daten: ArrayBuffer } | null>;
  /** Abgeschickte Unterlagen behalten (sonst werden sie nach 2 Tagen gelöscht). Gibt die gefundenen zurück. */
  dateienBehalten(kunde: string, ids: string[], tage: number): Promise<DateiMeta[]>;

  /**
   * Eigener Kalender – für Betriebe ohne Google Kalender (z. B. Outlook, Apple oder Papier).
   * Hier liegen nur die Zeiten, die der Termin-Bot selbst vergeben hat.
   */
  terminEintragen(kunde: string, t: { start: number; ende: number; titel: string; tage: number }): Promise<string>;
  /** Blöcke, die sich mit [von, bis) überschneiden. */
  terminBelegt(kunde: string, von: number, bis: number): Promise<TerminBlock[]>;
  terminLoeschen(kunde: string, id: string): Promise<boolean>;

  /**
   * Vormerkungen für den Modus „Anfrage statt Buchung“: Die Zeit ist blockiert,
   * solange der Betrieb noch nicht entschieden hat, und wird nach Ablauf wieder frei.
   */
  vormerkungAnlegen(kunde: string, v: { start: number; ende: number; daten: Record<string, unknown>; stunden: number }): Promise<string>;
  /** Gültige Vormerkungen, die sich mit [von, bis) überschneiden. */
  vormerkungen(kunde: string, von: number, bis: number): Promise<Vormerkung[]>;
  vormerkungLesen(kunde: string, id: string): Promise<Vormerkung | null>;
  vormerkungLoeschen(kunde: string, id: string): Promise<boolean>;

  /** Zählt ein Ereignis für die Auswertung (ohne Personenbezug): z. B. "chat", "anfrage", "bewerbung". */
  zaehle(kunde: string, art: string, n?: number): Promise<void>;
  /** Summen je Tag und Art für die letzten `tage` Tage. */
  auswertung(kunde: string, tage: number): Promise<{ tag: string; art: string; n: number }[]>;
  summeMonat(kunde: string, art: string): Promise<number>;

  /** Anmelde-Code fürs Admin-Panel merken (nur als Hash). */
  loginMerken(hash: string, email: string, bis: number): Promise<void>;
  /** Code oder Link prüfen. `verbrauchen` = danach ungültig machen. Gibt die E-Mail zurück oder null. */
  loginPruefen(hash: string, verbrauchen: boolean): Promise<string | null>;

  /** Gelesenen Text der Kunden-Website ablegen bzw. holen (siehe website.ts). */
  websiteMerken(kunde: string, stand: WebsiteStand): Promise<void>;
  websiteLesen(kunde: string): Promise<WebsiteStand | null>;

  /** Alle offenen Codes und Links einer Adresse ungültig machen (neuer Code angefordert oder erfolgreich angemeldet). */
  loginLoeschen(email: string): Promise<void>;

  /** Löscht alles, dessen Frist abgelaufen ist. Gibt die Anzahl zurück. */
  aufraeumen(): Promise<number>;
}

// --- Zugriff -------------------------------------------------------------
let lokal: Speicher | null = null;
/** Unter Node und in Tests: den Speicher einmal beim Start setzen. */
export function setzeSpeicher(s: Speicher | null) { lokal = s; }

const METHODEN = ["kundenListe", "kundeLesen", "kundeSpeichern", "kundeVeroeffentlichen", "kundeLoeschen", "versionen", "versionLesen",
  "vorgangAnlegen", "vorgaenge", "vorgangStatus", "vorgangLoeschen", "dateiAblegen", "dateiHolen", "dateienBehalten", "terminEintragen", "terminBelegt", "terminLoeschen",
  "vormerkungAnlegen", "vormerkungen", "vormerkungLesen", "vormerkungLoeschen",
  "zaehle", "auswertung", "summeMonat", "loginMerken", "loginPruefen", "loginLoeschen", "websiteMerken", "websiteLesen", "aufraeumen"] as const;

/** Der Speicher für diese Anfrage. Auf Cloudflare über die Bindung KUNDEN, sonst der lokal gesetzte. */
export function speicherVon(c: any): Speicher {
  if (lokal) return lokal;
  const ns = c?.env?.KUNDEN;
  if (ns?.idFromName) {
    const stub = ns.get(ns.idFromName("alle"));
    return Object.fromEntries(METHODEN.map((m) => [m, (...args: unknown[]) => stub.ruf(m, args)])) as unknown as Speicher;
  }
  throw new Error("Kein Speicher eingerichtet (Cloudflare: Bindung KUNDEN fehlt; Node: setzeSpeicher nicht aufgerufen).");
}
export const speicherDa = (c: any): boolean => !!lokal || !!c?.env?.KUNDEN?.idFromName;
