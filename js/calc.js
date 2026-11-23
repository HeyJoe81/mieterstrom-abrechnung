// Rechenkern der Mieterstrom-Abrechnung.
// Reine Funktionen ohne DOM, damit sie in Node getestet werden können.
//
// Konventionen
// - Datumswerte sind Strings "YYYY-MM-DD".
// - Eine Ablesung mit Datum D ist der Zählerstand am ENDE von Tag D.
//   Stand zu Beginn von Tag X = Ablesung(X-1), sonst Ablesung(X), sonst Interpolation.
// - Lieferanten zählen Tage inklusiv (Beginn und Ende zählen).
// - Mieterstrom- und WEG-Abrechnung zählen je nach Objekt-Einstellung
//   "inklusiv" oder "differenz" (Ende minus Beginn, wie bisher in der Excel).
// - Gerundet wird je Position auf Cent.

export const r2 = (x) => Math.round((x + Number.EPSILON * Math.sign(x)) * 100) / 100;
export const r1 = (x) => Math.round(x * 10) / 10;

const DAY = 86400000;
const toUTC = (d) => { const [y, m, t] = d.split('-').map(Number); return Date.UTC(y, m - 1, t); };
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d, n) => fromUTC(toUTC(d) + n * DAY);
export const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);
export const daysIncl = (a, b) => diffDays(a, b) + 1;
const maxDate = (a, b) => (a > b ? a : b);
const minDate = (a, b) => (a < b ? a : b);

// ---------- Zählerstände ----------

function readingsFor(data, zaehlerId, register = '1.8.0') {
  return (data.ablesungen || [])
    .filter((a) => a.zaehlerId === zaehlerId && (a.register || '1.8.0') === register)
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
}

// Zählerstand am Ende von Tag `datum`. Liefert {stand, geschaetzt, quelle}.
export function standAmEnde(data, zaehlerId, datum, register = '1.8.0') {
  const rs = readingsFor(data, zaehlerId, register);
  const exact = rs.filter((r) => r.datum === datum);
  if (exact.length) return { stand: Number(exact[exact.length - 1].stand), geschaetzt: false, datum };
  let before = null, after = null;
  for (const r of rs) {
    if (r.datum < datum) before = r;
    else if (r.datum > datum && !after) after = r;
  }
  if (before && after) {
    const f = diffDays(before.datum, datum) / diffDays(before.datum, after.datum);
    const stand = Number(before.stand) + (Number(after.stand) - Number(before.stand)) * f;
    return { stand, geschaetzt: true, datum, hinweis: `interpoliert zwischen ${before.datum} und ${after.datum}` };
  }
  return null;
}

// Zählerstand zu Beginn von Tag `datum`.
export function standAmBeginn(data, zaehlerId, datum, register = '1.8.0') {
  const prev = addDays(datum, -1);
  const rs = readingsFor(data, zaehlerId, register);
  const p = rs.filter((r) => r.datum === prev);
  if (p.length) return { stand: Number(p[p.length - 1].stand), geschaetzt: false, datum: prev };
  const e = rs.filter((r) => r.datum === datum);
  // Ablesung am Starttag (z. B. Einbau) gilt als Anfangsstand: erste des Tages.
  if (e.length) return { stand: Number(e[0].stand), geschaetzt: false, datum };
  return standAmEnde(data, zaehlerId, prev, register);
}

// Verbrauch eines Zählers von Beginn `von` bis Ende `bis` (kWh, mit Wandlerfaktor).
export function verbrauch(data, zaehler, von, bis, register = '1.8.0') {
  const a = standAmBeginn(data, zaehler.id, von, register);
  const e = standAmEnde(data, zaehler.id, bis, register);
  if (!a || !e) {
    return { kwh: null, fehler: `Zählerstand fehlt für ${zaehler.bezeichnung || zaehler.nummer} (${!a ? 'Beginn ' + von : 'Ende ' + bis})` };
  }
  const faktor = Number(zaehler.faktor || 1);
  const kwh = r1((e.stand - a.stand) * faktor);
  return { kwh, anfang: a, ende: e, faktor, geschaetzt: a.geschaetzt || e.geschaetzt };
}

// ---------- Zeitabschnitte ----------

