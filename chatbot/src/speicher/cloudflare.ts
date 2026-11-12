// Speicher auf Cloudflare: ein Durable Object mit SQLite (im kostenlosen Tarif
// enthalten). Alle Kunden liegen in einer Datenbank; getrennt wird über die
// Kunden-ID in jeder Abfrage (siehe schnittstelle.ts).
// Ein täglicher Alarm löscht alles, dessen Frist abgelaufen ist.
import { DurableObject } from "cloudflare:workers";
import { speicherAufSql } from "./sql.ts";
import type { Speicher } from "./schnittstelle.ts";

export class KundenDaten extends DurableObject {
  private s: Speicher;
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as any);
    this.s = speicherAufSql((befehl, ...werte) => ctx.storage.sql.exec(befehl, ...(werte as any[])).toArray());
    ctx.waitUntil(ctx.storage.getAlarm().then((a) => { if (a === null) return ctx.storage.setAlarm(Date.now() + 3_600_000); }));
  }
  /** Eine Speicher-Funktion aufrufen (siehe speicherVon in schnittstelle.ts). */
  async ruf(methode: keyof Speicher, args: unknown[]) {
    const f = (this.s as any)[methode];
    if (typeof f !== "function") throw new Error("Unbekannte Speicher-Funktion: " + String(methode));
    return f(...args);
  }
  async alarm() {
    await this.s.aufraeumen();
    await this.ctx.storage.setAlarm(Date.now() + 86_400_000);
  }
}
