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
      return { setNumberFormat() { return this; }, setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = row.slice(); }); } };
    },
  };
  return sh;
}
function context() {
  const sheets = { 'Feuille 1': fakeSheet() }, sent = [], props = {}, cache = {}, triggers = [], gmail = [];
  const msg = (to, objet, date) => ({ getTo: () => to, getCc: () => '', getFrom: () => 'Léopold Watchi <leo.watchi@gmail.com>',
    getSubject: () => objet, getDate: () => new Date(date || '2026-10-01T10:00:00Z') });
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
    console, user: 'leo.watchi@gmail.com', sent, triggers, cache, gmail, msg,
    Utilities: { formatDate: (d, tz, f) => d.toISOString().slice(0, f.indexOf('HH') > 0 ? 19 : 10) },
    SpreadsheetApp: { create: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ getAll: ks => { const o = {}; ks.forEach(k => { if (cache[k]) o[k] = cache[k]; }); return o; },
      putAll: o => Object.assign(cache, o) }) },
    ScriptApp: { getProjectTriggers: () => triggers, deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: f => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => triggers.push({ getHandlerFunction: () => f }) }) }) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => ctx.user }) },
    MailApp: { getRemainingDailyQuota: () => 100 },
    GmailApp: {
      sendEmail: (to, objet, corps, o) => { sent.push({ to, objet, corps, pj: o.attachments[0].getName(), from: o.name }); gmail.push(msg(to, objet)); },
      search: (q, debut) => {
        if (debut) return [];
        const to = (q.match(/to:"([^"]+)"/) || [])[1], sujet = (q.match(/subject:"([^"]+)"/) || [])[1];
        return gmail.filter(m => (!to || m.getTo().indexOf(to) >= 0) && (!sujet || m.getSubject().indexOf(sujet) >= 0))
          .map(m => ({ getMessages: () => [m] }));
      },
    },
    MimeType: { PDF: 'application/pdf', GOOGLE_DOCS: 'gdoc' },
    DriveApp: { searchFiles: q => { ctx.requeteDrive = q; const fs = ctx.fichiersDrive.slice(); return { hasNext: () => fs.length > 0, next: () => fs.shift() }; } },
    UrlFetchApp: {
      fetch: (u, o) => {
        if (/overpass/.test(u)) return resp(200, JSON.stringify(ctx.osm));
        return fetchOne(u);
      },
      fetchAll: reqs => reqs.map(r => fetchOne(r.url)),  // une URL inconnue fait échouer tout le lot, comme le vrai
    },
  };
  const fichier = (nom, mime, date) => ({ getMimeType: () => mime, getLastUpdated: () => new Date(date), getUrl: () => 'drive/' + date,
    getBlob: () => blob(nom) });
  ctx.fichiersDrive = [fichier('CV_Leopold_Watchi.pdf', 'application/pdf', '2026-09-01'),
    fichier('CV_Leopold_Watchi.pdf', 'application/pdf', '2026-10-20'),
    fichier('CV_Leopold_Watchi.pdf', 'application/pdf', '2026-10-02')];
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
  // le texte autour de l'adresse compte : "envoyez votre CV à ..." passe devant direction@
  const h = { _trouves: {}, _infos: {}, _contexte: {} };
  g.recolter_('<p>Réservations : <a href="mailto:hello@hotel-du-parc.fr">écrivez-nous</a></p><p>Pour nous rejoindre, envoyez votre CV à equipe@hotel-du-parc.fr</p><p>direction@hotel-du-parc.fr</p>', site, h);
  const r2 = g.classer_(h._trouves, site, h._contexte);
  same(r2.map(c => c.email.split('@')[0]), ['equipe', 'direction', 'hello']);
  assert.ok(r2[0].raisons.includes('indiquée pour le recrutement sur le site'));
  assert.strictEqual(g.devinerAccor_('https://all.accor.com/hotel/1234/index.fr.shtml')[0], 'h1234-gm@accor.com');
});

