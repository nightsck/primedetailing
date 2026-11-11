// Kunden-Kontext: Welcher Kunde ist bei dieser Anfrage gerade dran?
//
// Ein Server bedient viele Kunden. Jede Anfrage läuft in einem eigenen
// „Kontext“ mit den Daten genau eines Kunden (Konfiguration, Wissen, Preise).
// `mitKunde(laufzeit, fn)` setzt ihn, `aktuell()` liest ihn. Ohne gesetzten
// Kontext gilt der Standard-Kunde (Prime Detailing, eingebaut beim Bauen) –
// so funktionieren die alten Adressen (/api/chat …) unverändert.
//
// Technisch: AsyncLocalStorage merkt sich den Kunden über alle `await`s einer
// Anfrage hinweg. Läuft unter Node und auf Cloudflare Workers (nodejs_compat).
import { AsyncLocalStorage } from "node:async_hooks";

export type Paket = {
  id: string; name: string; preis: number | null; ab: boolean;
  empfohlen?: boolean; beschreibung?: string; leistungen: string[];
};
export type Kategorie = { name: string; pakete: Paket[] };
export type Preisliste = {
  waehrung: string; kategorien: Kategorie[];
  aufschlaege?: { bezeichnung: string; offen?: boolean; optionen: Record<string, number>; gilt_fuer?: string[] };
  [k: string]: unknown;
};

/** Alles, was der Kunden-Chat zur Laufzeit über einen Kunden braucht. */
export type Laufzeit = {
  /** Kunden-ID (Slug), z. B. "prime-detailing" */
  kundeId: string;
  /** Bot-Konfiguration in der Form von config/bot.config.json */
  config: any;
  wissen: string;
  preise: Preisliste;
  allePakete: Paket[];
  texte: Record<string, string>;
  /** true = Entwurf im Test-Chat des Admin-Panels: nichts zählen, nichts speichern, nichts verschicken */
  test?: boolean;
};

function standardTexte(config: any): Record<string, string> {
  const du = config.ton?.anrede === "du";
  const uebergabe = config.uebergabe?.text || "";
  const t: Record<string, string> = {
    ersatz: (du ? "Dazu möchte ich dir nichts Falsches sagen. " : "Dazu möchte ich Ihnen nichts Falsches sagen. ") + uebergabe,
    injection: du
      ? "Ich bleib lieber bei dem, wobei ich wirklich helfen kann: Fragen zu unseren Leistungen, Preisen und einer Anfrage. Womit kann ich dir helfen?"
      : "Ich bleibe lieber bei dem, wobei ich wirklich helfen kann: Fragen zu unseren Leistungen, Preisen und einer Terminanfrage. Womit kann ich Ihnen helfen?",
    pausiert: "Der Chat ist gerade pausiert.",
    zuViele: du ? "Zu viele Nachrichten in kurzer Zeit. Versuch es bitte gleich noch mal." : "Zu viele Nachrichten in kurzer Zeit. Bitte versuchen Sie es gleich noch einmal.",
    zuVieleHeute: du ? "Für heute ist das Nachrichtenlimit erreicht. Schreib uns gern direkt per WhatsApp oder ruf an." : "Für heute ist das Nachrichtenlimit erreicht. Schreiben Sie uns gern direkt per WhatsApp oder rufen Sie an.",
    zuVieleFotos: du ? "Für den Moment sind genug Fotos angekommen. Schick weitere gern direkt per WhatsApp." : "Für den Moment sind genug Fotos angekommen. Weitere Fotos schicken Sie uns gern direkt per WhatsApp.",
    ausgelastet: du ? "Der Chat ist für heute ausgelastet. Schreib uns gern direkt per WhatsApp oder ruf an." : "Der Chat ist für heute ausgelastet. Schreiben Sie uns gern direkt per WhatsApp oder rufen Sie an.",
    zuLang: du ? "Unser Gespräch ist sehr lang geworden. Schreib uns am besten direkt – oder lade die Seite neu." : "Dieses Gespräch ist sehr lang geworden. Am besten schreiben Sie uns direkt – oder laden Sie die Seite neu.",
    fehler: (du ? "Ich hänge gerade kurz. " : "Ich komme gerade kurz nicht weiter. ") + uebergabe,
    fehlerTermin: du ? "Gern! Ich habe dir unten das Anfrageformular geöffnet – trag kurz Name und Kontakt ein und schick es ab, dann meldet sich das Team mit dem nächsten freien Termin." : "Gern! Ich habe Ihnen unten das Anfrageformular geöffnet – tragen Sie kurz Name und Kontakt ein und senden Sie es ab, dann meldet sich das Team mit dem nächsten freien Termin.",
  };
  // einzeln überschreibbar über config.texte
  for (const k of Object.keys(t)) if (typeof config.texte?.[k] === "string" && config.texte[k]) t[k] = config.texte[k];
  return t;
}

