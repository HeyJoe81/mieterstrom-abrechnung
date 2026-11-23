// Abrechnungsdokumente als druckfertiges HTML. "Als PDF sichern" im Druckdialog erzeugt die PDF.
import { rechnungsnummer } from './calc.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eur = (x) => Number(x).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const num = (x, d = 1) => Number(x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const ct = (x) => num(x, 2) + ' ct/kWh';
const dat = (d) => (d ? d.split('-').reverse().join('.') : '');
const br = (s) => esc(s).replace(/\n/g, '<br>');

const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 22mm; }
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 10pt; color: #1c1c1c; margin: 0; line-height: 1.4; }
.page { page-break-after: always; position: relative; min-height: 250mm; }
.page:last-child { page-break-after: auto; }
.absz { font-size: 7.5pt; color: #555; border-bottom: .5px solid #999; display: inline-block; margin: 8mm 0 2mm; }
.kopf { display: flex; justify-content: space-between; gap: 10mm; align-items: flex-start; }
.adr { min-height: 30mm; }
.meta { text-align: right; font-size: 9pt; white-space: nowrap; }
.meta div { margin-bottom: 1mm; }
h1 { font-size: 13pt; margin: 8mm 0 4mm; }
h2 { font-size: 10.5pt; margin: 5mm 0 1.5mm; padding-bottom: 1mm; border-bottom: 1px solid #1c1c1c; }
table { width: 100%; border-collapse: collapse; margin-top: 1mm; }
th, td { padding: 1.2mm 1.6mm; text-align: left; vertical-align: top; }
th { font-weight: 600; color: #444; border-bottom: .6px solid #999; font-size: 9pt; }
td { border-bottom: .4px solid #ddd; }
.r { text-align: right; white-space: nowrap; }
.nw { white-space: nowrap; }
tr.sum td { font-weight: 700; border-top: 1px solid #1c1c1c; border-bottom: none; }
tr.sub td { font-weight: 600; }
.ergebnis { margin-top: 5mm; border: 1.5px solid #1c1c1c; padding: 3mm 4mm; display: flex; justify-content: space-between; font-size: 12pt; font-weight: 700; }
.tarif { margin: 3mm 0; padding: 2mm 4mm; background: #f4f5f7; }
.note { margin-top: 4mm; font-size: 8.5pt; color: #444; }
.gruss { margin-top: 8mm; }
.foot { position: absolute; bottom: 0; left: 0; right: 0; font-size: 7.5pt; color: #777; border-top: .5px solid #ccc; padding-top: 1.5mm; }
.draft { position: absolute; top: 0; right: 0; font-size: 8pt; font-weight: 600; color: #a33; border: 1px solid #a33; padding: 1mm 3mm; letter-spacing: .08em; }
@media screen { body { background: #e9ebee; } .page { background: #fff; width: 210mm; min-height: 297mm; margin: 10mm auto; padding: 18mm 18mm 16mm 22mm; box-shadow: 0 1px 4px rgba(0,0,0,.15); } .foot { left: 22mm; right: 18mm; bottom: 12mm; } .draft { top: 10mm; right: 18mm; } }
`;

export function druckeDokumente(seiten, titel) {
  const w = window.open('', '_blank');
  if (!w) { alert('Bitte Pop-ups für diese Seite erlauben, damit das Dokument geöffnet werden kann.'); return; }
  w.document.open();
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(titel)}</title><style>${CSS}</style></head><body>${seiten.join('')}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

function kopf(o, empfaengerName, empfaengerAdresse, meta) {
  return `<div class="absz">${esc(o.absenderZeile || [o.betreiber, o.absender].filter(Boolean).join(' · '))}</div>
  <div class="kopf"><div class="adr">${esc(empfaengerName)}<br>${br(empfaengerAdresse || [o.adresse, o.ort].filter(Boolean).join('\n'))}</div>
  <div class="meta">${meta.map(([k, v]) => `<div>${esc(k)}: <b>${esc(v)}</b></div>`).join('')}</div></div>`;
}

function positionsTabelle(k, mitAnteil = false) {
  const rows = k.positionen.map((p) => `
    <tr><td class="nw">${dat(p.von)} – ${dat(p.bis)}</td><td class="r">${p.tage}</td><td class="r">${num(p.anfang, 1)}</td><td class="r">${num(p.ende, 1)}</td><td class="r">${num(p.kwh, 1)} kWh</td><td class="r">${ct(p.arbeitspreisCt)}</td><td class="r">${eur(p.kostenVerbrauch)}</td></tr>`).join('');
  const grund = k.positionen.map((p) => `
    <tr><td colspan="5">Grundpreis ${eur(p.grundpreisJahr)}/Jahr${mitAnteil ? `, Anteil ${num(p.anteil * 100, 1)} % von ${eur(p.grundpreisGesamt)}` : ''} für ${p.tage} Tage (${dat(p.von)} – ${dat(p.bis)})</td><td></td><td class="r">${eur(p.kostenGrund)}</td></tr>`).join('');
  return `<table>
    <tr><th>Zeitraum</th><th class="r">Tage</th><th class="r">Stand Beginn</th><th class="r">Stand Ende</th><th class="r">Verbrauch</th><th class="r">Arbeitspreis</th><th class="r">Betrag</th></tr>
    ${rows}${grund}
    <tr class="sum"><td colspan="6">Gesamtkosten (inkl. 19 % USt)</td><td class="r">${eur(k.gesamt)}</td></tr>
    ${k.abschlaege ? `<tr><td colspan="6">abzüglich geleistete Vorauszahlungen</td><td class="r">−${eur(k.abschlaege)}</td></tr>` : ''}
  </table>
  <div class="ergebnis"><span>${!k.abschlaege ? 'Rechnungsbetrag' : k.ergebnis >= 0 ? 'Guthaben' : 'Nachzahlung'}</span><span>${eur(Math.abs(k.ergebnis))}</span></div>`;
}

function tarifBox(k) {
  const seen = new Set();
  return k.positionen
    .filter((p) => !seen.has(p.tarif + p.arbeitspreisCt) && seen.add(p.tarif + p.arbeitspreisCt))
    .map((p) => `<div class="tarif">Tarif: <b>${esc(p.tarif || '')}</b> · Grundpreis ${eur(p.grundpreisJahr)}/Jahr · Arbeitspreis ${ct(p.arbeitspreisCt)} (${dat(p.von)} – ${dat(p.bis)})</div>`)
    .join('');
}

function hinweise(data, k, liste) {
  const ids = new Set(k.positionen.map((p) => p.tarif));
  return (liste || []).filter((t) => ids.has(t.name) && t.hinweis).map((t) => esc(t.hinweis)).join(' ');
}

export function docMieterstrom(ctx, k) {
  const { data, lauf, rechnungsdatum } = ctx; const o = data.objekt; const z = k.zaehler;
  const nr = rechnungsnummer(data, z, k.bis, lauf);
  const hw = hinweise(data, k, data.mieterstromTarife);
  return `<section class="page">
  ${kopf(o, z.kundeName || z.bezeichnung, z.kundeAdresse, [['Rechnungsnummer', nr], ['Datum', dat(rechnungsdatum)], ['Zähler', z.nummer || '–']])}
  <h1>Abrechnung Mieterstrom ${esc(o.name)}</h1>
  <p>${esc(z.anrede || 'Sehr geehrte Damen und Herren,')}</p>
  <p>anbei erhalten Sie das Abrechnungsergebnis für den Zeitraum <b>${dat(k.von)} – ${dat(k.bis)}</b>${z.wohnung ? ` (Wohnung ${esc(z.wohnung)})` : ''}.</p>
  ${tarifBox(k)}${hw ? `<p class="note">${hw}</p>` : ''}
  ${positionsTabelle(k)}
  ${o.textMieterstrom ? `<p class="note">${br(o.textMieterstrom)}</p>` : ''}
  <p class="gruss">Wir bedanken uns und verbleiben mit freundlichen Grüßen<br><br>${esc(o.absender || o.betreiber)}</p>
  <p class="note">Dieses Schreiben ist maschinell erstellt und ohne Unterschrift gültig. Alle Preise enthalten 19 % Umsatzsteuer.</p>
  <div class="foot">${esc(o.betreiber || o.name)} · Mieterstrom ${dat(k.von)} – ${dat(k.bis)} · ${esc(nr)}</div>
  </section>`;
}

export function docWeg(ctx, k) {
  const { data, lauf, rechnungsdatum } = ctx; const o = data.objekt; const z = k.zaehler;
  const nr = rechnungsnummer(data, z, k.bis, lauf);
  const hw = hinweise(data, k, data.wegTarife);
  return `<section class="page">
  ${kopf(o, z.kundeName || `${z.bezeichnung} ${o.name}`, z.kundeAdresse, [['Rechnungsnummer', nr], ['Datum', dat(rechnungsdatum)], ['Zähler', z.nummer || '–']])}
  <h1>Abrechnung ${esc(z.bezeichnung)} ${esc(o.name)}</h1>
  <p>Abrechnungsergebnis für den Zeitraum <b>${dat(k.von)} – ${dat(k.bis)}</b>.</p>
  ${tarifBox(k)}${hw ? `<p class="note">${hw}</p>` : ''}
  ${positionsTabelle(k, true)}
  <p class="note">Der Grundpreis fällt je Zeitraum einmal an und wird nach Verbrauch auf die WEG-eigenen Verbraucher (z. B. Heizung und Allgemeinstrom) aufgeteilt.</p>
  ${o.textWeg ? `<p class="note">${br(o.textWeg)}</p>` : ''}
  <p class="gruss">${esc(o.absender || o.betreiber)}</p>
  <p class="note">Dieses Schreiben ist maschinell erstellt und ohne Unterschrift gültig. Alle Preise enthalten 19 % Umsatzsteuer.</p>
  <div class="foot">${esc(o.name)} · ${esc(z.bezeichnung)} ${dat(k.von)} – ${dat(k.bis)} · ${esc(nr)}</div>
  </section>`;
}

export function docLieferant(ctx, v) {
  const { data, rechnungsdatum } = ctx; const o = data.objekt; const t = v.vertrag;
  const zl = (z, x, minus) => `<tr><td>${esc(z.nummer || '')}</td><td>${minus ? 'abzgl. ' : ''}${esc(z.bezeichnung || '')}${z.wohnung ? ` (Whg ${esc(z.wohnung)})` : ''}</td><td class="r">${x.anfang ? num(x.anfang.stand, 1) : '–'}</td><td class="r">${x.ende ? num(x.ende.stand, 1) : '–'}</td><td class="r">${num(z.faktor || 1, 0)}</td><td class="r">${minus ? '−' : ''}${num(x.kwh ?? 0, 1)} kWh</td></tr>`;
  const pos = v.positionen.map((p) => `<tr><td>${esc(p.text)}</td><td class="r">${typeof p.menge === 'number' ? num(p.menge, 1) + ' kWh' : esc(p.menge)}</td><td class="r">${p.einheit === 'ct/kWh' ? num(p.preis, 4) : num(p.preis, 2)} ${esc(p.einheit)}</td><td class="r">${eur(p.betrag)}</td></tr>`).join('');
  return `<section class="page">
  <div class="draft">ENTWURF · PROFORMA</div>
  <div class="absz">${esc(o.absenderZeile || [o.name, o.absender].filter(Boolean).join(' · '))}</div>
  <h1>Proforma-Nachberechnung Reststrombezug</h1>
  <p>Interne Simulation der Lieferantenrechnung nach Messkonzept 13. <b>Keine Rechnung des Lieferanten.</b></p>
  <table>
    <tr><td>Lieferant</td><td>${esc(t.lieferant)}</td><td>Lieferadresse</td><td>${esc([o.adresse, o.ort].filter(Boolean).join(', '))}</td></tr>
    <tr><td>Tarif</td><td>${esc(t.tarif || '')}</td><td>Zähler</td><td>${esc(v.uebergabe.zaehler.nummer || '')} (Faktor ${num(v.uebergabe.zaehler.faktor || 1, 0)})</td></tr>
    <tr><td>Vertrags-/Kundennr.</td><td>${esc([t.vertragsnr, t.kundennr].filter(Boolean).join(' / '))}</td><td>Zeitraum</td><td>${dat(v.von)} – ${dat(v.bis)} (${v.tage} Tage)</td></tr>
    <tr><td>Erstellt am</td><td>${dat(rechnungsdatum)}</td><td></td><td></td></tr>
  </table>
  <h2>1. Verbrauchsermittlung nach Messkonzept 13</h2>
  <table>
    <tr><th>Zähler</th><th>Messstelle</th><th class="r">Stand Beginn</th><th class="r">Stand Ende</th><th class="r">Faktor</th><th class="r">Verbrauch</th></tr>
    ${zl(v.uebergabe.zaehler, v.uebergabe, false)}
    ${v.abzuege.map((a) => zl(a.zaehler, a, true)).join('')}
    <tr class="sum"><td colspan="5">Abrechenbare Menge (Bezug − Σ Nicht-Teilnehmer)</td><td class="r">${num(v.menge, 1)} kWh</td></tr>
  </table>
  <h2>2. Verbrauchsabrechnung</h2>
  <table>
    <tr><th>Position</th><th class="r">Menge</th><th class="r">Preis netto</th><th class="r">Betrag</th></tr>
    ${pos}
    <tr class="sub"><td colspan="3">Summe netto</td><td class="r">${eur(v.netto)}</td></tr>
    <tr><td colspan="3">zzgl. ${num(v.ustProzent, 0)} % Umsatzsteuer</td><td class="r">${eur(v.ust)}</td></tr>
    <tr class="sum"><td colspan="3">Summe brutto</td><td class="r">${eur(v.brutto)}</td></tr>
    <tr><td colspan="3">abzgl. geleistete Abschläge</td><td class="r">−${eur(v.abschlaege)}</td></tr>
    <tr class="sum"><td colspan="3">${v.ergebnis >= 0 ? 'Guthaben' : 'Nachzahlung'}</td><td class="r">${eur(Math.abs(v.ergebnis))}</td></tr>
  </table>
  <p class="note"><b>Grundlage:</b> Messkonzept 13 (Mieterstrom mit einer Sammelschiene). Dem Lieferanten ist nur der Bezug am Übergabezähler abzüglich des Verbrauchs der Nicht-Teilnehmer zu berechnen, die über eigene Lieferanten versorgt werden. Tage werden wie beim Versorger inklusiv gezählt, Beträge je Position auf Cent gerundet.</p>
  <div class="foot">${esc(o.name)} · Proforma Reststrom ${dat(v.von)} – ${dat(v.bis)} · Entwurf</div>
  </section>`;
}
