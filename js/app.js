import { abrechnung, leereDaten, preisgrenze, addDays, standAmEnde, rechnungsnummer } from './calc.js';
import { druckeDokumente, docMieterstrom, docWeg, docLieferant } from './docs.js';
import { beispielDaten } from './beispiel.js';

// ---------- Zustand ----------
const S = { data: null, handle: null, dateiname: null, dirty: false, tab: 'abrechnung', periode: null, lauf: 1, datum: heute(), ablesungZaehler: null };

function heute() { return new Date().toISOString().slice(0, 10); }
const uid = () => Math.random().toString(36).slice(2, 9);
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const eur = (x) => (x == null || isNaN(x) ? '–' : Number(x).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const num = (x, d = 1) => (x == null || isNaN(x) ? '–' : Number(x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const dat = (d) => (d ? d.split('-').reverse().join('.') : '');
const TYPEN = { uebergabe: 'Übergabezähler (Netz)', mieterstrom: 'Mieterstrom-Kunde', marktteilnehmer: 'Nicht-Teilnehmer (eigener Lieferant)', weg: 'WEG-eigen (Heizung, Allgemein)', pv: 'PV-Erzeugung (nur Info)' };

function markDirty() { S.dirty = true; status(); }
function status() {
  $('#objektTitel').textContent = S.data ? `${S.data.objekt.name || 'Unbenanntes Objekt'}${S.dateiname ? ' · ' + S.dateiname : ''}` : 'keine Datei geöffnet';
  $('#status').textContent = S.dirty ? 'Ungespeicherte Änderungen' : (S.data ? 'Gespeichert' : '');
  $('#status').style.color = S.dirty ? 'var(--bad)' : '';
}
window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Datei laden / speichern ----------
const fsApi = 'showOpenFilePicker' in window;
const pickerOpts = { types: [{ description: 'Mieterstrom-Daten', accept: { 'application/json': ['.json'] } }] };

function laden(text, name, handle = null) {
  let d;
  try { d = JSON.parse(text); } catch { alert('Die Datei ist keine gültige JSON-Datei.'); return; }
  if (d.format !== 'mieterstrom-abrechnung') { if (!confirm('Die Datei sieht nicht wie eine Mieterstrom-Datei aus. Trotzdem öffnen?')) return; }
  S.data = { ...leereDaten(), ...d, objekt: { ...leereDaten().objekt, ...(d.objekt || {}) } };
  S.handle = handle; S.dateiname = name; S.dirty = false; S.periode = null;
  render();
}

$('#btnOeffnen').onclick = async () => {
  if (S.dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
  if (fsApi) {
    try {
      const [h] = await window.showOpenFilePicker(pickerOpts);
      const f = await h.getFile();
      laden(await f.text(), f.name, h);
    } catch (e) { if (e.name !== 'AbortError') alert(e.message); }
  } else $('#fileInput').click();
};
$('#fileInput').onchange = async (e) => { const f = e.target.files[0]; if (f) laden(await f.text(), f.name); e.target.value = ''; };

async function speichern(unter = false) {
  if (!S.data) return;
  S.data.geaendert = new Date().toISOString();
  const text = JSON.stringify(S.data, null, 2);
  const vorschlag = S.dateiname || `${(S.data.objekt.name || 'objekt').replace(/[^\wäöüÄÖÜß -]/g, '')}.mieterstrom.json`;
  try {
    if (fsApi) {
      if (!S.handle || unter) S.handle = await window.showSaveFilePicker({ ...pickerOpts, suggestedName: vorschlag });
      const w = await S.handle.createWritable(); await w.write(text); await w.close();
      S.dateiname = S.handle.name;
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = vorschlag; a.click(); URL.revokeObjectURL(a.href);
      S.dateiname = vorschlag;
    }
    S.dirty = false; status();
  } catch (e) { if (e.name !== 'AbortError') alert('Speichern fehlgeschlagen: ' + e.message); }
}
$('#btnSpeichern').onclick = () => speichern(false);
$('#btnSpeichernUnter').onclick = () => speichern(true);
$('#btnNeu').onclick = () => {
  if (S.dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
  S.data = leereDaten(); S.handle = null; S.dateiname = null; S.dirty = true; S.tab = 'objekt'; render();
};
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); speichern(); } });

// ---------- Tabs ----------
$('#tabs').onclick = (e) => { const b = e.target.closest('button[data-tab]'); if (!b) return; S.tab = b.dataset.tab; render(); };

function render() {
  status();
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab));
  const main = $('#main');
  if (!S.data) { main.innerHTML = startseite(); bindStart(); return; }
  main.innerHTML = '';
  ({ abrechnung: tabAbrechnung, zaehler: tabZaehler, tarife: tabTarife, abschlaege: tabAbschlaege, objekt: tabObjekt })[S.tab](main);
}