test('type d\'hôtel', () => {
  const g = context();
  assert.strictEqual(g.detecterChaine_({ nom: 'ibis Styles Lyon Centre' }), 'ibis Styles');
  assert.strictEqual(g.detecterChaine_({ nom: 'Hôtel Best Western Crequi' }), 'Best Western');
  assert.strictEqual(g.detecterChaine_({ nom: 'Hôtel du Greenwich' }), '');
  const cas = [
    [{ nom: 'Sofitel Lyon Bellecour' }, 'luxe'], [{ nom: 'Hôtel X', etoiles: 5 }, 'luxe'], [{ nom: 'Le Royal', marque: 'Barrière' }, 'luxe'],
    [{ nom: 'ibis budget Lyon Est' }, 'economique'], [{ nom: 'B&B HOTEL Lyon Centre' }, 'economique'], [{ nom: 'Campanile Lyon' }, 'economique'],
    [{ nom: 'Hôtel X', site: 'https://www.hotel-bb.com/fr/hotel/x' }, 'economique'],
    [{ nom: 'Aparthotel Adagio Lyon' }, 'residence'], [{ nom: "Appart'City Confort Lyon" }, 'residence'], [{ nom: 'Résidence du Parc' }, 'residence'],
    [{ nom: 'Mercure Lyon Centre' }, 'groupe'], [{ nom: 'Novotel Lyon' }, 'groupe'], [{ nom: 'Hôtel X', marque: 'Logis' }, 'groupe'],
    [{ nom: 'Hôtel du Greenwich', chambres: 80 }, 'intermediaire'], [{ nom: 'Hôtel du Greenwich', etoiles: 4 }, 'intermediaire'],
    [{ nom: 'Hôtel du Greenwich', chambres: 20, etoiles: 3 }, 'independant'], [{ nom: 'Hôtel du Greenwich' }, 'independant'],
  ];
  cas.forEach(([h, t]) => assert.strictEqual(g.segment_(h), t, h.nom));
});

