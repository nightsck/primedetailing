// Speicher unter Node (Hetzner-Server, lokal, Tests): eine SQLite-Datei.
// Nutzt das in Node eingebaute `node:sqlite`, also kein zusätzliches Paket.
// Backup = diese eine Datei kopieren (siehe BETRIEB.md).
import { speicherAufSql } from "./sql.ts";
import type { Speicher } from "./schnittstelle.ts";

/** `pfad` = Datei, z. B. "/daten/kunden.sqlite", oder ":memory:" für Tests. */
export async function nodeSpeicher(pfad: string, jetzt?: () => number): Promise<Speicher> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(pfad);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  const befehle = new Map<string, any>();
  return speicherAufSql((befehl, ...werte) => {
    let s = befehle.get(befehl);
    if (!s) { s = db.prepare(befehl); befehle.set(befehl, s); }
    if (/^\s*SELECT/i.test(befehl)) return s.all(...(werte as any[]));
    s.run(...(werte as any[]));
    return [];
  }, jetzt);
}