// Schneidet [von, bis] mit gültigen Einträgen (gueltigAb/gueltigBis) und liefert Abschnitte.
export function abschnitte(eintraege, von, bis) {
  return (eintraege || [])
    .filter((t) => (!t.gueltigAb || t.gueltigAb <= bis) && (!t.gueltigBis || t.gueltigBis >= von))
    .sort((a, b) => ((a.gueltigAb || '') < (b.gueltigAb || '') ? -1 : 1))
    .map((t) => ({ eintrag: t, von: maxDate(von, t.gueltigAb || von), bis: minDate(bis, t.gueltigBis || bis) }));
}

// Tage je Abschnitt nach Zählweise; bei "differenz" zählt der letzte Abschnitt einen Tag weniger.
function tageVerteilen(segs, zaehlweise) {
  segs.forEach((s, i) => {
    s.tage = daysIncl(s.von, s.bis);
    if (zaehlweise === 'differenz' && i === segs.length - 1) s.tage -= 1;
  });
  return segs;
}

function luecken(segs, von, bis) {
  const out = [];
  let cur = von;
  for (const s of segs) {
    if (s.von > cur) out.push(`${cur} bis ${addDays(s.von, -1)}`);
    cur = maxDate(cur, addDays(s.bis, 1));
  }
  if (cur <= bis) out.push(`${cur} bis ${bis}`);
  return out;
}

function abschlaegeSumme(data, zuordnung, von, bis) {
  const list = (data.abschlaege || []).filter((a) => a.zuordnung === zuordnung && a.datum >= von && a.datum <= bis);
  return { summe: r2(list.reduce((s, a) => s + Number(a.betrag || 0), 0)), posten: list };
}

const zaehlweiseVon = (data) => data.objekt?.tageZaehlung || 'differenz';

// ---------- Mieterstrom je Kunde ----------

export function mieterstromAbrechnung(data, zaehler, von, bis) {
  const warnungen = [];
  const segs = tageVerteilen(abschnitte(data.mieterstromTarife, von, bis), zaehlweiseVon(data));
  luecken(segs, von, bis).forEach((l) => warnungen.push(`Kein Mieterstromtarif für ${l}`));
  const positionen = [];
  let kwhGesamt = 0;
  for (const s of segs) {
    const v = verbrauch(data, zaehler, s.von, s.bis);
    if (v.kwh == null) { warnungen.push(v.fehler); continue; }
    if (v.geschaetzt) warnungen.push(`Zählerstand ${zaehler.bezeichnung} geschätzt (${s.von} bis ${s.bis})`);
    const t = s.eintrag;
    kwhGesamt += v.kwh;
    positionen.push({
      von: s.von, bis: s.bis, tage: s.tage, tarif: t.name,
      anfang: v.anfang.stand, ende: v.ende.stand, kwh: v.kwh,
      grundpreisJahr: Number(t.grundpreisJahr), arbeitspreisCt: Number(t.arbeitspreisCt),
      kostenVerbrauch: r2(v.kwh * Number(t.arbeitspreisCt) / 100),
      kostenGrund: r2(Number(t.grundpreisJahr) * s.tage / 365),
    });
  }
  const gesamt = r2(positionen.reduce((x, p) => x + p.kostenVerbrauch + p.kostenGrund, 0));
  const ab = abschlaegeSumme(data, zaehler.id, von, bis);
  return {
    art: 'mieterstrom', zaehler, von, bis,
    tage: positionen.reduce((x, p) => x + p.tage, 0),
    kwh: r1(kwhGesamt), positionen, gesamt,
    abschlaege: ab.summe, abschlagPosten: ab.posten,
    ergebnis: r2(ab.summe - gesamt), // > 0 Guthaben, < 0 Nachzahlung
    warnungen,
  };
}

// ---------- WEG-eigene Verbraucher (Heizung, Allgemeinstrom) ----------
// Arbeitspreis je Zähler; Grundpreis einmal je Abschnitt, nach Verbrauch auf die Zähler verteilt.