function startseite() {
  return `<div class="card empty">
    <h2>Willkommen</h2>
    <p>Öffnen Sie die Datendatei Ihres Objekts (z. B. aus dem OneDrive) oder legen Sie ein neues Objekt an. Je Objekt gibt es eine eigene Datei mit Zählern, Ablesungen, Tarifen und Abschlägen.</p>
    <div class="row" style="justify-content:center">
      <button class="primary" id="sOpen">Datei öffnen …</button>
      <button id="sNeu">Neues Objekt</button>
      <button id="sDemo">Beispiel ansehen</button>
    </div>
    <p class="hint">${fsApi ? 'In Chrome und Edge speichert die App direkt in die geöffnete Datei.' : 'In diesem Browser lädt „Speichern“ eine neue Datei herunter. Für direktes Speichern Chrome oder Edge verwenden.'}</p>
  </div>`;
}
function bindStart() {
  $('#sOpen').onclick = () => $('#btnOeffnen').click();
  $('#sNeu').onclick = () => $('#btnNeu').click();
  $('#sDemo').onclick = () => { laden(JSON.stringify(beispielDaten()), null); S.dateiname = null; S.dirty = false; status(); };
}

// ---------- Generischer Tabelleneditor ----------
// cols: [{key, label, type: text|number|date|select|check|textarea, options:[[value,label]], width}]
function editTable(rows, cols, { onChange, onDelete, leer = 'Noch keine Einträge.' } = {}) {
  const wrap = document.createElement('div'); wrap.className = 'tbl-wrap';
  if (!rows.length) { wrap.innerHTML = `<p class="hint">${leer}</p>`; return wrap; }
  const t = document.createElement('table'); t.className = 'edit';
  t.innerHTML = `<thead><tr>${cols.map((c) => `<th${c.type === 'number' ? ' class="r"' : ''}>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>`;
  const tb = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => {
      const td = document.createElement('td');
      let el;
      if (c.type === 'select') {
        el = document.createElement('select');
        el.innerHTML = c.options.map(([v, l]) => `<option value="${esc(v)}"${String(row[c.key] ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
      } else if (c.type === 'textarea') {
        el = document.createElement('textarea'); el.value = row[c.key] ?? ''; el.rows = 2; el.style.minHeight = '0';
      } else if (c.type === 'check') {
        el = document.createElement('input'); el.type = 'checkbox'; el.checked = row[c.key] !== false; el.style.width = 'auto';
      } else {
        el = document.createElement('input'); el.type = c.type || 'text';
        if (c.type === 'number') el.step = 'any';
        el.value = row[c.key] ?? '';
      }
      if (c.width) el.style.minWidth = c.width;
      el.onchange = () => {
        row[c.key] = c.type === 'check' ? el.checked : c.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
        markDirty(); onChange && onChange(row, c.key);
      };
      td.appendChild(el); tr.appendChild(td);
    });
    const td = document.createElement('td');
    const del = document.createElement('button'); del.className = 'small'; del.textContent = 'Löschen'; del.type = 'button';
    del.onclick = () => { if (!confirm('Eintrag löschen?')) return; rows.splice(rows.indexOf(row), 1); markDirty(); onDelete ? onDelete(row) : render(); };
    td.appendChild(del); tr.appendChild(td); tb.appendChild(tr);
  });
  t.appendChild(tb); wrap.appendChild(t);
  return wrap;
}

function card(title, hint = '') {
  const c = document.createElement('section'); c.className = 'card';
  c.innerHTML = `<h2>${esc(title)}</h2>${hint ? `<p class="hint">${hint}</p>` : ''}`;
  return c;
}
function button(label, onclick, cls = '') { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = cls; b.onclick = onclick; return b; }

const zaehlerName = (z) => [z.bezeichnung, z.kundeName].filter(Boolean).join(' · ') || z.nummer || z.id;

