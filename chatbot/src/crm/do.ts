// Durable Object: die Datenbank des Vertriebs-CRM (SQLite, ein einziges Objekt "crm").
// Alle Logik steckt in kern.ts; hier wird sie nur über RPC erreichbar gemacht.
import { DurableObject } from "cloudflare:workers";
import { crmKern, type CrmKern } from "./kern.ts";

export class CrmDaten extends DurableObject {
  private k: CrmKern;
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as any);
    this.k = crmKern(ctx.storage.sql as any);
  }
  async op(name: string, args: unknown[]) {
    const f = (this.k as any)[name];
    if (typeof f !== "function") throw new Error("Unbekannte Aktion: " + name);
    return f(...(Array.isArray(args) ? args : []));
  }
}