/** Baut die Laufzeit-Daten eines Kunden aus Bot-Konfiguration, Wissen und Preisliste. */
export function baueLaufzeit(kundeId: string, config: any, wissen: string, preise: Preisliste, extra: Partial<Laufzeit> = {}): Laufzeit {
  return {
    kundeId, config, wissen, preise,
    allePakete: preise.kategorien.flatMap((k) => k.pakete),
    texte: standardTexte(config),
    ...extra,
  };
}

const speicher = new AsyncLocalStorage<Laufzeit>();
let standard: Laufzeit | null = null;

/** Standard-Kunde für Anfragen ohne eigenen Kontext (alte Adressen, Tests). */
export function setzeStandard(l: Laufzeit) { standard = l; }
export function standardKunde(): Laufzeit {
  if (!standard) throw new Error("Kein Standard-Kunde gesetzt (config.ts nicht geladen?)");
  return standard;
}

/** Der Kunde, dessen Anfrage gerade läuft. */
export function aktuell(): Laufzeit { return speicher.getStore() || standardKunde(); }

/** Kunden-ID nur, wenn ausdrücklich ein Kunden-Kontext gesetzt ist (sonst null, z. B. im internen CRM). */
export function kundeImKontext(): string | null { return speicher.getStore()?.kundeId ?? null; }

/** Führt `fn` im Kontext eines Kunden aus. */
export function mitKunde<T>(l: Laufzeit, fn: () => T): T { return speicher.run(l, fn); }

/**
 * „Sicht“: sieht aus wie ein normales Objekt oder eine Liste, zeigt aber immer
 * die Daten des aktuellen Kunden. Damit kann bestehender Code weiter
 * `config.betrieb.name` schreiben und bekommt automatisch den richtigen Kunden.
 */
export function sicht<T extends object>(holen: () => T, liste = false): T {
  return new Proxy((liste ? [] : {}) as T, {
    get: (_z, k) => { const o: any = holen(); const v = o[k]; return typeof v === "function" ? v.bind(o) : v; },
    has: (_z, k) => k in (holen() as any),
    ownKeys: () => Reflect.ownKeys(holen()),
    getOwnPropertyDescriptor: (_z, k) => {
      const d = Reflect.getOwnPropertyDescriptor(holen(), k);
      if (d && !(liste && k === "length")) d.configurable = true;
      return d;
    },
    set: () => { throw new Error("Kunden-Daten sind zur Laufzeit schreibgeschützt."); },
  });
}

/** Rechnet einen Wert einmal pro Kunde aus und merkt ihn sich (z. B. Werkzeug-Beschreibungen). */
export function jeKunde<T>(rechne: (l: Laufzeit) => T): () => T {
  const merker = new WeakMap<Laufzeit, T>();
  return () => {
    const l = aktuell();
    if (!merker.has(l)) merker.set(l, rechne(l));
    return merker.get(l)!;
  };
}
