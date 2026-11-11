// Speicher auf SQLite. Dieselbe Datei läuft im Cloudflare Durable Object und
// unter Node – nur die winzige Schicht `Sql` (einen Befehl ausführen) ist je
// Plattform anders.
import type { Kunde } from "../kunde/schema.ts";
import type { Speicher, KundeZeile, Vorgang, DateiMeta } from "./schnittstelle.ts";
import { MODULE } from "../kunde/schema.ts";

/** Führt einen SQL-Befehl aus und gibt die Zeilen zurück. */
export type Sql = (befehl: string, ...werte: unknown[]) => any[];

const TAG = 86_400_000;
const TEIL = 1_000_000; // Dateien in Stücken ablegen (SQLite-Grenze pro Wert im Durable Object)
const neueId = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
const tagVon = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const bytes = (x: any): Uint8Array => (x instanceof Uint8Array ? x : new Uint8Array(x as ArrayBuffer));

export function speicherAufSql(sql: Sql, jetzt: () => number = Date.now): Speicher {
  sql(`CREATE TABLE IF NOT EXISTS kunde (id TEXT PRIMARY KEY, entwurf TEXT NOT NULL, live TEXT, geaendert INTEGER NOT NULL, wer TEXT NOT NULL DEFAULT '')`);
  sql(`CREATE TABLE IF NOT EXISTS kunde_version (kunde TEXT NOT NULL, nr INTEGER NOT NULL, zeit INTEGER NOT NULL, wer TEXT NOT NULL, konfig TEXT NOT NULL, PRIMARY KEY (kunde, nr))`);
  sql(`CREATE TABLE IF NOT EXISTS vorgang (kunde TEXT NOT NULL, id TEXT NOT NULL, art TEXT NOT NULL, status TEXT NOT NULL, dringlichkeit TEXT NOT NULL, titel TEXT NOT NULL, daten TEXT NOT NULL, erstellt INTEGER NOT NULL, loeschen INTEGER NOT NULL, PRIMARY KEY (kunde, id))`);
  sql(`CREATE INDEX IF NOT EXISTS vorgang_zeit ON vorgang (kunde, erstellt)`);
  sql(`CREATE TABLE IF NOT EXISTS datei (kunde TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, typ TEXT NOT NULL, groesse INTEGER NOT NULL, ablauf INTEGER NOT NULL, PRIMARY KEY (kunde, id))`);
  sql(`CREATE TABLE IF NOT EXISTS datei_teil (kunde TEXT NOT NULL, id TEXT NOT NULL, nr INTEGER NOT NULL, daten BLOB NOT NULL, PRIMARY KEY (kunde, id, nr))`);
  sql(`CREATE TABLE IF NOT EXISTS zaehler (kunde TEXT NOT NULL, tag TEXT NOT NULL, art TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (kunde, tag, art))`);
  sql(`CREATE TABLE IF NOT EXISTS login (hash TEXT PRIMARY KEY, email TEXT NOT NULL, bis INTEGER NOT NULL)`);

  const lies = (s: string | null): Kunde | null => (s ? JSON.parse(s) : null);

  return {
    async kundenListe() {
      const letzte = new Map<string, number>(sql(`SELECT kunde, MAX(erstellt) AS t FROM vorgang GROUP BY kunde`).map((r) => [r.kunde, Number(r.t)]));
      const chat = new Map<string, string>(sql(`SELECT kunde, MAX(tag) AS t FROM zaehler GROUP BY kunde`).map((r) => [r.kunde, String(r.t)]));
      return sql(`SELECT id, entwurf, live, geaendert FROM kunde ORDER BY id`).map((r): KundeZeile => {
        const e = lies(r.entwurf)!, l = lies(r.live), k = l || e;
        const t = Math.max(letzte.get(r.id) || 0, chat.has(r.id) ? Date.parse(chat.get(r.id)! + "T12:00:00Z") : 0);
        return {
          id: r.id, firmenname: e.stammdaten.firmenname, status: k.status, paket: k.paket, testBis: k.testBis,
          module: MODULE.filter((m) => k.module[m].aktiv), live: !!l, offen: r.entwurf !== r.live,
          geaendert: Number(r.geaendert), letzteAktivitaet: t || null,
        };
      });
    },
    async kundeLesen(id) {
      const r = sql(`SELECT entwurf, live, geaendert, wer FROM kunde WHERE id = ?`, id)[0];
      if (!r) return null;
      return { id, entwurf: lies(r.entwurf)!, veroeffentlicht: lies(r.live), offen: r.entwurf !== r.live, geaendert: Number(r.geaendert), geaendertVon: r.wer };
    },
    async kundeSpeichern(kunde, wer) {
      const text = JSON.stringify(kunde);
      if (sql(`SELECT 1 AS da FROM kunde WHERE id = ?`, kunde.id).length) sql(`UPDATE kunde SET entwurf = ?, geaendert = ?, wer = ? WHERE id = ?`, text, jetzt(), wer, kunde.id);
      else sql(`INSERT INTO kunde (id, entwurf, live, geaendert, wer) VALUES (?, ?, NULL, ?, ?)`, kunde.id, text, jetzt(), wer);
    },
    async kundeVeroeffentlichen(id, wer) {
      const r = sql(`SELECT entwurf FROM kunde WHERE id = ?`, id)[0];
      if (!r) return false;
      const nr = Number(sql(`SELECT COALESCE(MAX(nr), 0) AS n FROM kunde_version WHERE kunde = ?`, id)[0].n) + 1;
      sql(`INSERT INTO kunde_version (kunde, nr, zeit, wer, konfig) VALUES (?, ?, ?, ?, ?)`, id, nr, jetzt(), wer, r.entwurf);
      sql(`UPDATE kunde SET live = entwurf, geaendert = ?, wer = ? WHERE id = ?`, jetzt(), wer, id);
      // Verlauf begrenzen: die letzten 30 Fassungen reichen
      sql(`DELETE FROM kunde_version WHERE kunde = ? AND nr <= ?`, id, nr - 30);
      return true;
    },
    async kundeLoeschen(id) {
      for (const t of ["kunde_version", "vorgang", "datei", "datei_teil", "zaehler"]) sql(`DELETE FROM ${t} WHERE kunde = ?`, id);
      sql(`DELETE FROM kunde WHERE id = ?`, id);
    },
    async versionen(id) {
      return sql(`SELECT nr, zeit, wer FROM kunde_version WHERE kunde = ? ORDER BY nr DESC`, id).map((r) => ({ nr: Number(r.nr), zeit: Number(r.zeit), wer: r.wer }));
    },
    async versionLesen(id, nr) {
      return lies(sql(`SELECT konfig FROM kunde_version WHERE kunde = ? AND nr = ?`, id, nr)[0]?.konfig ?? null);
    },

    async vorgangAnlegen(kunde, v) {
      const id = neueId().slice(0, 24), t = jetzt();
      sql(`INSERT INTO vorgang (kunde, id, art, status, dringlichkeit, titel, daten, erstellt, loeschen) VALUES (?, ?, ?, 'neu', ?, ?, ?, ?, ?)`,
        kunde, id, v.art, v.dringlichkeit || "normal", v.titel.slice(0, 200), JSON.stringify(v.daten), t, t + v.tage * TAG);
      return id;
    },
    async vorgaenge(kunde, filter = {}) {
      const zeilen = filter.art
        ? sql(`SELECT * FROM vorgang WHERE kunde = ? AND art = ? ORDER BY erstellt DESC LIMIT ?`, kunde, filter.art, filter.limit || 200)
        : sql(`SELECT * FROM vorgang WHERE kunde = ? ORDER BY erstellt DESC LIMIT ?`, kunde, filter.limit || 200);
      return zeilen.map((r): Vorgang => ({ id: r.id, art: r.art, status: r.status, dringlichkeit: r.dringlichkeit, titel: r.titel, daten: JSON.parse(r.daten), erstellt: Number(r.erstellt), loeschenAm: Number(r.loeschen) }));
    },
    async vorgangStatus(kunde, id, status) {
      if (!sql(`SELECT 1 AS da FROM vorgang WHERE kunde = ? AND id = ?`, kunde, id).length) return false;
      sql(`UPDATE vorgang SET status = ? WHERE kunde = ? AND id = ?`, status.slice(0, 40), kunde, id);
      return true;
    },
    async vorgangLoeschen(kunde, id) { sql(`DELETE FROM vorgang WHERE kunde = ? AND id = ?`, kunde, id); },

    async dateiAblegen(kunde, meta, daten) {
      sql(`INSERT INTO datei (kunde, id, name, typ, groesse, ablauf) VALUES (?, ?, ?, ?, ?, ?)`, kunde, meta.id, meta.name, meta.typ, meta.groesse, jetzt() + 2 * TAG);
      const u = bytes(daten);
      for (let i = 0, nr = 0; i < u.byteLength; i += TEIL, nr++) sql(`INSERT INTO datei_teil (kunde, id, nr, daten) VALUES (?, ?, ?, ?)`, kunde, meta.id, nr, u.slice(i, i + TEIL));
    },
    async dateiHolen(kunde, id) {
      const m = sql(`SELECT id, name, typ, groesse FROM datei WHERE kunde = ? AND id = ? AND ablauf > ?`, kunde, id, jetzt())[0];
      if (!m) return null;
      const teile = sql(`SELECT daten FROM datei_teil WHERE kunde = ? AND id = ? ORDER BY nr`, kunde, id).map((r) => bytes(r.daten));
      const out = new Uint8Array(teile.reduce((n, t) => n + t.byteLength, 0));
      let pos = 0;
      for (const t of teile) { out.set(t, pos); pos += t.byteLength; }
      return { meta: { id: m.id, name: m.name, typ: m.typ, groesse: Number(m.groesse) }, daten: out.buffer as ArrayBuffer };
    },
    async dateienBehalten(kunde, ids, tage) {
      const out: DateiMeta[] = [];
      for (const id of ids) {
        const m = sql(`SELECT id, name, typ, groesse FROM datei WHERE kunde = ? AND id = ? AND ablauf > ?`, kunde, id, jetzt())[0];
        if (!m) continue;
        sql(`UPDATE datei SET ablauf = ? WHERE kunde = ? AND id = ?`, jetzt() + tage * TAG, kunde, id);
        out.push({ id: m.id, name: m.name, typ: m.typ, groesse: Number(m.groesse) });
      }
      return out;
    },

    async zaehle(kunde, art, n = 1) {
      sql(`INSERT INTO zaehler (kunde, tag, art, n) VALUES (?, ?, ?, ?) ON CONFLICT (kunde, tag, art) DO UPDATE SET n = n + excluded.n`, kunde, tagVon(jetzt()), art, n);
    },
    async auswertung(kunde, tage) {
      return sql(`SELECT tag, art, n FROM zaehler WHERE kunde = ? AND tag >= ? ORDER BY tag`, kunde, tagVon(jetzt() - (tage - 1) * TAG)).map((r) => ({ tag: r.tag, art: r.art, n: Number(r.n) }));
    },
    async summeMonat(kunde, art) {
      return Number(sql(`SELECT COALESCE(SUM(n), 0) AS n FROM zaehler WHERE kunde = ? AND art = ? AND tag >= ?`, kunde, art, tagVon(jetzt()).slice(0, 8) + "01")[0].n);
    },

    async loginMerken(hash, email, bis) {
      sql(`DELETE FROM login WHERE bis < ?`, jetzt());
      sql(`INSERT OR REPLACE INTO login (hash, email, bis) VALUES (?, ?, ?)`, hash, email, bis);
    },
    async loginPruefen(hash, verbrauchen) {
      const r = sql(`SELECT email FROM login WHERE hash = ? AND bis > ?`, hash, jetzt())[0];
      if (!r) return null;
      if (verbrauchen) sql(`DELETE FROM login WHERE hash = ?`, hash);
      return r.email;
    },

    async loginLoeschen(email) { sql(`DELETE FROM login WHERE email = ?`, email); },

    async aufraeumen() {
      const t = jetzt();
      const dateien = sql(`SELECT kunde, id FROM datei WHERE ablauf <= ?`, t);
      for (const d of dateien) { sql(`DELETE FROM datei_teil WHERE kunde = ? AND id = ?`, d.kunde, d.id); sql(`DELETE FROM datei WHERE kunde = ? AND id = ?`, d.kunde, d.id); }
      const n = Number(sql(`SELECT COUNT(*) AS n FROM vorgang WHERE loeschen <= ?`, t)[0].n);
      sql(`DELETE FROM vorgang WHERE loeschen <= ?`, t);
      sql(`DELETE FROM zaehler WHERE tag < ?`, tagVon(t - 400 * TAG));
      sql(`DELETE FROM login WHERE bis < ?`, t);
      return dateien.length + n;
    },
  };
}