// ---------- Tab: Objekt ----------
function tabObjekt(main) {
  const o = S.data.objekt;
  const c = card('Objekt', 'Diese Angaben erscheinen auf den Abrechnungen.');
  const f = (key, label, type = 'text', obj = o) => `<label>${label}${type === 'textarea' ? `<textarea data-k="${key}">${esc(obj[key])}</textarea>` : `<input data-k="${key}" type="${type}" value="${esc(obj[key])}">`}</label>`;
  c.insertAdjacentHTML('beforeend', `<div class="grid2">
    ${f('name', 'Name des Objekts (z. B. WEG Musterstraße 1)')}
    ${f('adresse', 'Straße und Hausnummer')}
    ${f('ort', 'PLZ und Ort')}
    ${f('betreiber', 'Mieterstrom-Anbieter (z. B. WEG …)')}
    ${f('absender', 'Absender / Unterschrift (z. B. Verwalter)')}
    ${f('absenderZeile', 'Absenderzeile über der Anschrift')}
    ${f('rechnungsPrefix', 'Präfix Rechnungsnummer (z. B. RE)')}
    <label>Tageszählung Mieterstrom und WEG
      <select data-k="tageZaehlung">
        <option value="differenz"${o.tageZaehlung === 'differenz' ? ' selected' : ''}>Ende minus Beginn (wie bisherige Excel, 13.02.–30.06. = 137 Tage)</option>
        <option value="inklusiv"${o.tageZaehlung === 'inklusiv' ? ' selected' : ''}>Inklusiv wie Versorger (13.02.–30.06. = 138 Tage)</option>
      </select></label>
    ${f('abrechnungBeginn', 'Beginn des Abrechnungsjahres (TT.MM., z. B. 01.07.)')}
  </div>
  <h3>Texte auf den Abrechnungen</h3>
  <div class="grid2">
    ${f('textMieterstrom', 'Schlusstext Mieterstrom (z. B. Abschläge, SEPA-Einzug)', 'textarea')}
    ${f('textWeg', 'Schlusstext Heizung / Allgemeinstrom', 'textarea')}
  </div>
  <h3>Grundversorgung zum Vergleich (90-%-Grenze)</h3>
  <div class="row">
    <label>Arbeitspreis brutto ct/kWh<input data-gv="arbeitspreisCt" type="number" step="any" value="${esc(o.grundversorgung?.arbeitspreisCt)}"></label>
    <label>Grundpreis brutto €/Jahr<input data-gv="grundpreisJahr" type="number" step="any" value="${esc(o.grundversorgung?.grundpreisJahr)}"></label>
  </div>`);
  c.querySelectorAll('[data-k]').forEach((el) => el.onchange = () => { o[el.dataset.k] = el.value; markDirty(); });
  c.querySelectorAll('[data-gv]').forEach((el) => el.onchange = () => { o.grundversorgung = o.grundversorgung || {}; o.grundversorgung[el.dataset.gv] = el.value === '' ? '' : Number(el.value); markDirty(); });
  main.appendChild(c);
}

