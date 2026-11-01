// Ablage für Bewerbungsunterlagen: Logik unabhängig von Cloudflare.
// Auf Workers steckt sie im Durable Object (src/ablage-do.ts) mit SQLite,
// unter Node und in Tests in einer Map im Arbeitsspeicher.

export const TAG = 86_400_000;
export const FRIST_ENTWURF = 2 * TAG;     // hochgeladen, aber nicht abgeschickt
export const FRIST_BEWERBUNG = 183 * TAG; // abgeschickt: 6 Monate
const TEIL = 1_000_000;                   // SQLite: höchstens ca. 2 MB pro Wert

export type Meta = { id: string; name: string; typ: string; groesse: number };
export interface Ablage {
  ablegen(meta: Meta, daten: ArrayBuffer): Promise<void>;
  holen(id: string): Promise<{ meta: Meta; daten: ArrayBuffer } | null>;
  /** Verlängert die Frist für abgeschickte Unterlagen. Gibt die gefundenen zurück. */
  behalten(ids: string[]): Promise<Meta[]>;
  aufraeumen(): Promise<number>;
}

type Sql = { exec(q: string, ...p: unknown[]): { toArray(): any[] } };

/** SQLite-Version (Durable Object). */
export function ablageSpeicher(sql: Sql, setAlarm: (t: number) => unknown, getAlarm: () => Promise<number | null>): Ablage {
  sql.exec(`CREATE TABLE IF NOT EXISTS datei (id TEXT PRIMARY KEY, name TEXT NOT NULL, typ TEXT NOT NULL, groesse INTEGER NOT NULL, erstellt INTEGER NOT NULL, ablauf INTEGER NOT NULL)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS teil (id TEXT NOT NULL, nr INTEGER NOT NULL, daten BLOB NOT NULL, PRIMARY KEY (id, nr))`);
  const weckenSpaetestens = async (t: number) => {
    const a = await getAlarm();
    if (a === null || a > t) await setAlarm(t);
  };
  return {
    async ablegen(meta, daten) {
      const jetzt = Date.now();
      sql.exec(`INSERT INTO datei (id, name, typ, groesse, erstellt, ablauf) VALUES (?, ?, ?, ?, ?, ?)`, meta.id, meta.name, meta.typ, meta.groesse, jetzt, jetzt + FRIST_ENTWURF);
      for (let i = 0, nr = 0; i < daten.byteLength; i += TEIL, nr++) sql.exec(`INSERT INTO teil (id, nr, daten) VALUES (?, ?, ?)`, meta.id, nr, daten.slice(i, i + TEIL));
      await weckenSpaetestens(jetzt + FRIST_ENTWURF + 60_000);
    },
    async holen(id) {
      const m = sql.exec(`SELECT id, name, typ, groesse FROM datei WHERE id = ? AND ablauf > ?`, id, Date.now()).toArray()[0];
      if (!m) return null;
      const teile = sql.exec(`SELECT daten FROM teil WHERE id = ? ORDER BY nr`, id).toArray().map((r) => new Uint8Array(r.daten as ArrayBuffer));
      const out = new Uint8Array(teile.reduce((n, t) => n + t.byteLength, 0));
      let pos = 0;
      for (const t of teile) { out.set(t, pos); pos += t.byteLength; }
      return { meta: { id: m.id, name: m.name, typ: m.typ, groesse: m.groesse }, daten: out.buffer };
    },
    async behalten(ids) {
      const jetzt = Date.now(), gefunden: Meta[] = [];
      for (const id of ids) {
        const m = sql.exec(`SELECT id, name, typ, groesse FROM datei WHERE id = ? AND ablauf > ?`, id, jetzt).toArray()[0];
        if (!m) continue;
        sql.exec(`UPDATE datei SET ablauf = ? WHERE id = ?`, jetzt + FRIST_BEWERBUNG, id);
        gefunden.push({ id: m.id, name: m.name, typ: m.typ, groesse: m.groesse });
      }
      return gefunden;
    },
    async aufraeumen() {
      const jetzt = Date.now();
      const alt = sql.exec(`SELECT id FROM datei WHERE ablauf <= ?`, jetzt).toArray().map((r) => r.id as string);
      for (const id of alt) { sql.exec(`DELETE FROM teil WHERE id = ?`, id); sql.exec(`DELETE FROM datei WHERE id = ?`, id); }
      const naechste = sql.exec(`SELECT MIN(ablauf) AS t FROM datei`).toArray()[0]?.t;
      if (naechste) await setAlarm(Math.max(Number(naechste), jetzt) + 60_000);
      return alt.length;
    },
  };
}

/** Arbeitsspeicher-Version (Node, Tests). */
export function ablageImSpeicher(): Ablage {
  const m = new Map<string, { meta: Meta; daten: ArrayBuffer; ablauf: number }>();
  return {
    async ablegen(meta, daten) { m.set(meta.id, { meta, daten: daten.slice(0), ablauf: Date.now() + FRIST_ENTWURF }); },
    async holen(id) { const e = m.get(id); return e && e.ablauf > Date.now() ? { meta: e.meta, daten: e.daten.slice(0) } : null; },
    async behalten(ids) {
      const out: Meta[] = [];
      for (const id of ids) { const e = m.get(id); if (e && e.ablauf > Date.now()) { e.ablauf = Date.now() + FRIST_BEWERBUNG; out.push(e.meta); } }
      return out;
    },
    async aufraeumen() { let n = 0; for (const [k, e] of m) if (e.ablauf <= Date.now()) { m.delete(k); n++; } return n; },
  };
}
