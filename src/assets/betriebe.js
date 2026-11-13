// Gemeinsame Daten und Rechenregeln der Vorführseiten /demo/termin/ und /demo/anfrage/.
// Wird im Browser als Modul geladen und vom Chatbot-Server importiert
// (chatbot/src/termin.ts, chatbot/src/betrieb.ts). So gelten Öffnungszeiten,
// Dauer und freie Zeiten überall gleich. Alle drei Betriebe sind erfunden.

export const TZ = 'Europe/Berlin';
const T = (s) => { const [a, b = '0'] = String(s).split(':'); return Number(a) * 60 + Number(b); };
const fenster = (...paare) => paare.map(([a, b]) => [T(a), T(b)]);

/* ---------- Beispielbetriebe ---------- */
// zeiten: Wochentag (0 = So … 6 = Sa) → Zeitfenster [von, bis] in Minuten ab Mitternacht.
// ort: 'betrieb' = Kunde kommt vorbei, 'kunde' = Termin beim Kunden (mit Fahrzeit davor und danach).
export const BETRIEBE = {
  fahrzeug: {
    id: 'fahrzeug', name: 'Muster Fahrzeugpflege', art: 'Fahrzeugaufbereitung', logo: 'F', farbe: '#0F4C5C', farbe2: '#E7F0F1',
    zeitenText: 'Mo–Fr 8–17 Uhr, Sa 9–13 Uhr', adresse: 'Musterstraße 1, 78000 Musterstadt',
    gebiet: 'Hol- und Bringservice im Umkreis von 15 km auf Anfrage',
    zeiten: { 1: fenster(['8', '17']), 2: fenster(['8', '17']), 3: fenster(['8', '17']), 4: fenster(['8', '17']), 5: fenster(['8', '17']), 6: fenster(['9', '13']) },
    vorlaufStunden: 14, puffer: 15, fahrt: 0, raster: 30, horizont: 28,
    termine: [
      { id: 'aussen', name: 'Außenwäsche', kurz: 'Handwäsche mit Felgen, ca. 1 Stunde', dauer: 60, ort: 'betrieb' },
      { id: 'innen', name: 'Innenreinigung', kurz: 'Sitze, Teppiche, Cockpit, ca. 2,5 Stunden', dauer: 150, ort: 'betrieb' },
      { id: 'komplett', name: 'Innen und außen', kurz: 'Komplettpflege, ca. 4 Stunden', dauer: 240, ort: 'betrieb' },
      { id: 'politur', name: 'Politur', kurz: 'Auto morgens bringen, abends abholen', ganztag: 1, ort: 'betrieb' },
      { id: 'keramik', name: 'Keramikversiegelung', kurz: 'Auto bleibt 2 Tage bei uns', ganztag: 2, ort: 'betrieb' },
      { id: 'smart', name: 'Smart Repair', kurz: 'Kratzer und kleine Dellen, ca. 1,5 Stunden', dauer: 90, ort: 'betrieb' },
      { id: 'beratung', name: 'Kurz vorbeikommen', kurz: 'Auto ansehen lassen, ca. 20 Minuten', dauer: 20, ort: 'betrieb', raster: 20 }
    ],
    anliegen: [
      { id: 'innen', name: 'Innenreinigung', fragen: ['fahrzeug', 'zustandInnen'] },
      { id: 'aussen', name: 'Außenpflege', fragen: ['fahrzeug', 'zustandAussen'] },
      { id: 'lack', name: 'Politur oder Versiegelung', fragen: ['fahrzeug', 'lack'] },
      { id: 'schaden', name: 'Kratzer oder Delle', fragen: ['schaden'] },
      { id: 'anderes', name: 'Etwas anderes', fragen: [] }
    ],
    ortFragen: false, terminVorschlag: 'beratung'
  },
  maler: {
    id: 'maler', name: 'Malerbetrieb Muster', art: 'Malerbetrieb', logo: 'M', farbe: '#7A3B1D', farbe2: '#F5ECE6',
    zeitenText: 'Mo–Fr 7–16 Uhr', adresse: 'Pinselweg 3, 78000 Musterstadt',
    gebiet: 'Einsatz im Umkreis von 30 km um Musterstadt',
    zeiten: { 1: fenster(['7', '16']), 2: fenster(['7', '16']), 3: fenster(['7', '16']), 4: fenster(['7', '16']), 5: fenster(['7', '16']) },
    vorlaufStunden: 20, puffer: 15, fahrt: 30, raster: 30, horizont: 28,
    termine: [
      { id: 'besichtigung', name: 'Besichtigung vor Ort', kurz: 'Wir schauen uns alles an und messen auf, ca. 45 Minuten', dauer: 45, ort: 'kunde', zeiten: { 1: fenster(['8', '15']), 2: fenster(['8', '15']), 3: fenster(['8', '15']), 4: fenster(['8', '15']), 5: fenster(['8', '15']) } },
      { id: 'farbberatung', name: 'Farbberatung im Laden', kurz: 'Farben und Muster ansehen, ca. 45 Minuten', dauer: 45, ort: 'betrieb', zeiten: { 1: fenster(['13', '16']), 3: fenster(['13', '16']), 5: fenster(['13', '16']) } },
      { id: 'telefon', name: 'Rückruf zur Beratung', kurz: 'Wir rufen Sie zur vereinbarten Zeit an, ca. 15 Minuten', dauer: 15, ort: 'telefon', raster: 15 }
    ],
    anliegen: [
      { id: 'innen', name: 'Räume streichen', fragen: ['objekt', 'raeume', 'zeitraum'] },
      { id: 'fassade', name: 'Fassade', fragen: ['gebaeude', 'zeitraum'] },
      { id: 'tapete', name: 'Tapezieren', fragen: ['objekt', 'raeume', 'zeitraum'] },
      { id: 'lack', name: 'Türen, Fenster, Heizkörper lackieren', fragen: ['objekt', 'zeitraum'] },
      { id: 'schimmel', name: 'Schimmel oder Wasserschaden', fragen: ['objekt', 'schimmel'] },
      { id: 'anderes', name: 'Etwas anderes', fragen: ['objekt', 'zeitraum'] }
    ],
    ortFragen: true, terminVorschlag: 'besichtigung'
  },
  elektro: {
    id: 'elektro', name: 'Muster Elektrotechnik', art: 'Elektrobetrieb', logo: 'E', farbe: '#1D3F8A', farbe2: '#E8EDF7',
    zeitenText: 'Mo–Do 7–16 Uhr, Fr 7–12 Uhr', adresse: 'Stromstraße 5, 78000 Musterstadt',
    gebiet: 'Einsatz im Umkreis von 25 km um Musterstadt',
    zeiten: { 1: fenster(['7', '16']), 2: fenster(['7', '16']), 3: fenster(['7', '16']), 4: fenster(['7', '16']), 5: fenster(['7', '12']) },
    vorlaufStunden: 20, puffer: 15, fahrt: 30, raster: 30, horizont: 28,
    termine: [
      { id: 'kundendienst', name: 'Reparatur vor Ort', kurz: 'Etwas geht nicht mehr, ca. 1,5 Stunden', dauer: 90, ort: 'kunde' },
      { id: 'besichtigung', name: 'Besichtigung für ein Angebot', kurz: 'Neue Leitungen, Umbau, Sanierung, ca. 1 Stunde', dauer: 60, ort: 'kunde' },
      { id: 'wallbox', name: 'Wallbox-Check', kurz: 'Wir prüfen, ob und wo eine Wallbox passt, ca. 45 Minuten', dauer: 45, ort: 'kunde' },
      { id: 'echeck', name: 'E-Check', kurz: 'Prüfung der Anlage mit Protokoll, ca. 2 Stunden', dauer: 120, ort: 'kunde' }
    ],
    anliegen: [
      { id: 'stoerung', name: 'Störung oder Ausfall', fragen: ['stoerung', 'objekt'] },
      { id: 'neu', name: 'Steckdosen, Licht, Leitungen neu', fragen: ['objekt', 'zeitraum'] },
      { id: 'wallbox', name: 'Wallbox', fragen: ['objekt', 'parken', 'zeitraum'] },
      { id: 'sanierung', name: 'Sanierung oder Neubau', fragen: ['objekt', 'zeitraum'] },
      { id: 'echeck', name: 'E-Check / Prüfung', fragen: ['objekt', 'zeitraum'] },
      { id: 'anderes', name: 'Etwas anderes', fragen: ['objekt', 'zeitraum'] }
    ],
    ortFragen: true, terminVorschlag: 'besichtigung'
  }
};