// ---------- Tab: Zähler & Ablesungen ----------
function tabZaehler(main) {
  const d = S.data;
  const c1 = card('Zähler', 'Typ bestimmt die Rechnung: Mieterstrom-Kunden erhalten eine Abrechnung, Nicht-Teilnehmer werden nach Messkonzept 13 vom Bezug am Übergabezähler abgezogen, WEG-eigene Zähler (Heizung, Allgemein) werden zum Durchleitungspreis an die WEG verrechnet.');
  c1.appendChild(editTable(d.zaehler, [
    { key: 'bezeichnung', label: 'Bezeichnung', width: '130px' },
    { key: 'typ', label: 'Typ', type: 'select', options: Object.entries(TYPEN) },
    { key: 'nummer', label: 'Zählernummer', width: '130px' },
    { key: 'faktor', label: 'Faktor', type: 'number', width: '60px' },
    { key: 'wohnung', label: 'Whg', width: '50px' },
    { key: 'kundeName', label: 'Kunde / Empfänger', width: '160px' },
    { key: 'kundeAdresse', label: 'Anschrift', type: 'textarea', width: '160px' },
    { key: 'anrede', label: 'Anrede im Brief', width: '200px' },
    { key: 'rechnungsNr', label: 'Lfd. Nr.', type: 'number', width: '50px' },
    { key: 'aktiv', label: 'Aktiv', type: 'check' },
  ], { leer: 'Noch keine Zähler angelegt.' }));
  c1.appendChild(button('+ Zähler', () => { d.zaehler.push({ id: uid(), bezeichnung: '', typ: 'mieterstrom', faktor: 1, aktiv: true, rechnungsNr: d.zaehler.length + 1 }); markDirty(); render(); }));
  main.appendChild(c1);

  // Erfassung zu einem Stichtag
  const c2 = card('Ablesung erfassen', 'Ein Stand gilt als Zählerstand am Ende des angegebenen Tages. Ein Stand am Tag vor Abrechnungsbeginn (z. B. 30.06.) dient als Anfangsstand der neuen Periode. Leere Felder werden übersprungen.');
  const aktiv = d.zaehler.filter((z) => z.aktiv !== false);
  c2.insertAdjacentHTML('beforeend', `<div class="row" style="margin-bottom:8px">
    <label>Datum<input id="abDatum" type="date" value="${S.datum}"></label>
    <label>Quelle<select id="abQuelle"><option>eigene Ablesung</option><option>Messstellenbetreiber</option><option>Netzbetreiber</option><option>Lieferantenrechnung</option><option>Einbau / Ausbau</option></select></label>
    <label>Register<select id="abReg"><option value="1.8.0">1.8.0 Bezug</option><option value="2.8.0">2.8.0 Einspeisung</option></select></label>
  </div>
  <div class="tbl-wrap"><table class="edit"><thead><tr><th>Zähler</th><th>Typ</th><th class="r">letzter Stand</th><th class="r">neuer Stand</th></tr></thead><tbody>
  ${aktiv.map((z) => { const l = letzte(z.id); return `<tr><td>${esc(zaehlerName(z))}</td><td class="muted">${esc(TYPEN[z.typ] || z.typ)}</td><td class="r">${l ? `${num(l.stand, 1)} <span class="muted">(${dat(l.datum)})</span>` : '–'}</td><td><input data-z="${z.id}" type="number" step="any" style="max-width:140px;margin-left:auto;display:block"></td></tr>`; }).join('')}
  </tbody></table></div>`);
  c2.appendChild(button('Stände übernehmen', () => {
    const datum = $('#abDatum').value; if (!datum) return alert('Bitte Datum wählen.');
    const quelle = $('#abQuelle').value, register = $('#abReg').value;
    let n = 0;
    c2.querySelectorAll('input[data-z]').forEach((el) => {
      if (el.value === '') return;
      d.ablesungen.push({ id: uid(), zaehlerId: el.dataset.z, register, datum, stand: Number(el.value), quelle });
      n++;
    });
    S.datum = datum;
    if (n) { markDirty(); render(); }
  }, 'primary'));
  main.appendChild(c2);

  // Historie
  const c3 = card('Historie der Ablesungen');
  if (!S.ablesungZaehler || !d.zaehler.find((z) => z.id === S.ablesungZaehler)) S.ablesungZaehler = d.zaehler[0]?.id;
  const sel = document.createElement('select'); sel.style.maxWidth = '360px';
  sel.innerHTML = d.zaehler.map((z) => `<option value="${z.id}"${z.id === S.ablesungZaehler ? ' selected' : ''}>${esc(zaehlerName(z))}</option>`).join('');
  sel.onchange = () => { S.ablesungZaehler = sel.value; render(); };
  c3.appendChild(sel);
  const z = d.zaehler.find((x) => x.id === S.ablesungZaehler);
  if (z) {
    const rows = d.ablesungen.filter((a) => a.zaehlerId === z.id).sort((a, b) => (a.datum + (a.register || '')).localeCompare(b.datum + (b.register || '')));
    const t = editTable(rows, [
      { key: 'datum', label: 'Datum', type: 'date' },
      { key: 'register', label: 'Register', type: 'select', options: [['1.8.0', '1.8.0 Bezug'], ['2.8.0', '2.8.0 Einspeisung']] },
      { key: 'stand', label: 'Stand', type: 'number' },
      { key: 'quelle', label: 'Quelle' },
      { key: 'bemerkung', label: 'Bemerkung' },
    ], { onDelete: (row) => { d.ablesungen.splice(d.ablesungen.indexOf(row), 1); render(); }, leer: 'Für diesen Zähler gibt es noch keine Ablesungen.' });
    // Verbrauch seit letzter Ablesung als Zusatzspalte
    const trs = t.querySelectorAll('tbody tr');
    t.querySelector('thead tr')?.insertAdjacentHTML('beforeend', '<th class="r">Verbrauch seit vorher</th>');
    let prev = {};
    rows.forEach((r, i) => {
      const reg = r.register || '1.8.0';
      const v = prev[reg] != null ? (Number(r.stand) - prev[reg]) * Number(z.faktor || 1) : null;
      prev[reg] = Number(r.stand);
      trs[i]?.insertAdjacentHTML('beforeend', `<td class="r">${v == null ? '' : num(v, 1) + ' kWh'}</td>`);
    });
    c3.appendChild(t);
  }
  main.appendChild(c3);
}
function letzte(zid) {
  return S.data.ablesungen.filter((a) => a.zaehlerId === zid && (a.register || '1.8.0') === '1.8.0').sort((a, b) => a.datum.localeCompare(b.datum)).pop();
}

