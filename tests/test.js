// Tests hors ligne : charge les fichiers .gs avec de faux services Google.
// Lancer : node tests/test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const DIR = path.join(__dirname, '..', 'apps-script'), SITE = path.join(__dirname, 'site');

function fakeSheet() {
  const rows = [];
  const sh = {
    rows, setName() { return sh; }, setFrozenRows() {}, getMaxRows: () => 1000, appendRow(r) { rows.push(r.slice()); },
    getLastRow: () => rows.length,
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange(r, c, n, m) {
      return { setNumberFormat() {}, setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = row.slice(); }); } };
    },
  };
  return sh;
}
function context() {
  const sheets = { 'Feuille 1': fakeSheet() }, sent = [], props = {};
  const ss = {
    getId: () => 'ss1', getUrl: () => 'https://sheet',
    getSheets: () => [sheets['Feuille 1']],
    insertSheet(n) { sheets[n] = fakeSheet(); return sheets[n]; },
    getSheetByName(n) { return n === 'Hôtels' ? sheets['Feuille 1'] : sheets[n]; },
  };
  const resp = (code, body) => ({ getResponseCode: () => code, getHeaders: () => ({ 'Content-Type': 'text/html' }), getContentText: () => body });
  const fetchOne = url => {
    const m = url.match(/^http:\/\/hotelduparc\.test(\/[^?#]*)?/);
    if (!m) throw new Error('DNS error ' + url);
    let p = (m[1] || '/').replace(/^\//, '') || 'index.html';
    const f = path.join(SITE, p);
    return fs.existsSync(f) ? resp(200, fs.readFileSync(f, 'utf8')) : resp(404, '');
  };
  const blob = name => ({ n: name, setName(x) { this.n = x; return this; }, getName() { return this.n; }, copyBlob() { return blob(this.n); }, getBytes: () => [1] });
  const ctx = {
    console, user: 'leo.watchi@gmail.com', sent,
    Utilities: { formatDate: (d, tz, f) => d.toISOString().slice(0, f.indexOf('HH') > 0 ? 19 : 10) },
    SpreadsheetApp: { create: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => ctx.user }) },
    MailApp: { getRemainingDailyQuota: () => 100 },
    GmailApp: { sendEmail: (to, objet, corps, o) => sent.push({ to, objet, corps, pj: o.attachments[0].getName(), from: o.name }) },
    MimeType: { PDF: 'application/pdf', GOOGLE_DOCS: 'gdoc' },
    DriveApp: { searchFiles: () => { let d = false; return { hasNext: () => !d, next: () => { d = true; return { getMimeType: () => 'application/pdf', getBlob: () => blob('CV_Leopold_Watchi.pdf') }; } }; } },
    UrlFetchApp: {
      fetch: (u, o) => {
        if (/overpass/.test(u)) return resp(200, JSON.stringify(ctx.osm));
        return fetchOne(u);
      },
      fetchAll: reqs => reqs.map(r => fetchOne(r.url)),  // une URL inconnue fait échouer tout le lot, comme le vrai
    },
  };
  vm.createContext(ctx);
  ctx.eval = code => vm.runInContext(code, ctx);
  for (const f of ['Code.gs', 'Lettre.gs']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  return ctx;
}

const tests = [];
const test = (n, f) => tests.push([n, f]);
const same = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));  // objets venant d'un autre contexte vm
const C = { prenom: 'Léopold', nom: 'Watchi', telephone: '07 81 44 34 13', email: 'leo.watchi@gmail.com' };

test('extraction des adresses', () => {
  const g = context();
  const r = g.extraireEmails_('<a href="mailto:Contact@Hotel.fr">x</a> info [at] hotel [dot] fr logo@2x.png noreply@hotel.fr x@sentry.io');
  same(r.sort(), ['contact@hotel.fr', 'info@hotel.fr']);
});

test('classement des adresses', () => {
  const g = context(), site = 'https://www.hotel-du-parc.fr';
  const r = g.classer_({ 'reservation@hotel-du-parc.fr': '', 'contact@hotel-du-parc.fr': '', 'direction@hotel-du-parc.fr': '',
    'recrutement@hotel-du-parc.fr': '/recrutement', 'info.resa@hotel-du-parc.fr': '' }, site);
  same(r.slice(0, 3).map(c => c.email.split('@')[0]), ['recrutement', 'direction', 'contact']);
  assert.ok(r[r.length - 1].score < 0);
  assert.strictEqual(g.devinerAccor_('https://all.accor.com/hotel/1234/index.fr.shtml')[0], 'h1234-gm@accor.com');
});

test('type d\'hôtel', () => {
  const g = context();
  assert.strictEqual(g.detecterChaine_({ nom: 'ibis Styles Lyon Centre' }), 'ibis');
  assert.strictEqual(g.detecterChaine_({ nom: 'Hôtel Best Western Crequi' }), 'Best Western');
  assert.strictEqual(g.detecterChaine_({ nom: 'Hôtel du Greenwich' }), '');
  assert.strictEqual(g.segment_({ etoiles: 5, marque: 'Sofitel' }), 'luxe');
  assert.strictEqual(g.segment_({ chambres: 80 }), 'intermediaire');
  assert.strictEqual(g.segment_({ chambres: 20, etoiles: 3 }), 'independant');
});

test('lettre : 4 types, pas de variable oubliée', () => {
  const g = context();
  assert.strictEqual(g.deHotel_('Hôtel du Parc'), "de l'Hôtel du Parc");
  assert.strictEqual(g.deHotel_('Le Grand Hôtel'), 'du Grand Hôtel');
  assert.strictEqual(g.deHotel_('Mercure Lyon Centre'), "de l'hôtel Mercure Lyon Centre");
  for (const [seg, extra] of [['independant', {}], ['independant', { chambres: 24 }], ['intermediaire', { chambres: 80 }],
    ['groupe', { marque: 'ibis' }], ['luxe', { etoiles: 5 }], ['luxe', {}]]) {
    const l = g.construireLettre_(Object.assign({ nom: 'Hôtel Test', ville: 'Lyon', segment: seg }, extra), C);
    assert.ok(l.corps.startsWith('Madame, Monsieur,\n\nJe me permets'), l.corps.slice(0, 60));
    assert.ok(l.corps.includes("au sein de l'Hôtel Test à Lyon"));
    assert.ok(!/[{}]/.test(l.corps + l.objet), l.corps);
    assert.ok(l.corps.trim().endsWith('leo.watchi@gmail.com'));
    assert.strictEqual((l.corps.match(/Manchester/g) || []).length, 1);
  }
  assert.strictEqual(g.nomFichierCv_('Hôtel / Le Parc', C, '.pdf'), 'CV Léopold Watchi Hôtel Le Parc.pdf');
});

test('parcours complet : scan, analyse, test, envoi réel, doublon refusé, mauvais compte', () => {
  const g = context();
  g.osm = { elements: [
    { type: 'node', id: 1, tags: { name: 'Hôtel du Parc', website: 'http://hotelduparc.test/', tourism: 'hotel' } },
    { type: 'node', id: 2, tags: { name: 'Hôtel Fantôme', website: 'http://site-mort.test/', tourism: 'hotel' } },
    { type: 'node', id: 3, tags: { name: 'Sans contact', tourism: 'hotel' } },
    { type: 'way', id: 4, tags: { name: 'Hôtel Bis', email: 'direction@hotelduparc.fr', tourism: 'hotel' } },
  ] };
  const r = g.scanVille('Lyon', 100);
  assert.strictEqual(r.total, 3);
  g.analyserLot(r.aAnalyser);
  const hs = g.listeHotels('Lyon');
  const parc = hs.find(h => h.nom === 'Hôtel du Parc');
  assert.strictEqual(parc.email_choisi, 'direction@hotelduparc.fr');
  same([parc.chambres, parc.etoiles, parc.segment], [28, 3, 'independant']);
  const found = parc.emails.map(c => c.email);
  assert.ok(found.includes('contact@hotelduparc.fr') && found.includes('marie.dupont@hotelduparc.fr'));
  assert.ok(!found.includes('support@ovh.net'));
  assert.strictEqual(found[found.length - 1], 'reservation@hotelduparc.fr');
  assert.strictEqual(hs.find(h => h.nom === 'Hôtel Fantôme').emails.length, 0);

  // un 2e scan ne crée pas de doublon
  g.scanVille('Lyon', 100);
  assert.strictEqual(g.listeHotels().length, 3);

  g.envoyer(parc.id);
  assert.strictEqual(g.sent[0].to, 'leo.watchi@gmail.com');
  assert.ok(g.sent[0].objet.startsWith('[TEST -> direction@hotelduparc.fr]'));
  assert.strictEqual(g.sent[0].pj, 'CV Léopold Watchi Hôtel du Parc.pdf');
  assert.strictEqual(g.etat().envoyesAujourdhui, 0);

  g.eval('CONFIG.modeTest = false');
  g.envoyer(parc.id);
  assert.strictEqual(g.sent[1].to, 'direction@hotelduparc.fr');
  assert.strictEqual(g.sent[1].from, 'Léopold Watchi');
  assert.strictEqual(g.etat().envoyesAujourdhui, 1);
  assert.throws(() => g.envoyer(parc.id), /déjà envoyé/);
  const bis = g.listeHotels().find(h => h.nom === 'Hôtel Bis');
  assert.strictEqual(bis.email_choisi, 'direction@hotelduparc.fr');
  assert.ok(bis.deja_envoye);
  assert.throws(() => g.envoyer(bis.id), /déjà reçu une candidature/);
  assert.strictEqual(g.sent.length, 2);

  g.user = 'autre@entreprise.fr';
  assert.throws(() => g.envoyer(bis.id), /installez-le sur leo.watchi@gmail.com/);
  assert.strictEqual(g.historique().length, 1);
});

let ko = 0;
for (const [n, f] of tests) {
  try { f(); console.log('ok  ', n); } catch (e) { ko++; console.log('FAIL', n, '\n', e.message); }
}
process.exit(ko ? 1 : 0);