// Fragen im Anfrage-Chat: Text, Kurzname für die Zusammenfassung, Antworten zum Antippen.
// Eine Antwort mit `notfall: true` setzt die Anfrage sofort auf Notfall (ohne KI).
export const FRAGEN = {
  fahrzeug: { text: 'Um welches Fahrzeug geht es?', label: 'Fahrzeug', opts: ['Kleinwagen', 'Kompakt / Mittelklasse', 'SUV / Kombi', 'Transporter / Van'] },
  zustandInnen: { text: 'Wie sieht der Innenraum aus?', label: 'Zustand', opts: ['Normal benutzt', 'Stark verschmutzt', 'Tierhaare', 'Flecken oder Gerüche'] },
  zustandAussen: { text: 'Wie verschmutzt ist das Auto außen?', label: 'Zustand', opts: ['Normal', 'Stark (Insekten, Baumharz)', 'Winterdreck und Salz'] },
  lack: { text: 'Wie sieht der Lack aus?', label: 'Lack', opts: ['Matt oder stumpf', 'Viele feine Kratzer', 'Neuwagen, nur schützen'] },
  schaden: { text: 'Wie groß ist der Schaden ungefähr?', label: 'Schaden', opts: ['Bis 5 cm', '5 bis 15 cm', 'Größer', 'Mehrere Stellen'] },
  objekt: { text: 'Wo soll gearbeitet werden?', label: 'Objekt', opts: ['Wohnung', 'Einfamilienhaus', 'Mehrfamilienhaus', 'Gewerbe oder Büro'] },
  gebaeude: { text: 'Was für ein Gebäude ist es?', label: 'Gebäude', opts: ['Einfamilienhaus', 'Doppel- oder Reihenhaus', 'Mehrfamilienhaus', 'Gewerbe'] },
  raeume: { text: 'Wie viel ist es ungefähr?', label: 'Umfang', opts: ['Ein Raum', '2 bis 4 Räume', 'Ganze Wohnung oder Haus', 'Weiß ich noch nicht'] },
  zeitraum: { text: 'Bis wann soll es fertig sein?', label: 'Zeitraum', opts: ['So schnell wie möglich', 'In den nächsten Wochen', 'In ein paar Monaten', 'Noch offen'] },
  schimmel: { text: 'Wie groß ist die Stelle?', label: 'Größe', opts: ['Kleiner als ein Blatt Papier', 'Etwa ein Quadratmeter', 'Größer', 'Wasser tritt noch aus', ] },
  stoerung: { text: 'Was ist passiert?', label: 'Störung', opts: ['Sicherung fliegt immer raus', 'Teil des Hauses ohne Strom', 'Ganzes Haus ohne Strom', 'Steckdose oder Schalter kaputt', 'Brandgeruch, Funken oder Schmorspuren'] },
  parken: { text: 'Wo steht das Auto zum Laden?', label: 'Stellplatz', opts: ['Garage', 'Carport oder Stellplatz', 'Tiefgarage', 'Noch offen'] }
};

