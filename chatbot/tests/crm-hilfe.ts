// Testhilfe: SQLite wie im Durable Object, aber mit node:sqlite.
import { DatabaseSync } from "node:sqlite";

export function testSql() {
  const db = new DatabaseSync(":memory:");
  return {
    exec(q: string, ...p: unknown[]) {
      const st = db.prepare(q);
      const werte = p.map((x) => (x instanceof ArrayBuffer ? new Uint8Array(x) : x));
      const zeilen = /^\s*(SELECT|INSERT[\s\S]*RETURNING|WITH)/i.test(q) ? st.all(...(werte as any[])) : (st.run(...(werte as any[])), []);
      // BLOBs kommen in Workers als ArrayBuffer zurück
      return { toArray: () => zeilen.map((z: any) => Object.fromEntries(Object.entries(z).map(([k, v]) => [k, v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v]))) };
    },
  };
}
