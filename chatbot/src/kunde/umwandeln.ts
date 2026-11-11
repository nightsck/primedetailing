// Übersetzt die Kunden-Konfiguration (schema.ts) in das, was die einzelnen Bots
// brauchen. Die Bots selbst kennen nur ihre eigene, einfache Form:
//   Kunden-Chat   → Laufzeit (Bot-Konfiguration + Wissenstext + Preisliste)
//   Bewerber-Chat → Betrieb mit Stellen
// So bleibt die Bot-Logik unverändert und alles Kundenspezifische an einer Stelle.
import { baueLaufzeit, type Laufzeit, type Preisliste } from "../kontext.ts";
import type { Betrieb } from "../bewerber.ts";
import type { Kunde } from "./schema.ts";

const slug = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Leistungen des Kunden als Preisliste (die einzige Preisquelle des Bots). */
export function preislisteVon(k: Kunde): Preisliste {
  const kategorien = new Map<string, any[]>();
  const ids = new Set<string>();
  for (const l of k.wissen.leistungen) {
    let id = slug(l.name) || "leistung";
    while (ids.has(id)) id += "-2";
    ids.add(id);
    const liste = kategorien.get(l.kategorie) || [];
    liste.push({ id, name: l.name, preis: l.preis, ab: l.ab, ...(l.beschreibung ? { beschreibung: l.beschreibung } : {}), leistungen: [] });
    kategorien.set(l.kategorie, liste);
  }
  return { waehrung: "EUR", kategorien: [...kategorien].map(([name, pakete]) => ({ name, pakete })) };
}