export function wegAbrechnung(data, von, bis) {
  const warnungen = [];
  const zs = (data.zaehler || []).filter((z) => z.typ === 'weg' && z.aktiv !== false);
  const segs = tageVerteilen(abschnitte(data.wegTarife, von, bis), zaehlweiseVon(data));
  luecken(segs, von, bis).forEach((l) => warnungen.push(`Kein WEG-Verrechnungstarif für ${l}`));
  const proZaehler = new Map(zs.map((z) => [z.id, { art: 'weg', zaehler: z, von, bis, positionen: [], warnungen: [] }]));
  for (const s of segs) {
    const t = s.eintrag;
    const vs = zs.map((z) => ({ z, v: verbrauch(data, z, s.von, s.bis) }));
    vs.filter((x) => x.v.kwh == null).forEach((x) => warnungen.push(x.v.fehler));
    const ok = vs.filter((x) => x.v.kwh != null);
    const summe = ok.reduce((a, x) => a + x.v.kwh, 0);
    const gpGesamt = Number(t.grundpreisJahr) * s.tage / 365;
    for (const { z, v } of ok) {
      if (v.geschaetzt) warnungen.push(`Zählerstand ${z.bezeichnung} geschätzt (${s.von} bis ${s.bis})`);
      const anteil = summe > 0 ? v.kwh / summe : 1 / ok.length;
      proZaehler.get(z.id).positionen.push({
        von: s.von, bis: s.bis, tage: s.tage, tarif: t.name,
        anfang: v.anfang.stand, ende: v.ende.stand, kwh: v.kwh,
        grundpreisJahr: Number(t.grundpreisJahr), arbeitspreisCt: Number(t.arbeitspreisCt),
        anteil, grundpreisGesamt: r2(gpGesamt),
        kostenVerbrauch: r2(v.kwh * Number(t.arbeitspreisCt) / 100),
        kostenGrund: r2(gpGesamt * anteil),
      });
    }
  }
  const ergebnisse = [...proZaehler.values()].map((e) => {
    e.kwh = r1(e.positionen.reduce((a, p) => a + p.kwh, 0));
    e.tage = e.positionen.reduce((a, p) => a + p.tage, 0);
    e.gesamt = r2(e.positionen.reduce((a, p) => a + p.kostenVerbrauch + p.kostenGrund, 0));
    const ab = abschlaegeSumme(data, e.zaehler.id, von, bis);
    e.abschlaege = ab.summe; e.abschlagPosten = ab.posten;
    e.ergebnis = r2(ab.summe - e.gesamt);
    return e;
  });
  return { ergebnisse, warnungen };
}

// ---------- Lieferantenrechnung nach Messkonzept 13 ----------
// Abrechenbare Menge = Bezug Übergabezähler − Σ Verbrauch der Nicht-Teilnehmer (mind. 0).

