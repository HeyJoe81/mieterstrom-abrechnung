// Frei erfundenes Beispielobjekt zum Ausprobieren. Enthält keine echten Personen oder Zähler.
export function beispielDaten() {
  const A = (zaehlerId, datum, stand, quelle = 'Beispiel') => ({ id: `${zaehlerId}-${datum}`, zaehlerId, register: '1.8.0', datum, stand, quelle });
  const kunde = (id, whg, name, nr, ende) => ({ id, typ: 'mieterstrom', bezeichnung: `Wohnung ${whg}`, wohnung: String(whg), nummer: `1XXX00000000${whg}`, faktor: 1, kundeName: name, kundeAdresse: 'Musterweg 1\n12345 Musterstadt', anrede: 'Sehr geehrte Damen und Herren,', rechnungsNr: nr, aktiv: true, _ende: ende });
  const kunden = [kunde('k1', 1, 'Familie Beispiel', 1, 1068), kunde('k2', 2, 'Erika Muster', 2, 753), kunde('k3', 3, 'Max Mustermann', 3, 832)];
  const zaehler = [
    { id: 'z1', typ: 'uebergabe', bezeichnung: 'Übergabezähler', nummer: '1XXX0000000001', faktor: 50, aktiv: true },
    ...kunden.map(({ _ende, ...k }) => k),
    { id: 'n4', typ: 'marktteilnehmer', bezeichnung: 'Wohnung 4 (eigener Lieferant)', wohnung: '4', nummer: '10000004', faktor: 1, aktiv: true },
    { id: 'n5', typ: 'marktteilnehmer', bezeichnung: 'Wohnung 5 (eigener Lieferant)', wohnung: '5', nummer: '10000005', faktor: 1, aktiv: true },
    { id: 'wp', typ: 'weg', bezeichnung: 'Heizstrom', nummer: '1XXX0000000009', faktor: 1, kundeName: 'WEG Musterweg 1', rechnungsNr: 9, aktiv: true },
    { id: 'ag', typ: 'weg', bezeichnung: 'Allgemeinstrom', nummer: '1XXX0000000010', faktor: 1, kundeName: 'WEG Musterweg 1', rechnungsNr: 10, aktiv: true },
  ];
  const ablesungen = [
    A('z1', '2026-02-13', 2.0), A('z1', '2026-03-09', 7.4), A('z1', '2026-06-30', 70.0),
    A('n4', '2026-02-13', 45836.6), A('n4', '2026-03-09', 45920.4), A('n4', '2026-06-30', 46238.0),
    A('n5', '2026-02-13', 24209.0), A('n5', '2026-03-09', 24382.5), A('n5', '2026-06-30', 25186.0),
    ...kunden.flatMap((k) => [A(k.id, '2026-02-13', 3, 'Einbau'), A(k.id, '2026-06-30', k._ende)]),
    A('wp', '2026-02-13', 3, 'Einbau'), A('wp', '2026-06-30', 3023), A('ag', '2026-02-13', 3, 'Einbau'), A('ag', '2026-06-30', 118),
  ];
  const abschlaege = [];
  const monate = ['02', '03', '04', '05', '06'];
  [['k1', 64.96], ['k2', 64], ['k3', 46.96]].forEach(([z, b]) => monate.forEach((m) => abschlaege.push({ id: `${z}-${m}`, zuordnung: z, datum: `2026-${m}-15`, betrag: b, bezeichnung: 'Abschlag' })));
  ['03', '04', '05', '06'].forEach((m) => abschlaege.push({ id: `sw-${m}`, zuordnung: 'sw', datum: `2026-${m}-15`, betrag: 400, bezeichnung: 'Abschlag' }));
  abschlaege.push({ id: 'gv-1', zuordnung: 'gv', datum: '2026-03-01', betrag: 100, bezeichnung: 'Abschlag' });
  return {
    format: 'mieterstrom-abrechnung', version: 1,
    objekt: {
      name: 'WEG Musterweg 1', adresse: 'Musterweg 1', ort: '12345 Musterstadt', betreiber: 'WEG Musterweg 1', absender: 'Muster Hausverwaltung GmbH',
      absenderZeile: 'WEG Musterweg 1 · vertreten durch Muster Hausverwaltung GmbH · Verwalterstraße 2 · 12345 Musterstadt',
      rechnungsPrefix: 'RE', tageZaehlung: 'differenz', abrechnungBeginn: '01.07.',
      grundversorgung: { arbeitspreisCt: 35.37, grundpreisJahr: 202.68 },
      textMieterstrom: 'Das Abrechnungsergebnis wird mit dem vorliegenden SEPA-Mandat verrechnet.', textWeg: '',
    },
    zaehler, ablesungen, abschlaege,
    mieterstromTarife: [{ id: 't1', name: 'Bewohnerstrom Musterweg', gueltigAb: '2026-02-13', gueltigBis: '2026-12-31', grundpreisJahr: 164.40, arbeitspreisCt: 27.00, hinweis: 'Eine Preisgarantie gilt bis zum 31.12.2026.' }],
    wegTarife: [{ id: 'w1', name: 'Durchleitung Lieferantenpreis', gueltigAb: '2026-02-13', gueltigBis: '2026-12-31', grundpreisJahr: 178.80, arbeitspreisCt: 29.95 }],
    lieferantenVertraege: [
      { id: 'gv', lieferant: 'Grundversorger', tarif: 'Grundversorgung', gueltigAb: '2026-02-13', gueltigBis: '2026-03-09', grundpreisNettoJahr: 170.28, arbeitspreisNettoCt: 29.72, stromsteuerCt: 0, p14aNettoJahr: 0, ustProzent: 19 },
      { id: 'sw', lieferant: 'Stadtwerk Muster', tarif: 'Ökostrom 12', gueltigAb: '2026-03-10', gueltigBis: '2026-12-31', grundpreisNettoJahr: 150.25, arbeitspreisNettoCt: 23.1181, stromsteuerCt: 2.05, p14aNettoJahr: 143.43, ustProzent: 19 },
    ],
    perioden: [],
  };
}