/* ---------- Dringlichkeit ohne KI ---------- */
// Feste Regeln, die immer gelten. Die KI kann eine Anfrage höher einstufen, nie unter diese Regeln.
const NOTFALL = [
  /brand|schmor|funken|rauch|qualm|knistert|stromschlag|gewischt|kabel (liegt )?frei|offene[ns]? kabel/i,
  /wasser (tritt|läuft|kommt|tropft)|rohrbruch|überschwemm|wasser tritt noch aus/i,
  /ganze[ns]? haus ohne strom|kein strom (im|in der|im ganzen)|komplett ohne strom/i
];
const DRINGEND = [
  /sicherung fliegt|fi (fliegt|löst)|ohne strom|kein strom|teil des hauses|heizung (geht|läuft) nicht|kühlschrank|herd geht nicht/i,
  /so schnell wie möglich|dringend|eilig|sofort|heute noch|morgen schon/i,
  /schimmel.*(größer|kind|baby)|größer als|wasserschaden/i
];
const RANG = { normal: 0, dringend: 1, notfall: 2 };
export const DRINGLICHKEIT = { notfall: 'Notfall', dringend: 'Dringend', normal: 'Normal' };
export function hoeher(a, b) { return (RANG[b] || 0) > (RANG[a] || 0) ? b : a; }
export function schaetzeDringlichkeit(text) {
  const s = String(text || '');
  if (NOTFALL.some((re) => re.test(s))) return 'notfall';
  if (DRINGEND.some((re) => re.test(s))) return 'dringend';
  return 'normal';
}
// Sicherheitshinweis, den der Chat bei Gefahr sofort zeigt (fester Text, keine KI)
export function sicherheitshinweis(betriebId, text) {
  const s = String(text || '');
  if (/brand|schmor|funken|rauch|qualm|stromschlag|gewischt|kabel (liegt )?frei|offene[ns]? kabel/i.test(s))
    return 'Bitte zuerst die Sicherung oder den Hauptschalter ausschalten und die Stelle nicht anfassen. Bei Feuer oder Rauch sofort 112 anrufen.';
  if (/wasser (tritt|läuft|kommt|tropft)|rohrbruch|wasser tritt noch aus/i.test(s))
    return 'Wenn möglich zuerst den Haupthahn fürs Wasser zudrehen. Ist Wasser in der Nähe von Steckdosen oder Leitungen, auch die Sicherung ausschalten.';
  return '';
}