// ---------- Tab: Tarife & Verträge ----------
function tabTarife(main) {
  const d = S.data;
  const gv = d.objekt.grundversorgung;
  const c1 = card('Mieterstromtarif (Preise brutto)', 'Tarif, den die Mieterstrom-Kunden zahlen. Bei Preisänderung einen neuen Eintrag mit neuem Gültigkeitsbeginn anlegen; der Zeitraum wird dann automatisch geteilt.');
  c1.appendChild(editTable(d.mieterstromTarife, [
    { key: 'name', label: 'Tarifname', width: '170px' },
    { key: 'gueltigAb', label: 'gültig ab', type: 'date' },
    { key: 'gueltigBis', label: 'gültig bis', type: 'date' },
    { key: 'grundpreisJahr', label: 'Grundpreis €/Jahr', type: 'number' },
    { key: 'arbeitspreisCt', label: 'Arbeitspreis ct/kWh', type: 'number' },
    { key: 'hinweis', label: 'Hinweis im Brief', width: '200px' },
  ], { onChange: () => render() }));
  c1.appendChild(button('+ Tarif', () => { d.mieterstromTarife.push({ id: uid(), name: '', gueltigAb: '', gueltigBis: '' }); markDirty(); render(); }));
  if (gv && gv.arbeitspreisCt) {
    const zeilen = d.mieterstromTarife.map((t) => { const p = preisgrenze(t, gv); return p && `<li>${esc(t.name || 'Tarif')}: ${eur(p.mieterstrom)} statt ${eur(p.grundversorgung)} bei ${p.kwhJahr.toLocaleString('de-DE')} kWh/Jahr = ${num(p.quote * 100, 0)} % der Grundversorgung, <b class="${p.eingehalten ? 'pos' : 'neg'}">${p.eingehalten ? '90-%-Grenze eingehalten' : '90-%-Grenze überschritten'}</b></li>`; }).filter(Boolean);
    if (zeilen.length) c1.insertAdjacentHTML('beforeend', `<ul class="hint">${zeilen.join('')}</ul>`);
  }
  main.appendChild(c1);

  const c2 = card('Verrechnung an die WEG: Heizung und Allgemeinstrom (Preise brutto)', 'Preis, zu dem WEG-eigene Verbraucher abgerechnet werden (bisher der durchgeschleuste Lieferantenpreis). Der Grundpreis wird je Zeitraum einmal angesetzt und nach Verbrauch auf die WEG-Zähler aufgeteilt.');
  c2.appendChild(editTable(d.wegTarife, [
    { key: 'name', label: 'Bezeichnung', width: '170px' },
    { key: 'gueltigAb', label: 'gültig ab', type: 'date' },
    { key: 'gueltigBis', label: 'gültig bis', type: 'date' },
    { key: 'grundpreisJahr', label: 'Grundpreis €/Jahr', type: 'number' },
    { key: 'arbeitspreisCt', label: 'Arbeitspreis ct/kWh', type: 'number' },
    { key: 'hinweis', label: 'Hinweis im Brief', width: '200px' },
  ]));
  const row2 = document.createElement('div'); row2.className = 'row';
  row2.append(
    button('+ Eintrag', () => { d.wegTarife.push({ id: uid(), name: '' }); markDirty(); render(); }),
    button('Aus Lieferantenverträgen übernehmen', () => {
      if (d.wegTarife.length && !confirm('Vorhandene Einträge durch die Bruttopreise der Lieferantenverträge ersetzen?')) return;
      d.wegTarife = d.lieferantenVertraege.map((v) => {
        const u = 1 + Number(v.ustProzent ?? 19) / 100;
        return { id: uid(), name: [v.lieferant, v.tarif].filter(Boolean).join(' '), gueltigAb: v.gueltigAb, gueltigBis: v.gueltigBis,
          grundpreisJahr: Math.round(Number(v.grundpreisNettoJahr || 0) * u * 100) / 100,
          arbeitspreisCt: Math.round((Number(v.arbeitspreisNettoCt || 0) + Number(v.stromsteuerCt || 0)) * u * 100) / 100 };
      });
      markDirty(); render();
    }));
  c2.appendChild(row2);
  main.appendChild(c2);

  const c3 = card('Lieferantenverträge Reststrom (Preise netto)', 'Für die Simulation der Lieferantenrechnung nach Messkonzept 13. Stromsteuer 0 eintragen, wenn sie im Arbeitspreis enthalten ist. Bei Lieferantenwechsel einfach einen weiteren Vertrag mit dem neuen Zeitraum anlegen.');
  c3.appendChild(editTable(d.lieferantenVertraege, [
    { key: 'lieferant', label: 'Lieferant', width: '150px' },
    { key: 'tarif', label: 'Tarif', width: '120px' },
    { key: 'vertragsnr', label: 'Vertrags-Nr.', width: '100px' },
    { key: 'kundennr', label: 'Kunden-Nr.', width: '100px' },
    { key: 'gueltigAb', label: 'gültig ab', type: 'date' },
    { key: 'gueltigBis', label: 'gültig bis', type: 'date' },
    { key: 'grundpreisNettoJahr', label: 'Grundpreis €/Jahr', type: 'number' },
    { key: 'arbeitspreisNettoCt', label: 'Arbeitspreis ct/kWh', type: 'number' },
    { key: 'stromsteuerCt', label: 'Stromsteuer ct/kWh', type: 'number' },
    { key: 'p14aNettoJahr', label: '§14a €/Jahr', type: 'number' },
    { key: 'ustProzent', label: 'USt %', type: 'number' },
  ]));
  c3.appendChild(button('+ Vertrag', () => { d.lieferantenVertraege.push({ id: uid(), lieferant: '', stromsteuerCt: 2.05, p14aNettoJahr: 0, ustProzent: 19 }); markDirty(); render(); }));
  main.appendChild(c3);
}

