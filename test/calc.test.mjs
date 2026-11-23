// Prüft den Rechenkern gegen Ergebnisse, die von Hand nachgerechnet wurden.
// Die Daten sind anonymisiert (keine Namen, keine echten Zählernummern).
// Aufruf: node test/calc.test.mjs
import assert from 'node:assert/strict';
import { abrechnung, lieferantenSimulation, standAmEnde, preisgrenze, rechnungsnummer, daysIncl } from '../js/calc.js';

const A = (zaehlerId, datum, stand) => ({ zaehlerId, datum, stand });

const data = {
  objekt: { name: 'Testobjekt', rechnungsPrefix: 'RE', tageZaehlung: 'differenz' },
  zaehler: [
    { id: 'z1', typ: 'uebergabe', bezeichnung: 'Übergabe', faktor: 50 },
    { id: 'n4', typ: 'marktteilnehmer', bezeichnung: 'Fremd A' },
    { id: 'n5', typ: 'marktteilnehmer', bezeichnung: 'Fremd B' },
    { id: 'n7', typ: 'marktteilnehmer', bezeichnung: 'Fremd C' },
    { id: 'k1', typ: 'mieterstrom', bezeichnung: 'Kunde 1', rechnungsNr: 1 },
    { id: 'k2', typ: 'mieterstrom', bezeichnung: 'Kunde 2', rechnungsNr: 2 },
    { id: 'k3', typ: 'mieterstrom', bezeichnung: 'Kunde 3', rechnungsNr: 3 },
    { id: 'k4', typ: 'mieterstrom', bezeichnung: 'Kunde 4', rechnungsNr: 4 },
    { id: 'k5', typ: 'mieterstrom', bezeichnung: 'Kunde 5', rechnungsNr: 5 },
    { id: 'wp', typ: 'weg', bezeichnung: 'Heizung', rechnungsNr: 9 },
    { id: 'ag', typ: 'weg', bezeichnung: 'Allgemein', rechnungsNr: 10 },
  ],
  ablesungen: [
    A('z1', '2026-02-13', 2.0), A('z1', '2026-03-09', 7.4), A('z1', '2026-06-30', 83.2),
    A('n4', '2026-02-13', 27252.6), A('n4', '2026-03-09', 27252.6), A('n4', '2026-06-30', 27252.6),
    A('n5', '2026-02-13', 45836.6), A('n5', '2026-03-09', 45920.4), A('n5', '2026-06-30', 46238.0),
    A('n7', '2026-02-13', 24209.0), A('n7', '2026-03-09', 24382.5), A('n7', '2026-06-30', 25186.0),
    ...[['k1', 1068], ['k2', 753], ['k3', 832], ['k4', 547], ['k5', 843], ['wp', 3023], ['ag', 118]]
      .flatMap(([id, e]) => [A(id, '2026-02-13', 3), A(id, '2026-06-30', e)]),
  ],
  mieterstromTarife: [{ name: 'Bewohnerstrom', gueltigAb: '2026-02-13', gueltigBis: '2026-12-31', grundpreisJahr: 164.40, arbeitspreisCt: 27.00 }],
  wegTarife: [{ name: 'Durchleitung Lieferantenpreis', gueltigAb: '2026-02-13', gueltigBis: '2026-12-31', grundpreisJahr: 178.80, arbeitspreisCt: 29.95 }],
  lieferantenVertraege: [
    { id: 'enbw', lieferant: 'Grundversorger', gueltigAb: '2026-02-13', gueltigBis: '2026-03-09', grundpreisNettoJahr: 170.28, arbeitspreisNettoCt: 29.72, stromsteuerCt: 0, p14aNettoJahr: 0, ustProzent: 19 },
    { id: 'sws', lieferant: 'Stadtwerk', gueltigAb: '2026-03-10', gueltigBis: '2026-12-31', grundpreisNettoJahr: 150.25, arbeitspreisNettoCt: 23.1181, stromsteuerCt: 2.05, p14aNettoJahr: 143.43, ustProzent: 19 },
  ],
  abschlaege: [
    { zuordnung: 'k1', datum: '2026-06-30', betrag: 324.80 },
    { zuordnung: 'k2', datum: '2026-06-30', betrag: 320.00 },
    { zuordnung: 'k3', datum: '2026-06-30', betrag: 234.80 },
    { zuordnung: 'k4', datum: '2026-06-30', betrag: 167.30 },
    { zuordnung: 'k5', datum: '2026-06-30', betrag: 261.80 },
    { zuordnung: 'enbw', datum: '2026-03-01', betrag: 109.36 },
    ...['03', '04', '05', '06'].map((m) => ({ zuordnung: 'sws', datum: `2026-${m}-15`, betrag: 473 })),
  ],
};

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

const res = abrechnung(data, '2026-02-13', '2026-06-30');