/* ---------- Zeit in Deutschland, egal wo Server oder Browser stehen ---------- */
let _dtf = null;
const dtf = () => _dtf || (_dtf = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }));
const WD_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** Uhrzeit in Deutschland zu einem Zeitpunkt (Millisekunden). */
export function berlin(ms) {
  const p = {}; for (const x of dtf().formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, s: +p.second, wd: WD_EN[p.weekday] };
}
function offsetMin(ms) { const b = berlin(ms); return Math.round((Date.UTC(b.y, b.m - 1, b.d, b.h, b.min, b.s) - Math.floor(ms / 1000) * 1000) / 60000); }
/** Deutsche Ortszeit → Zeitpunkt. Funktioniert auch an den Tagen der Zeitumstellung. */
export function zeitpunkt(datum, minuten) {
  const [y, m, d] = datum.split('-').map(Number);
  const naiv = Date.UTC(y, m - 1, d, 0, minuten);
  let t = naiv - offsetMin(naiv) * 60000;
  const o2 = offsetMin(t); t = naiv - o2 * 60000;
  return t;
}
const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const minuten = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m && +m[1] < 24 && +m[2] < 60 ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
export function heute(jetzt = Date.now()) { const b = berlin(jetzt); return `${b.y}-${pad(b.m)}-${pad(b.d)}`; }
export function plusTage(datum, n) { const [y, m, d] = datum.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; }
export const wochentag = (datum) => { const [y, m, d] = datum.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const istDatum = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s + 'T12:00:00Z'));
/** ISO-Zeit mit Zeitzone, z. B. 2026-11-03T08:00:00+01:00 */
export function isoBerlin(ms) { const b = berlin(ms); const o = offsetMin(ms); const s = o >= 0 ? '+' : '-'; return `${b.y}-${pad(b.m)}-${pad(b.d)}T${pad(b.h)}:${pad(b.min)}:00${s}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`; }

/* ---------- Freie Zeiten ---------- */
export const terminArt = (b, id) => (b && b.termine.find((t) => t.id === id)) || null;
const fensterAm = (b, t, datum) => { const wd = wochentag(datum); return ((t.zeiten ? t.zeiten[wd] : b.zeiten[wd]) || []); };

/** Zeitraum eines Termins (Start/Ende in ms) inklusive Fahrzeit vorher und Puffer danach. */
export function terminZeitraum(b, tId, datum, zeit) {
  const t = terminArt(b, tId); if (!t || !istDatum(datum)) return null;
  if (t.ganztag) {
    // Ganze Öffnungszeit des Tages und der folgenden Öffnungstage
    const tage = []; let d = datum;
    for (let i = 0; tage.length < t.ganztag && i < 10; i++, d = plusTage(d, 1)) { const f = fensterAm(b, t, d); if (f.length) tage.push([d, f]); else if (!tage.length) return null; }
    if (tage[0][0] !== datum) return null;
    const erst = tage[0][1][0][0], letzt = tage[tage.length - 1];
    const start = zeitpunkt(datum, erst);
    return { start, ende: zeitpunkt(letzt[0], letzt[1][letzt[1].length - 1][1]), blockVon: start, blockBis: zeitpunkt(letzt[0], letzt[1][letzt[1].length - 1][1]), zeit: hhmm(erst), ganztag: t.ganztag };
  }
  const m = minuten(zeit); if (isNaN(m)) return null;
  const start = zeitpunkt(datum, m), ende = start + t.dauer * 60000;
  const fahrt = t.ort === 'kunde' ? b.fahrt : 0;
  return { start, ende, blockVon: start - fahrt * 60000, blockBis: ende + (fahrt + b.puffer) * 60000, zeit: hhmm(m) };
}

const ueberschneidet = (a1, a2, belegt) => belegt.some((x) => a1 < x.ende && a2 > x.start);

/**
 * Freie Startzeiten je Tag. `belegt` = Liste {start, ende} in ms (aus dem Kalender
 * oder, in der Vorführung ohne Kalender, aus den Buchungen in diesem Browser).
 */
/**
 * Freie Termine je Tag.
 * @param feiertag  optional: (datum) => Name des Feiertags oder null. An solchen Tagen
 *                  gibt es keine Termine; der Tag wird mit Grund zurückgegeben.
 */