test('lettre : 4 types, pas de variable oubliée', () => {
  const g = context();
  assert.strictEqual(g.deHotel_('Hôtel du Parc'), "de l'Hôtel du Parc");
  assert.strictEqual(g.deHotel_('Le Grand Hôtel'), 'du Grand Hôtel');
  assert.strictEqual(g.deHotel_('Mercure Lyon Centre'), "de l'hôtel Mercure Lyon Centre");
  for (const [seg, extra] of [['independant', {}], ['independant', { chambres: 24 }], ['intermediaire', { chambres: 80 }],
    ['intermediaire', {}], ['groupe', { marque: 'Mercure' }], ['groupe', {}], ['economique', { marque: 'ibis' }], ['economique', {}],
    ['residence', { marque: 'Adagio' }], ['residence', {}], ['luxe', { etoiles: 5 }], ['luxe', {}]]) {
    for (const nom of ['Hôtel Test', 'Hôtel Test ', 'Hôtel  Test', 'Hôtel Test.']) {   // autres graines -> autres variantes
      const c = g.construireLettre_(Object.assign({ nom: nom, ville: 'Lyon', segment: seg }, extra), C).corps;
      assert.ok(!/[{}]/.test(c), seg + ' : variable non remplie');
      assert.ok(!/jamais|pas encore travaillé|ne viens pas|pas d'expérience/i.test(c), seg + ' : ne doit pas dire que je débute');
      assert.ok(c.indexOf('\n\nundefined') < 0 && !/undefined|null/.test(c));
    }
    const l = g.construireLettre_(Object.assign({ nom: 'Hôtel Test', ville: 'Lyon', segment: seg }, extra), C);
    assert.ok(l.corps.startsWith('Madame, Monsieur,\n\nJe me permets'), l.corps.slice(0, 60));
    assert.ok(l.corps.includes("au sein de l'Hôtel Test à Lyon"));
    assert.ok(!/[{}]/.test(l.corps + l.objet), l.corps);
    assert.ok(l.corps.trim().endsWith('leo.watchi@gmail.com'));
    assert.strictEqual((l.corps.match(/Manchester/g) || []).length, 1);
    if (seg !== 'independant' && seg !== 'intermediaire') assert.ok(/économique|résidence|exigence|réseau|enseigne|hôtel Mercure|Adagio|ibis/.test(l.corps), seg);
  }
  assert.strictEqual(g.nomFichierCv_('Hôtel / Le Parc', C, '.pdf'), 'CV Léopold Watchi Hôtel Le Parc.pdf');
});

test('parcours complet : scan, analyse, test, envoi réel, doublon refusé, mauvais compte', () => {
  const g = context();
  g.osm = { elements: [
    { type: 'node', id: 1, tags: { name: 'Hôtel du Parc', website: 'http://hotelduparc.test/', tourism: 'hotel' } },
    { type: 'node', id: 2, tags: { name: 'Hôtel Fantôme', website: 'http://site-mort.test/', tourism: 'hotel' } },
    { type: 'node', id: 3, tags: { name: 'Sans contact', tourism: 'hotel' } },
    { type: 'way', id: 4, tags: { name: 'Hôtel Bis', email: 'marie.dupont@hotelduparc.fr', tourism: 'hotel' } },
  ] };
  const r = g.scanVille('Lyon', 100);
  same([r.total, r.nouveaux, r.dejaConnus], [3, 3, 0]);
  assert.strictEqual(g.triggers.length, 1);              // analyse en arrière-plan programmée
  assert.strictEqual(g.analyserProchains(2), 2);
  assert.strictEqual(g.analyserProchains(2), 1);          // les 2 premiers sont déjà réservés / faits
  assert.strictEqual(g.analyserProchains(2), 0);
  g.traiterFileAttente();
  assert.strictEqual(g.triggers.length, 0);              // plus rien à faire : le déclencheur s'arrête
  const hs = g.listeHotels('Lyon');
  const parc = hs.find(h => h.nom === 'Hôtel du Parc');
  // "Directeur de la publication : Marie Dupont, marie.dupont@..." passe devant direction@
  assert.strictEqual(parc.email_choisi, 'marie.dupont@hotelduparc.fr');
  assert.ok(parc.emails[0].raisons.includes('indiquée comme adresse de la direction'));
  same([parc.chambres, parc.etoiles, parc.segment], [28, 3, 'independant']);
  const found = parc.emails.map(c => c.email);
  assert.ok(found.includes('contact@hotelduparc.fr') && found.includes('marie.dupont@hotelduparc.fr'));
  assert.ok(!found.includes('support@ovh.net'));
  assert.strictEqual(found[found.length - 1], 'reservation@hotelduparc.fr');
  assert.strictEqual(hs.find(h => h.nom === 'Hôtel Fantôme').emails.length, 0);

  // un 2e scan ne crée pas de doublon
  same((({ nouveaux, dejaConnus }) => [nouveaux, dejaConnus])(g.scanVille('Lyon, Annecy', 100)), [0, 3]);
  assert.strictEqual(g.listeHotels().length, 3);

  // le CV est le plus récent des CV_Leopold_Watchi.pdf du Drive
  assert.strictEqual(g.etat().cv.url, 'drive/2026-10-20');
  assert.ok(g.requeteDrive.startsWith('title = "CV_Leopold_Watchi.pdf"'));

  g.envoyer(parc.id);
  assert.strictEqual(g.sent[0].to, 'marie.dupont@hotelduparc.fr');      // directement à l'hôtel
  assert.strictEqual(g.sent[0].objet, 'Candidature spontanée - Adjoint à la direction - Hôtel du Parc');
  assert.strictEqual(g.sent[0].pj, 'CV Léopold Watchi Hôtel du Parc.pdf');
  assert.strictEqual(g.sent[0].from, 'Léopold Watchi');
  assert.strictEqual(g.etat().envoyesAujourdhui, 1);
  assert.throws(() => g.envoyer(parc.id), /déjà envoyé/);
  const bis = g.listeHotels().find(h => h.nom === 'Hôtel Bis');
  // Hôtel Bis n'avait que l'adresse déjà contactée : il n'est plus proposé
  assert.strictEqual(bis.statut, 'deja_contacte');
  assert.throws(() => g.envoyer(bis.id), /déjà reçu une candidature/);
  assert.strictEqual(g.sent.length, 1);

  // adresse partagée : un hôtel qui en a une autre bascule dessus
  g.modifierHotel(bis.id, { statut: 'nouveau', email_choisi: 'marie.dupont@hotelduparc.fr' });
  g.eval("ecrireHotels_([Object.assign(hotel_(" + bis.id + "), { emails: [{ email: 'marie.dupont@hotelduparc.fr', score: 70 }, { email: 'rh@bis.fr', score: 60 }] })])");
  const bis2 = g.listeHotels().find(h => h.nom === 'Hôtel Bis');
  same([bis2.statut, bis2.email_choisi], ['nouveau', 'rh@bis.fr']);

  // adresse déjà écrite à la main depuis Gmail (hors outil) : bloquée et ajoutée au suivi
  g.gmail.push(g.msg('rh@bis.fr', 'Candidature', '2026-09-15T10:00:00Z'));
  assert.throws(() => g.envoyer(bis2.id), /déjà reçu un mail de votre part le 2026-09-15/);
  assert.strictEqual(g.sent.length, 1);
  assert.ok(g.historique().some(e => e.email === 'rh@bis.fr'));

  // récupération des anciennes candidatures envoyées depuis Gmail
  g.gmail.push(g.msg('contact@ancien-hotel.fr, direction@autre.fr', 'Candidature spontanée - Adjoint à la direction - Ancien'));
  assert.strictEqual(g.synchroniserEnvoisGmail(), 2);
  assert.strictEqual(g.synchroniserEnvoisGmail(), 0);

  g.user = 'autre@entreprise.fr';
  assert.throws(() => g.envoyer(bis.id), /installez-le sur leo.watchi@gmail.com/);
  assert.strictEqual(g.historique().length, 4);
});

let ko = 0;
for (const [n, f] of tests) {
  try { f(); console.log('ok  ', n); } catch (e) { ko++; console.log('FAIL', n, '\n', e.message); }
}
process.exit(ko ? 1 : 0);