// ---------- Tab: Abschläge ----------
function zuordnungen() {
  const d = S.data;
  return [
    ...d.zaehler.filter((z) => z.typ === 'mieterstrom' || z.typ === 'weg').map((z) => [z.id, zaehlerName(z)]),
    ...d.lieferantenVertraege.map((v) => [v.id, `Lieferant: ${[v.lieferant, v.tarif].filter(Boolean).join(' ')}`]),
  ];
}
function tabAbschlaege(main) {
  const d = S.data;
  const opts = zuordnungen();
  const c0 = card('Monatliche Abschläge eintragen', 'Legt für jeden Monat einen Abschlag an (Datum = Fälligkeitstag im Monat). Gezählt werden in der Abrechnung alle Abschläge mit Datum im Abrechnungszeitraum.');
  c0.insertAdjacentHTML('beforeend', `<div class="row">
    <label>Für<select id="mZu">${opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
    <label>Betrag €<input id="mBetrag" type="number" step="any"></label>
    <label>erster Monat<input id="mVon" type="month"></label>
    <label>letzter Monat<input id="mBis" type="month"></label>
    <label>Fälligkeitstag<input id="mTag" type="number" value="1" min="1" max="28"></label>
  </div>`);
  c0.appendChild(button('Abschläge anlegen', () => {
    const zu = $('#mZu').value, b = Number($('#mBetrag').value), von = $('#mVon').value, bis = $('#mBis').value, tag = String($('#mTag').value || 1).padStart(2, '0');
    if (!zu || !b || !von || !bis || bis < von) return alert('Bitte alle Felder ausfüllen.');
    let [y, m] = von.split('-').map(Number);
    while (`${y}-${String(m).padStart(2, '0')}` <= bis) {
      d.abschlaege.push({ id: uid(), zuordnung: zu, datum: `${y}-${String(m).padStart(2, '0')}-${tag}`, betrag: b, bezeichnung: 'Abschlag' });
      if (++m > 12) { m = 1; y++; }
    }
    markDirty(); render();
  }, 'primary'));
  main.appendChild(c0);

  const c1 = card('Alle Abschläge und Zahlungen');
  const rows = [...d.abschlaege].sort((a, b) => (a.zuordnung + a.datum).localeCompare(b.zuordnung + b.datum));
  c1.appendChild(editTable(rows, [
    { key: 'zuordnung', label: 'Für', type: 'select', options: opts },
    { key: 'datum', label: 'Datum', type: 'date' },
    { key: 'betrag', label: 'Betrag €', type: 'number' },
    { key: 'bezeichnung', label: 'Bezeichnung', width: '200px' },
  ], { onDelete: (row) => { d.abschlaege.splice(d.abschlaege.indexOf(row), 1); render(); } }));
  c1.appendChild(button('+ Einzelbetrag', () => { d.abschlaege.push({ id: uid(), zuordnung: opts[0]?.[0], datum: heute(), betrag: 0, bezeichnung: '' }); markDirty(); render(); }));
  main.appendChild(c1);
}