export function freieZeiten(b, tId, { von, tage = 14, belegt = [], jetzt = Date.now(), feiertag = null } = {}) {
  const t = terminArt(b, tId); if (!t) return [];
  const start = istDatum(von) ? von : heute(jetzt);
  const grenze = plusTage(heute(jetzt), b.horizont);
  const frueh = jetzt + b.vorlaufStunden * 3600000;
  const raster = t.raster || b.raster || 30;
  const out = [];
  for (let i = 0; i < Math.min(tage, 42); i++) {
    const datum = plusTage(start, i);
    if (datum > grenze) break;
    const feier = feiertag ? feiertag(datum) : null;
    if (feier) { out.push({ datum, wd: wochentag(datum), offen: false, slots: [], feiertag: feier }); continue; }
    const slots = [];
    if (t.ganztag) {
      const z = terminZeitraum(b, tId, datum);
      if (z && z.start >= frueh && !ueberschneidet(z.blockVon, z.blockBis, belegt)) slots.push(z.zeit);
    } else {
      for (const [a, e] of fensterAm(b, t, datum)) {
        for (let m = a; m + t.dauer <= e; m += raster) {
          const z = terminZeitraum(b, tId, datum, hhmm(m));
          if (z.start < frueh || ueberschneidet(z.blockVon, z.blockBis, belegt)) continue;
          slots.push(z.zeit);
        }
      }
    }
    out.push({ datum, wd: wochentag(datum), offen: fensterAm(b, t, datum).length > 0, slots });
  }
  return out;
}

/* ---------- Wunschtermin aus freiem Text ---------- */
const TAGE = [['sonntag', 0], ['montag', 1], ['dienstag', 2], ['mittwoch', 3], ['donnerstag', 4], ['freitag', 5], ['samstag', 6], ['sonnabend', 6]];
const KURZ = [['mo', 1], ['di', 2], ['mi', 3], ['do', 4], ['fr', 5], ['sa', 6]];
/**
 * Versteht einfache Wünsche wie „morgen früh“, „Dienstag nachmittag“,
 * „nächste Woche“, „am 14.11.“. Gibt {datum?, teil?} zurück oder null.
 */
export function verstehWunsch(text, jetzt = Date.now()) {
  const s = ' ' + String(text || '').toLowerCase().replace(/[,!?]/g, ' ') + ' ';
  const h = heute(jetzt); let datum = null, teil = null;
  if (/\sübermorgen\s/.test(s)) datum = plusTage(h, 2);
  else if (/\smorgen\s/.test(s) && !/\s(am|jeden) morgen\s/.test(s)) datum = plusTage(h, 1);
  else if (/\sheute\s/.test(s)) datum = h;
  if (!datum) {
    let wd = null;
    for (const [w, n] of TAGE) if (s.includes(w)) { wd = n; break; }
    if (wd === null) for (const [w, n] of KURZ) if (new RegExp(`\\s${w}\\.?\\s`).test(s)) { wd = n; break; }
    if (wd !== null) { const diff = ((wd - wochentag(h) + 7) % 7) || 7; datum = plusTage(h, diff); }
  }
  if (!datum && /\b(nächst|kommend)\w* woche\b/.test(s)) { const diff = ((1 - wochentag(h) + 7) % 7) || 7; datum = plusTage(h, diff); }
  if (!datum) {
    const m = s.match(/\b(\d{1,2})\.\s?(\d{1,2})\.?(\d{2,4})?\b/);
    if (m) {
      const [, d, mo, yy] = m; let y = yy ? Number(yy.length === 2 ? '20' + yy : yy) : Number(h.slice(0, 4));
      let kand = `${y}-${pad(+mo)}-${pad(+d)}`;
      if (!yy && kand < h) kand = `${y + 1}-${pad(+mo)}-${pad(+d)}`;
      if (istDatum(kand) && Number(mo) <= 12 && Number(d) <= 31) datum = kand;
    }
  }
  if (/\b(vormittag\w*|früh|morgens|am morgen|frühmorgens)\b/.test(s) || /\bmorgen früh\b/.test(s)) teil = 'vormittag';
  else if (/\b(nachmittag\w*|mittag\w*|abend\w*|spät\w*|nach der arbeit)\b/.test(s)) teil = 'nachmittag';
  const uhr = s.match(/\b(?:um|ab|gegen)\s+(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?\b/);
  const ab = uhr ? Number(uhr[1]) * 60 + Number(uhr[2] || 0) : null;
  if (!datum && !teil && ab === null) return null;
  return { datum, teil, ab: ab !== null && ab >= 360 && ab <= 1260 ? ab : null };
}