t('Mieterstrom-Kunden wie Abrechnungen vom 27.07.2026', () => {
  const erwartet = { k1: [1065, 349.26, -24.46], k2: [750, 264.21, 55.79], k3: [829, 285.54, -50.74], k4: [544, 208.59, -41.29], k5: [840, 288.51, -26.71] };
  for (const k of res.kunden) {
    const [kwh, gesamt, ergebnis] = erwartet[k.zaehler.id];
    assert.equal(k.tage, 137);
    assert.equal(k.kwh, kwh);
    assert.equal(k.positionen[0].kostenGrund, 61.71);
    assert.equal(k.gesamt, gesamt, k.zaehler.id);
    assert.equal(k.ergebnis, ergebnis, k.zaehler.id);
  }
});

t('Heizung und Allgemeinstrom, Grundpreis nach Verbrauch geteilt', () => {
  const wp = res.weg.find((e) => e.zaehler.id === 'wp');
  const ag = res.weg.find((e) => e.zaehler.id === 'ag');
  assert.equal(wp.kwh, 3020); assert.equal(ag.kwh, 115);
  assert.equal(wp.positionen[0].kostenVerbrauch, 904.49);
  assert.equal(wp.positionen[0].kostenGrund, 64.65);
  assert.equal(ag.positionen[0].kostenGrund, 2.46);
  assert.equal(wp.gesamt, 969.14); assert.equal(ag.gesamt, 36.90);
});

t('Lieferant: Grundversorger 13.02.–09.03. nach MK13', () => {
  const v = res.lieferant.vertraege[0];
  assert.equal(v.tage, 25); assert.equal(v.bezug, 270); assert.equal(v.summeAbzug, 257.3); assert.equal(v.menge, 12.7);
  assert.equal(v.netto, 15.43); assert.equal(v.brutto, 18.36); assert.equal(v.ergebnis, 91.00);
});

t('Lieferant: Stadtwerk 10.03.–30.06. nach MK13 (korrigierte Rechnung)', () => {
  const v = res.lieferant.vertraege[1];
  assert.equal(v.tage, 113); assert.equal(v.bezug, 3790); assert.equal(v.menge, 2668.9);
  assert.deepEqual(v.positionen.map((p) => p.betrag), [46.52, 617.00, 54.71, -44.40]);
  assert.equal(v.netto, 673.83); assert.equal(v.ust, 128.03); assert.equal(v.brutto, 801.86);
  assert.equal(v.abschlaege, 1892); assert.equal(v.ergebnis, 1090.14);
});

t('Lieferantenwechsel mitten im Zeitraum wird in Abschnitte geteilt', () => {
  const d = structuredClone(data);
  d.lieferantenVertraege[1].gueltigBis = '2026-12-31';
  d.lieferantenVertraege.push({ id: 'neu', gueltigAb: '2027-01-01', grundpreisNettoJahr: 100, arbeitspreisNettoCt: 20, stromsteuerCt: 2.05, ustProzent: 19 });
  d.ablesungen.push(A('z1', '2027-06-30', 200), A('n4', '2027-06-30', 27252.6), A('n5', '2027-06-30', 47000), A('n7', '2027-06-30', 26500));
  const l = lieferantenSimulation(d, '2026-07-01', '2027-06-30');
  assert.equal(l.vertraege.length, 2);
  assert.equal(l.vertraege[0].bis, '2026-12-31'); assert.equal(l.vertraege[1].von, '2027-01-01');
  assert.equal(l.vertraege[0].tage + l.vertraege[1].tage, 365);
  assert.ok(l.warnungen.some((w) => w.includes('Geschätzte')), 'Stichtag 31.12. muss als geschätzt markiert sein');
});

t('Interpolation fehlender Stände', () => {
  const s = standAmEnde({ ablesungen: [A('x', '2026-01-01', 0), A('x', '2026-01-11', 100)] }, 'x', '2026-01-06');
  assert.equal(s.stand, 50); assert.equal(s.geschaetzt, true);
});

t('Warnung bei fehlendem Tarif', () => {
  const r = abrechnung(data, '2026-01-01', '2026-06-30');
  assert.ok(r.warnungen.some((w) => w.startsWith('Kein Mieterstromtarif für 2026-01-01')));
});

t('90-%-Grenze und Rechnungsnummer', () => {
  const p = preisgrenze({ grundpreisJahr: 164.40, arbeitspreisCt: 27 }, { grundpreisJahr: 202.68, arbeitspreisCt: 35.37 });
  assert.equal(p.eingehalten, true);
  assert.equal(rechnungsnummer(data, data.zaehler[4], '2026-06-30'), 'RE2026-1-01');
  assert.equal(daysIncl('2026-03-10', '2026-06-30'), 113);
});

console.log(`\n${n} Tests bestanden.`);