export function lieferantenSimulation(data, von, bis) {
  const warnungen = [];
  const uebergabe = (data.zaehler || []).find((z) => z.typ === 'uebergabe');
  const fremd = (data.zaehler || []).filter((z) => z.typ === 'marktteilnehmer');
  if (!uebergabe) return { vertraege: [], warnungen: ['Kein Übergabezähler angelegt'] };
  const segs = abschnitte(data.lieferantenVertraege, von, bis);
  luecken(segs, von, bis).forEach((l) => warnungen.push(`Kein Lieferantenvertrag für ${l}`));
  const vertraege = segs.map((s) => {
    const t = s.eintrag;
    const tage = daysIncl(s.von, s.bis);
    const vb = verbrauch(data, uebergabe, s.von, s.bis);
    const abzuege = fremd.map((z) => ({ zaehler: z, ...verbrauch(data, z, s.von, s.bis) }));
    [vb, ...abzuege].filter((x) => x.kwh == null).forEach((x) => warnungen.push(x.fehler));
    [vb, ...abzuege].filter((x) => x.geschaetzt).forEach(() => warnungen.push(`Geschätzte Zählerstände im Abschnitt ${s.von} bis ${s.bis}`));
    const bezug = vb.kwh ?? 0;
    const summeAbzug = r1(abzuege.reduce((a, x) => a + (x.kwh ?? 0), 0));
    const menge = Math.max(0, r1(bezug - summeAbzug));
    const pos = [];
    pos.push({ text: 'Grundpreis', menge: `${tage} Tage`, preis: Number(t.grundpreisNettoJahr), einheit: '€/Jahr', betrag: r2(Number(t.grundpreisNettoJahr) * tage / 365) });
    pos.push({ text: 'Arbeitspreis', menge: menge, einheitMenge: 'kWh', preis: Number(t.arbeitspreisNettoCt), einheit: 'ct/kWh', betrag: r2(menge * Number(t.arbeitspreisNettoCt) / 100) });
    if (Number(t.stromsteuerCt)) pos.push({ text: 'Stromsteuer', menge, einheitMenge: 'kWh', preis: Number(t.stromsteuerCt), einheit: 'ct/kWh', betrag: r2(menge * Number(t.stromsteuerCt) / 100) });
    if (Number(t.p14aNettoJahr)) pos.push({ text: '§ 14a EnWG Reduzierung (Modul 1)', menge: `${tage} Tage`, preis: -Math.abs(Number(t.p14aNettoJahr)), einheit: '€/Jahr', betrag: -r2(Math.abs(Number(t.p14aNettoJahr)) * tage / 365) });
    const netto = r2(pos.reduce((a, p) => a + p.betrag, 0));
    const ustProzent = Number(t.ustProzent ?? 19);
    const ust = r2(netto * ustProzent / 100);
    const brutto = r2(netto + ust);
    const ab = abschlaegeSumme(data, t.id, s.von, s.bis);
    return {
      vertrag: t, von: s.von, bis: s.bis, tage,
      uebergabe: { zaehler: uebergabe, ...vb }, abzuege, summeAbzug, bezug, menge,
      positionen: pos, netto, ustProzent, ust, brutto,
      abschlaege: ab.summe, abschlagPosten: ab.posten, ergebnis: r2(ab.summe - brutto),
    };
  });
  return {
    vertraege, warnungen,
    summe: {
      menge: r1(vertraege.reduce((a, v) => a + v.menge, 0)),
      brutto: r2(vertraege.reduce((a, v) => a + v.brutto, 0)),
      abschlaege: r2(vertraege.reduce((a, v) => a + v.abschlaege, 0)),
      ergebnis: r2(vertraege.reduce((a, v) => a + v.ergebnis, 0)),
    },
  };
}

// ---------- 90-%-Grenze (§ 42a Abs. 4 EnWG) ----------
// Vergleich mit dem Grundversorgungstarif bei einem Musterverbrauch (Standard 2.500 kWh/Jahr).

export function preisgrenze(msTarif, gv, kwhJahr = 2500) {
  if (!msTarif || !gv) return null;
  const ms = Number(msTarif.grundpreisJahr) + kwhJahr * Number(msTarif.arbeitspreisCt) / 100;
  const g = Number(gv.grundpreisJahr) + kwhJahr * Number(gv.arbeitspreisCt) / 100;
  return { kwhJahr, mieterstrom: r2(ms), grundversorgung: r2(g), quote: ms / g, eingehalten: ms <= 0.9 * g };
}

// ---------- Gesamtabrechnung eines Zeitraums ----------

export function abrechnung(data, von, bis) {
  const kunden = (data.zaehler || [])
    .filter((z) => z.typ === 'mieterstrom' && z.aktiv !== false)
    .map((z) => mieterstromAbrechnung(data, z, von, bis));
  const weg = wegAbrechnung(data, von, bis);
  const lieferant = lieferantenSimulation(data, von, bis);
  const warnungen = [...kunden.flatMap((k) => k.warnungen), ...weg.warnungen, ...lieferant.warnungen];
  return { von, bis, kunden, weg: weg.ergebnisse, lieferant, warnungen: [...new Set(warnungen)] };
}

// Rechnungsnummer z. B. "RE2026-1-01".
export function rechnungsnummer(data, zaehler, bis, lauf = 1) {
  const prefix = data.objekt?.rechnungsPrefix || 'RE';
  const nr = String(zaehler.rechnungsNr ?? 0).padStart(2, '0');
  return `${prefix}${bis.slice(0, 4)}-${lauf}-${nr}`;
}

export function leereDaten() {
  return {
    format: 'mieterstrom-abrechnung', version: 1,
    objekt: { name: '', adresse: '', ort: '', betreiber: '', absender: '', rechnungsPrefix: 'RE', tageZaehlung: 'differenz', abrechnungBeginn: '07-01', grundversorgung: { arbeitspreisCt: '', grundpreisJahr: '' }, textMieterstrom: '', textWeg: '' },
    zaehler: [], ablesungen: [], mieterstromTarife: [], wegTarife: [], lieferantenVertraege: [], abschlaege: [], perioden: [],
  };
}