/** Alles, was der Bot über den Betrieb wissen darf, als Text (ohne Preise – die kommen aus der Preisliste). */
export function wissenVon(k: Kunde): string {
  const s = k.stammdaten, z: string[] = [`# Wissensbasis ${s.firmenname}`, "", "## Firma", `- Name: ${s.firmenname} (${s.brancheText})`];
  const adresse = [s.strasse, [s.plz, s.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (adresse) z.push(`- Adresse: ${adresse}`);
  if (s.oeffnungszeiten) z.push(`- Öffnungszeiten: ${s.oeffnungszeiten}`);
  if (s.einsatzgebiet) z.push(`- Einsatzgebiet: ${s.einsatzgebiet}`);
  z.push(`- Kontakt: ${[s.telefon && "Telefon " + s.telefon, "E-Mail " + s.email].filter(Boolean).join(", ")}`);
  if (s.ansprechpartner) z.push(`- Ansprechpartner: ${s.ansprechpartner}`);
  if (k.wissen.zahlung) z.push("", "## Bezahlung", `- ${k.wissen.zahlung}`);
  if (k.wissen.anfahrt) z.push("", "## Anfahrt", `- ${k.wissen.anfahrt}`);
  if (k.wissen.wartezeit) z.push("", "## Termine", `- ${k.wissen.wartezeit}`, "- Ein Termin steht erst fest, wenn das Team ihn bestätigt hat.");
  if (k.wissen.leistungen.length) {
    z.push("", "## Leistungen (Preise nur über die Werkzeuge)");
    for (const l of k.wissen.leistungen) z.push(`- ${l.kategorie}: ${l.name}${l.beschreibung ? " – " + l.beschreibung : ""}`);
  }
  if (k.wissen.faq.length) {
    z.push("", "## Häufige Fragen");
    for (const f of k.wissen.faq) z.push(`- Frage: ${f.frage}`, `  Antwort: ${f.antwort}`);
  }
  if (k.wissen.freitext) z.push("", "## Weitere Informationen", k.wissen.freitext);
  return z.join("\n");
}

/** Kunden-Konfiguration → Bot-Konfiguration in der Form von config/bot.config.json. */
export function botConfigVon(k: Kunde): any {
  const s = k.stammdaten, a = k.aussehen, c = k.module.kundenChat, du = k.ton.anrede === "du";
  const wer = s.ansprechpartner || "das Team";
  const direkt = s.whatsapp ? "per WhatsApp" : s.telefon ? "per Telefon" : "per E-Mail";
  return {
    betrieb: {
      name: s.firmenname, branche: s.brancheText, botName: a.botName, website: s.website, telefon: s.telefon,
      whatsapp: s.whatsapp, email: s.email, datenschutzUrl: k.rechtliches.datenschutzUrl, buchungsUrl: "",
    },
    ton: { anrede: k.ton.anrede, sprache: "de", stil: k.ton.stil },
    design: {
      primaer: a.primaerfarbe, akzent: a.akzentfarbe, hintergrund: "#ffffff", radius: "14px", position: a.position,
      launcherHintergrund: a.primaerfarbe, launcherTextfarbe: "#ffffff", launcherText: a.knopfText,
    },
    start: {
      begruessung: a.begruessung || (du
        ? `Hallo! Ich bin ${a.botName}, der digitale Assistent von ${s.firmenname}. Ich beantworte Fragen zu unseren Leistungen und bereite gern eine Anfrage für dich vor.`
        : `Hallo! Ich bin ${a.botName}, der digitale Assistent von ${s.firmenname}. Ich beantworte Fragen zu unseren Leistungen und bereite gern eine Anfrage für Sie vor.`),
      kiHinweis: `${du ? "Du schreibst" : "Sie schreiben"} mit einer KI. Termine und endgültige Preise bestätigt ${wer} persönlich.`,
      buttons: c.startKnoepfe.length ? c.startKnoepfe : ["Frage stellen"],
    },
    foto: { aktiv: c.fotoCheck, button: "📷 Foto-Check", hinweis: "Bitte ohne Personen, Kennzeichen oder Dokumente.", worauf: c.fotoWorauf },
    rueckfragen: {},
    formular: { objektLabel: c.objektLabel, objektPlatzhalter: c.objektPlatzhalter, buchungsText: "" },
    uebergabe: { text: du
      ? `Das klärt am besten unser Team persönlich. Schreib uns gern direkt ${direkt} oder ich bereite eine Anfrage für dich vor.`
      : `Das klärt am besten unser Team persönlich. Schreiben Sie uns gern direkt ${direkt} oder ich bereite eine Anfrage für Sie vor.` },
    llm: { provider: "anthropic", modell: "claude-haiku-5-5", bedrockModell: "", bedrockRegion: "eu-central-1", maxTokens: 600 },
    limits: {
      maxZeichenProNachricht: 800, maxZeichenProGespraech: 12000, maxNachrichtenProGespraech: 30, maxFotosProGespraech: 3,
      proIp: { minute: 8, stunde: 40, tag: 100 }, fotosProIp: { minute: 3, stunde: 6, tag: 10 }, anfragenFormularProIp: { minute: 2, stunde: 5, tag: 10 },
      tagesbudgetNachrichten: k.technik.tagesbudget, monatsbudgetNachrichten: k.technik.monatsbudget,
    },
    pruefung: { erlaubtePhrasen: k.wissen.erlaubtePhrasen },
    nieSagen: k.wissen.nieSagen,
    festeAntworten: k.wissen.festeAntworten, verboteneWoerter: k.wissen.verboteneWoerter, nurWissensbasis: k.wissen.nurWissensbasis,
    poweredBy: k.rechtliches.poweredBy,
  };
}

/** Laufzeit-Daten eines Kunden für den Kunden-Chat. `standardLlm` = Modell-Einstellungen des Servers. */
export function laufzeitVon(k: Kunde, standardLlm?: any, extra: Partial<Laufzeit> = {}): Laufzeit {
  const config = botConfigVon(k);
  if (standardLlm) config.llm = { ...standardLlm };
  return baueLaufzeit(k.id, config, wissenVon(k), preislisteVon(k), extra);
}

/** Betrieb in der Form, die der Bewerber-Chat erwartet. null = Bewerber-Chat aus oder keine Stellen. */
export function bewerberBetriebVon(k: Kunde): Betrieb | null {
  const b = k.module.bewerberChat, s = k.stammdaten;
  if (!b.aktiv) return null;
  const stellen: Betrieb["stellen"] = Object.fromEntries(b.stellen.map((x) => [x.id, { name: x.name, umfang: x.umfang, text: x.text }]));
  if (b.initiativ) stellen.initiativ = { name: "Initiativbewerbung", umfang: "nach Absprache", text: "Für alle, die keine passende Stelle sehen. Das Team schaut, was passen könnte." };
  if (!Object.keys(stellen).length) return null;
  const monate = Math.max(1, Math.round(k.rechtliches.aufbewahrungTage / 30));
  return {
    name: s.firmenname, art: s.brancheText, zeiten: b.arbeitszeiten || s.oeffnungszeiten || "nach Absprache",
    adresse: [s.strasse, [s.plz, s.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || s.einsatzgebiet || "in der Region",
    bietet: b.bietet || "Das erzählt dir das Team im Gespräch.",
    ablauf: `${b.ablauf} Anschreiben und Lebenslauf sind freiwillig. Die Angaben werden nach ${monate} Monaten gelöscht oder früher auf Wunsch.`,
    stellen,
  };
}

/** Websites, von denen aus die Bots dieses Kunden aufgerufen werden dürfen. */
export function erlaubteHerkunft(k: Kunde): string[] {
  const out = new Set<string>();
  const dazu = (u: string) => {
    try {
      const x = new URL(u); out.add(x.origin);
      // mit und ohne www
      out.add(x.hostname.startsWith("www.") ? `${x.protocol}//${x.hostname.slice(4)}` : `${x.protocol}//www.${x.hostname}`);
    } catch { /* keine gültige Adresse */ }
  };
  if (k.stammdaten.website) dazu(k.stammdaten.website);
  k.technik.erlaubteWebsites.forEach(dazu);
  return [...out];
}

/** Ist der Kunde gerade in Betrieb? Sonst der Grund, warum nicht. */
export function betriebsStatus(k: Kunde, heute = new Date().toISOString().slice(0, 10)): { an: true } | { an: false; grund: string } {
  if (k.status === "pausiert") return { an: false, grund: "pausiert" };
  if (k.status === "gekuendigt") return { an: false, grund: "gekündigt" };
  if (k.status === "test" && k.testBis && k.testBis < heute) return { an: false, grund: "Testphase abgelaufen" };
  return { an: true };
}

/** "8-12, 13-17" → [[480, 720], [780, 1020]] (Minuten ab Mitternacht). Unsinnige Fenster fallen weg. */
export function leseZeitfenster(text: string): [number, number][] {
  const min = (t: string) => { const [h, m = "0"] = t.trim().split(":"); return Number(h) * 60 + Number(m); };
  return String(text || "").split(",").map((teil) => teil.split("-")).filter((x) => x.length === 2)
    .map(([a, b]) => [min(a), min(b)] as [number, number]).filter(([a, b]) => a >= 0 && b <= 1440 && b > a);
}

/**
 * Betrieb in der Form, mit der die Termin-Rechnung arbeitet (src/assets/betriebe.js:
 * freieZeiten, terminZeitraum). null = Termin-Bot aus oder nichts buchbar.
 */
export function terminBetriebVon(k: Kunde): any | null {
  const t = k.module.terminBot, s = k.stammdaten;
  if (!t.aktiv || !t.termine.length) return null;
  const WD: Record<string, number> = { so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6 };
  const zeiten: Record<number, [number, number][]> = {};
  for (const [tag, text] of Object.entries(t.zeiten)) { const f = leseZeitfenster(text as string); if (f.length) zeiten[WD[tag]] = f; }
  if (!Object.keys(zeiten).length) return null;
  return {
    id: k.id, name: s.firmenname, art: s.brancheText, farbe: k.aussehen.primaerfarbe,
    zeitenText: s.oeffnungszeiten, adresse: [s.strasse, [s.plz, s.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    zeiten, vorlaufStunden: t.vorlaufStunden, puffer: t.pufferMin, fahrt: t.fahrtMin, raster: t.rasterMin, horizont: t.tageVoraus,
    termine: t.termine.map((x) => ({ id: x.id, name: x.name, kurz: x.kurz, dauer: x.dauerMin, ort: x.ort })),
  };
}

/**
 * Feste Sicherheitsregeln des Anfrage-Chats. Läuft im Code, ohne KI: Enthält der Text
 * eines der Stichworte, gilt mindestens die Dringlichkeit der Regel und der Besucher
 * sieht sofort den festen Hinweis. Die KI kann höher einstufen, nie niedriger.
 */
export function pruefeSicherheitsregeln(k: Kunde, text: string): { dringlichkeit: "normal" | "dringend" | "notfall"; hinweise: string[] } {
  const norm = (x: string) => x.toLowerCase().replace(/ß/g, "ss").replace(/\s+/g, " ");
  const t = norm(String(text || ""));
  let dringlichkeit: "normal" | "dringend" | "notfall" = "normal";
  const hinweise: string[] = [];
  for (const r of k.module.anfrageChat.sicherheitsregeln) {
    if (!r.stichworte.some((w) => t.includes(norm(w)))) continue;
    if (r.dringlichkeit === "notfall" || dringlichkeit === "normal") dringlichkeit = r.dringlichkeit;
    if (r.antwort && !hinweise.includes(r.antwort)) hinweise.push(r.antwort);
  }
  return { dringlichkeit, hinweise };
}
