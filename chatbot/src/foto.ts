// Foto-Check: prüft hochgeladene Fotos, bevor sie an die KI gehen.
// Fotos werden nirgends gespeichert. Im Gesprächsverlauf steht nur der
// Platzhalter FOTO_MARKER; die Einschätzung des Bots bleibt als Text erhalten.
import { config } from "./config.ts";

export const FOTO_MARKER = "[Foto]";
export const fotoAktiv = (): boolean => !!config.foto?.aktiv;
export const maxFotos = (): number => config.limits?.maxFotosProGespraech ?? 3;
/** Größe als Base64-Text. Das Widget verkleinert vorher auf ca. 150–400 KB. */
const MAX_LAENGE = 2_000_000;

export type Bild = { media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };

export function pruefeBild(eingabe: unknown): { ok: true; bild: Bild } | { ok: false; fehler: string } {
  if (typeof eingabe !== "string") return { ok: false, fehler: "kein Bild" };
  if (eingabe.length > MAX_LAENGE) return { ok: false, fehler: "zu groß" };
  const m = eingabe.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!m) return { ok: false, fehler: "Format" };
  let kopf: Uint8Array;
  try { kopf = Uint8Array.from(atob(m[2].slice(0, 24)), (c) => c.charCodeAt(0)); }
  catch { return { ok: false, fehler: "Format" }; }
  // Dateisignatur muss zum angegebenen Typ passen
  const ist = (...b: number[]) => b.every((x, i) => kopf[i] === x);
  const echt = m[1] === "image/jpeg" ? ist(0xff, 0xd8, 0xff)
    : m[1] === "image/png" ? ist(0x89, 0x50, 0x4e, 0x47)
    : ist(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...kopf.slice(8, 12)) === "WEBP";
  if (!echt) return { ok: false, fehler: "Format" };
  return { ok: true, bild: { media_type: m[1] as Bild["media_type"], data: m[2] } };
}

export const fotosImVerlauf = (verlauf: { role: string; content: any }[]) =>
  verlauf.filter((m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith(FOTO_MARKER)).length;
