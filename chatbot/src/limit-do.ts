// Durable Object: ein gemeinsamer Zähler für alle Cloudflare-Server.
// Ein Objekt pro Besucher (gehashte IP) plus eines für das Tagesbudget.
// Daten werden 24 h nach der letzten Nachricht automatisch gelöscht.
import { DurableObject } from "cloudflare:workers";
import { zaehle, zaehleBudget, type Art, type Stand } from "./limits.ts";

export class LimitZaehler extends DurableObject {
  private async laden(): Promise<Stand> {
    return ((await this.ctx.storage.get("stand")) as Stand) || { zeiten: {} };
  }
  private async speichern(s: Stand) {
    await this.ctx.storage.put("stand", s);
    await this.ctx.storage.setAlarm(Date.now() + 86_400_000 + 60_000);
  }

  async zaehle(art: Art, grenzen: { minute?: number; stunde?: number; tag?: number }) {
    const s = await this.laden();
    const grund = zaehle(s, art, Date.now(), grenzen);
    if (!grund) await this.speichern(s);
    return grund;
  }

  async budget(max: number) {
    const s = await this.laden();
    const ok = zaehleBudget(s, Date.now(), max);
    if (ok) await this.speichern(s);
    return ok;
  }

  async alarm() { await this.ctx.storage.deleteAll(); }
}