// ---------- Tab: Abrechnung ----------
function standardPeriode() {
  const d = S.data;
  const [tt, mm] = (d.objekt.abrechnungBeginn || '01.07.').split('.').map((x) => x.padStart(2, '0'));
  const t = heute();
  let y = Number(t.slice(0, 4));
  let beginn = `${y}-${mm || '07'}-${tt || '01'}`;
  if (beginn > t) { y--; beginn = `${y}-${mm || '07'}-${tt || '01'}`; }
  // letzte abgeschlossene Periode
  let von = `${y - 1}${beginn.slice(4)}`;
  let bis = addDays(beginn, -1);
  const erste = d.ablesungen.map((a) => a.datum).sort()[0];
  if (erste && erste > von && erste < bis) von = erste;
  return { von, bis };
}

function tabAbrechnung(main) {
  const d = S.data;
  if (!S.periode) S.periode = standardPeriode();
  const c0 = card('Abrechnungszeitraum');
  c0.insertAdjacentHTML('beforeend', `<div class="row">
    <label>Beginn<input id="pVon" type="date" value="${S.periode.von}"></label>
    <label>Ende<input id="pBis" type="date" value="${S.periode.bis}"></label>
    <label>Rechnungslauf Nr.<input id="pLauf" type="number" min="1" value="${S.lauf}"></label>
    <label>Rechnungsdatum<input id="pDatum" type="date" value="${S.rechnungsdatum || heute()}"></label>
  </div>`);
  c0.querySelectorAll('input').forEach((el) => el.onchange = () => {
    S.periode = { von: $('#pVon').value, bis: $('#pBis').value }; S.lauf = Number($('#pLauf').value) || 1; S.rechnungsdatum = $('#pDatum').value; render();
  });
  main.appendChild(c0);
  if (!S.periode.von || !S.periode.bis || S.periode.bis < S.periode.von) return;

  const res = abrechnung(d, S.periode.von, S.periode.bis);
  const ctx = { data: d, res, lauf: S.lauf, rechnungsdatum: S.rechnungsdatum || heute() };

  if (res.warnungen.length) main.insertAdjacentHTML('beforeend', `<div class="warn"><b>Bitte prüfen</b><ul>${res.warnungen.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`);

  const sumK = res.kunden.reduce((a, k) => a + k.gesamt, 0);
  const sumW = res.weg.reduce((a, k) => a + k.gesamt, 0);
  main.insertAdjacentHTML('beforeend', `<div class="kpis">
    <div class="kpi"><div class="l">Mieterstrom-Kunden (${res.kunden.length})</div><div class="v">${eur(sumK)}</div></div>
    <div class="kpi"><div class="l">Heizung und Allgemeinstrom</div><div class="v">${eur(sumW)}</div></div>
    <div class="kpi"><div class="l">Lieferant simuliert (brutto)</div><div class="v">${eur(res.lieferant.summe?.brutto)}</div></div>
    <div class="kpi"><div class="l">Reststrom nach MK13</div><div class="v">${num(res.lieferant.summe?.menge, 1)} kWh</div></div>
  </div>`);

  const ergebnisZelle = (x) => `<td class="r ${x >= 0 ? 'pos' : 'neg'}">${x >= 0 ? 'Guthaben ' : 'Nachzahlung '}${eur(Math.abs(x))}</td>`;
  const docBtn = (fn) => { const b = button('PDF', fn, 'small'); return b; };

  // Mieterstrom
  const c1 = card('Mieterstrom je Kunde');
  c1.insertAdjacentHTML('beforeend', `<div class="tbl-wrap"><table><thead><tr><th>Rechnung</th><th>Kunde</th><th class="r">Stand Beginn</th><th class="r">Stand Ende</th><th class="r">kWh</th><th class="r">Tage</th><th class="r">Verbrauch</th><th class="r">Grundpreis</th><th class="r">Gesamt</th><th class="r">Abschläge</th><th class="r">Ergebnis</th><th></th></tr></thead><tbody>
  ${res.kunden.map((k, i) => `<tr><td>${rechnungsnummer(d, k.zaehler, k.bis, S.lauf)}</td><td>${esc(zaehlerName(k.zaehler))}</td>
    <td class="r">${num(k.positionen[0]?.anfang, 1)}</td><td class="r">${num(k.positionen.at(-1)?.ende, 1)}</td>
    <td class="r">${num(k.kwh, 1)}</td><td class="r">${k.tage}</td>
    <td class="r">${eur(k.positionen.reduce((a, p) => a + p.kostenVerbrauch, 0))}</td><td class="r">${eur(k.positionen.reduce((a, p) => a + p.kostenGrund, 0))}</td>
    <td class="r"><b>${eur(k.gesamt)}</b></td><td class="r">${eur(k.abschlaege)}</td>${ergebnisZelle(k.ergebnis)}<td data-k="${i}"></td></tr>`).join('')}
  <tr class="sum"><td colspan="4">Summe</td><td class="r">${num(res.kunden.reduce((a, k) => a + k.kwh, 0), 1)}</td><td></td><td></td><td></td><td class="r">${eur(sumK)}</td><td class="r">${eur(res.kunden.reduce((a, k) => a + k.abschlaege, 0))}</td><td></td><td></td></tr>
  </tbody></table></div>`);
  res.kunden.forEach((k, i) => c1.querySelector(`td[data-k="${i}"]`).appendChild(docBtn(() => druckeDokumente([docMieterstrom(ctx, k)], `Mieterstrom ${zaehlerName(k.zaehler)}`))));
  if (res.kunden.length) c1.appendChild(button('Alle Mieterstrom-Abrechnungen als PDF', () => druckeDokumente(res.kunden.map((k) => docMieterstrom(ctx, k)), 'Mieterstrom-Abrechnungen'), 'primary'));
  main.appendChild(c1);

  // WEG
  const c2 = card('Heizung und Allgemeinstrom (Verrechnung an die WEG)');
  c2.insertAdjacentHTML('beforeend', `<div class="tbl-wrap"><table><thead><tr><th>Rechnung</th><th>Verbraucher</th><th class="r">kWh</th><th class="r">Anteil Grundpreis</th><th class="r">Verbrauch</th><th class="r">Grundpreis</th><th class="r">Gesamt</th><th></th></tr></thead><tbody>
  ${res.weg.map((k, i) => `<tr><td>${rechnungsnummer(d, k.zaehler, k.bis, S.lauf)}</td><td>${esc(zaehlerName(k.zaehler))}</td><td class="r">${num(k.kwh, 1)}</td>
    <td class="r">${k.positionen.length ? num(k.positionen[0].anteil * 100, 1) + ' %' : '–'}</td>
    <td class="r">${eur(k.positionen.reduce((a, p) => a + p.kostenVerbrauch, 0))}</td><td class="r">${eur(k.positionen.reduce((a, p) => a + p.kostenGrund, 0))}</td>
    <td class="r"><b>${eur(k.gesamt)}</b></td><td data-w="${i}"></td></tr>`).join('')}
  </tbody></table></div>`);
  res.weg.forEach((k, i) => c2.querySelector(`td[data-w="${i}"]`).appendChild(docBtn(() => druckeDokumente([docWeg(ctx, k)], zaehlerName(k.zaehler)))));
  if (res.weg.length) c2.appendChild(button('Beide als PDF', () => druckeDokumente(res.weg.map((k) => docWeg(ctx, k)), 'Heizung und Allgemeinstrom'), 'primary'));
  main.appendChild(c2);

  // Lieferant
  const c3 = card('Simulation Lieferantenrechnung (Messkonzept 13)', 'Abrechenbare Menge = Bezug am Übergabezähler minus Verbrauch der Nicht-Teilnehmer. Je Vertrag ein eigener Abschnitt.');
  c3.insertAdjacentHTML('beforeend', `<div class="tbl-wrap"><table><thead><tr><th>Lieferant</th><th>Zeitraum</th><th class="r">Tage</th><th class="r">Bezug</th><th class="r">− Nicht-Teiln.</th><th class="r">Menge</th><th class="r">Netto</th><th class="r">Brutto</th><th class="r">Abschläge</th><th class="r">Ergebnis</th><th></th></tr></thead><tbody>
  ${res.lieferant.vertraege.map((v, i) => `<tr><td>${esc([v.vertrag.lieferant, v.vertrag.tarif].filter(Boolean).join(' '))}</td><td>${dat(v.von)} – ${dat(v.bis)}</td><td class="r">${v.tage}</td>
    <td class="r">${num(v.bezug, 1)}</td><td class="r">${num(v.summeAbzug, 1)}</td><td class="r"><b>${num(v.menge, 1)}</b></td>
    <td class="r">${eur(v.netto)}</td><td class="r"><b>${eur(v.brutto)}</b></td><td class="r">${eur(v.abschlaege)}</td>${ergebnisZelle(v.ergebnis)}<td data-l="${i}"></td></tr>`).join('')}
  </tbody></table></div>`);
  res.lieferant.vertraege.forEach((v, i) => c3.querySelector(`td[data-l="${i}"]`).appendChild(docBtn(() => druckeDokumente([docLieferant(ctx, v)], `Proforma ${v.vertrag.lieferant || ''}`))));
  main.appendChild(c3);
}

// Beim Start: Beispiel direkt über ?beispiel öffnen
if (location.search.includes('beispiel')) { laden(JSON.stringify(beispielDaten()), null); }
render();
