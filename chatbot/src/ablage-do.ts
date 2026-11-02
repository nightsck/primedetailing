// Durable Object: Ablage für Bewerbungsunterlagen (Lebenslauf, Zeugnisse …)
// vom Bewerber-Chat auf primedetailing.eu/jobs/.
//
// Warum hier: Der Formulardienst (Web3Forms) kann im kostenlosen Tarif keine
// Anhänge. Deshalb liegen die Dateien hier, und in der Bewerbungs-Mail stehen
// nur Download-Links mit langer Zufalls-ID.
//
// Löschen: Hochgeladen, aber nie abgeschickt → nach 2 Tagen. Abgeschickt → nach
// 6 Monaten (wie in der Datenschutzerklärung). Ein täglicher Alarm räumt auf.
import { DurableObject } from "cloudflare:workers";
import { ablageSpeicher, type Ablage } from "./ablage.ts";

export class UnterlagenAblage extends DurableObject implements Ablage {
  private a: Ablage;
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as any);
    this.a = ablageSpeicher(ctx.storage.sql, (t) => ctx.storage.setAlarm(t), () => ctx.storage.getAlarm());
  }
  ablegen(...x: Parameters<Ablage["ablegen"]>) { return this.a.ablegen(...x); }
  holen(...x: Parameters<Ablage["holen"]>) { return this.a.holen(...x); }
  behalten(...x: Parameters<Ablage["behalten"]>) { return this.a.behalten(...x); }
  aufraeumen() { return this.a.aufraeumen(); }
  async alarm() { await this.a.aufraeumen(); }
}
