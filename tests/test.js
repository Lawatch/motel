// Tests hors ligne : charge les fichiers .gs avec de faux services Google.
// Lancer : node tests/test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const DIR = path.join(__dirname, '..', 'apps-script'), SITE = path.join(__dirname, 'site');

// Extrait de la liste des hôtels classés (même forme que le fichier d'Atout France)
const CSV_ATOUT = [
  'DATE DE CLASSEMENT;TYPOLOGIE ÉTABLISSEMENT;CLASSEMENT;NOM COMMERCIAL;ADRESSE;CODE POSTAL;COMMUNE;SITE INTERNET;COURRIEL;NOMBRE DE CHAMBRES',
  '01/02/2024;HÔTEL DE TOURISME;3 étoiles;HOTEL DU PARC;1 RUE DU PARC;69002;LYON;http://www.hotelduparc.test/;contact@hotelduparc.fr;28',
  '01/02/2024;HÔTEL DE TOURISME;2 étoiles;IBIS BUDGET LYON EST;5 AVENUE X;69003;LYON;;H1234@accor.com;80',
  '01/02/2024;CAMPING;3 étoiles;CAMPING DU LAC;ROUTE DU LAC;69002;LYON;;camping@lac.fr;',
  '01/02/2024;HÔTEL DE TOURISME;3 étoiles;HOTEL SANS CONTACT;2 RUE Y;69002;LYON;;;10',
  "01/02/2024;HÔTEL DE TOURISME;4 étoiles;L'ESCALE D'ANGLETERRE;3 QUAI Z;74000;ANNECY;;direction@escale.fr;40",
  '01/02/2024;HÔTEL DE TOURISME;3 étoiles;"HOTEL ""LE QUAI""";8 RUE W;75008;PARIS;;quai@hotel-quai.fr;35',
].join('\r\n');
const JEU_DATAGOUV = { title: 'Hébergements collectifs classés en France', organization: { name: 'Atout France' },
  resources: [{ title: 'Liste des hébergements classés', format: 'csv', url: 'https://static.data.gouv.fr/hebergements.csv', last_modified: '2026-10-01' }] };

function parseCsv(texte, sep) {   // Utilities.parseCsv
  const lignes = [];
  let ligne = [], champ = '', guill = false;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i];
    if (guill) {
      if (ch === '"' && texte[i + 1] === '"') { champ += '"'; i++; } else if (ch === '"') guill = false; else champ += ch;
    } else if (ch === '"') guill = true;
    else if (ch === sep) { ligne.push(champ); champ = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = '';
    } else champ += ch;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

function fakeSheet() {
  const rows = [];
  const sh = {
    rows, setName() { return sh; }, setFrozenRows() {}, getMaxRows: () => 1000, appendRow(r) { rows.push(r.slice()); },
    getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange(r, c, n, m) {
      return { setNumberFormat() { return this; }, setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = row.slice(); }); } };
    },
  };
  return sh;
}
function context() {
  const sheets = { 'Feuille 1': fakeSheet() }, sent = [], props = {}, cache = {}, triggers = [], gmail = [], drive = {};
  const appels = { fetchAll: 0, urls: [], datagouv: 0, csv: 0, plusGrosMorceau: 0 };
  const binaire = (code, buf, entetes) => ({ getResponseCode: () => code, getHeaders: () => entetes,
    getContentText: enc => buf.toString(enc === 'ISO-8859-1' ? 'latin1' : 'utf8') });
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
    appels.urls.push(url);
    const m = url.match(/^http:\/\/(www\.)?hotelduparc\.test(\/[^?#]*)?/);
    if (!m) throw new Error('DNS error ' + url);
    let p = (m[2] || '/').replace(/^\//, '') || 'index.html';
    const f = path.join(SITE, p);
    return fs.existsSync(f) ? resp(200, fs.readFileSync(f, 'utf8')) : resp(404, '');
  };
  const blob = name => ({ n: name, setName(x) { this.n = x; return this; }, getName() { return this.n; }, copyBlob() { return blob(this.n); }, getBytes: () => [1] });
  const fichierTexte = (id, contenu) => ({ getId: () => id, setContent(c) { contenu = c; }, getBlob: () => ({ getDataAsString: () => contenu }) });
  const ctx = {
    console, user: 'leo.watchi@gmail.com', sent, triggers, cache, gmail, msg, appels, props,
    Utilities: { formatDate: (d, tz, f) => d.toISOString().slice(0, f.indexOf('HH') > 0 ? 19 : 10), parseCsv },
    SpreadsheetApp: { create: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ getAll: ks => { const o = {}; ks.forEach(k => { if (cache[k]) o[k] = cache[k]; }); return o; },
      putAll: o => Object.assign(cache, o), get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
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
    DriveApp: {
      searchFiles: q => { ctx.requeteDrive = q; const fs = ctx.fichiersDrive.slice(); return { hasNext: () => fs.length > 0, next: () => fs.shift() }; },
      createFile: (nom, contenu) => { const id = 'f' + Object.keys(drive).length; drive[id] = fichierTexte(id, contenu); return drive[id]; },
      getFileById: id => { if (!drive[id]) throw new Error('introuvable'); return drive[id]; },
    },
    UrlFetchApp: {
      fetch: (u, o) => {
        if (/overpass/.test(u)) return resp(200, JSON.stringify(/Lyon/.test(o.payload.data) ? ctx.osm : { elements: [] }));
        if (/data\.gouv\.fr\/api\/1\/datasets\/hebergements-collectifs-classes-en-france\//.test(u)) {
          appels.datagouv++; return resp(200, JSON.stringify(JEU_DATAGOUV));
        }
        if (/data\.gouv\.fr/.test(u) && /\.csv/.test(u)) {   // serveur de fichiers : gère les plages d'octets (Range)
          appels.csv++;
          const buf = Buffer.from(CSV_ATOUT, 'utf8'), rg = ((o && o.headers) || {}).Range;
          if (!rg || ctx.sansPlages) return binaire(200, buf, {});
          const [a, b] = rg.match(/bytes=(\d+)-(\d+)/).slice(1).map(Number);
          if (a >= buf.length) return binaire(416, Buffer.alloc(0), {});
          const part = buf.subarray(a, Math.min(b + 1, buf.length));
          appels.plusGrosMorceau = Math.max(appels.plusGrosMorceau, part.length);
          return binaire(206, part, { 'Content-Range': 'bytes ' + a + '-' + (a + part.length - 1) + '/' + buf.length });
        }
        if (/data\.gouv\.fr/.test(u)) return resp(404, '');
        return fetchOne(u);
      },
      fetchAll: reqs => {   // une URL inconnue fait échouer tout le lot, comme le vrai
        if (reqs.every(r => /data\.gouv/.test(r.url))) return reqs.map(r => ctx.UrlFetchApp.fetch(r.url, r));
        appels.fetchAll++; return reqs.map(r => fetchOne(r.url));
      },
    },
  };
  const fichier = (nom, mime, date) => ({ getMimeType: () => mime, getLastUpdated: () => new Date(date), getUrl: () => 'drive/' + date,
    getBlob: () => blob(nom) });
  ctx.fichiersDrive = [fichier('CV_Leopold_Watchi.pdf', 'application/pdf', '2026-09-01'),
    fichier('CV_Leopold_Watchi.pdf', 'application/pdf', '2026-10-20'),
    fichier('CV_Leopold_Watchi.pdf', 'application/pdf', '2026-10-02')];
  ctx.osm = { elements: [] };
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

test('lettre : 6 types, pas de variable oubliée', () => {
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

test('zones de recherche et noms', () => {
  const g = context();
  const z = s => g.analyserZone_(s);
  assert.ok(g.dansZone_(z('Lyon'), '69002', 'LYON'));
  assert.ok(g.dansZone_(z('lyon'), '69002', 'Lyon 2e Arrondissement'));
  assert.ok(g.dansZone_(z('Saint-Étienne'), '42000', 'ST ETIENNE'));
  assert.ok(!g.dansZone_(z('Lyon'), '69100', 'VILLEURBANNE'));
  assert.ok(g.dansZone_(z('Paris 8e'), '75008', 'PARIS'));
  assert.ok(g.dansZone_(z('Paris 16e arrondissement'), '75116', 'PARIS'));
  assert.ok(!g.dansZone_(z('Paris 8e'), '75018', 'PARIS'));
  assert.ok(g.dansZone_(z('Lyon 3'), '69003', 'LYON'));
  assert.ok(g.dansZone_(z('74'), '74000', 'ANNECY') && !g.dansZone_(z('74'), '07400', 'X'));
  assert.ok(g.dansZone_(z('2A'), '20000', 'AJACCIO'));
  assert.ok(g.dansZone_(z('69003'), '69003', 'LYON'));
  assert.strictEqual(g.joliNom_('HOTEL DU PARC'), 'Hôtel du Parc');
  assert.strictEqual(g.joliNom_("L'ESCALE D'ANGLETERRE"), "L'Escale d'Angleterre");
  assert.strictEqual(g.joliNom_('IBIS BUDGET LYON EST'), 'ibis budget Lyon Est');
  assert.strictEqual(g.joliNom_('SAINT-JEAN-DE-LUZ'), 'Saint-Jean-de-Luz'.replace('-de-', '-De-'));
  assert.strictEqual(g.joliNom_('Le Petit Nice'), 'Le Petit Nice');   // déjà bien écrit : inchangé
});

test('scan : liste officielle + OpenStreetMap, sans doublon, adresses prêtes tout de suite', () => {
  const g = context();
  g.osm = { elements: [
    { type: 'node', id: 1, tags: { name: 'Hôtel du Parc', website: 'http://hotelduparc.test/', tourism: 'hotel' } },
    { type: 'node', id: 9, tags: { name: 'Hôtel Récent', website: 'http://site-mort.test/', tourism: 'hotel' } },
  ] };
  g.eval('ATOUT.morceau = 97');   // morceaux minuscules : lignes et accents coupés entre deux morceaux
  const r = g.scanVille('Lyon', 400);
  same([r.atout, r.osm, r.nouveaux, r.sansContact, r.prets], [3, 2, 3, 1, 2]);
  assert.strictEqual(g.appels.datagouv, 1);
  assert.ok(g.appels.plusGrosMorceau <= 97, 'jamais plus d\'un morceau à la fois');
  const hs = g.listeHotels('Lyon');
  same(hs.map(h => h.nom).sort(), ['Hôtel Récent', 'Hôtel du Parc', 'ibis budget Lyon Est']);
  const ibis = hs.find(h => /ibis/.test(h.nom));
  // pas de site à visiter : prêt tout de suite, avec les infos officielles
  same([ibis.statut, ibis.analyse, ibis.email_choisi, ibis.etoiles, ibis.chambres, ibis.segment, ibis.marque],
    ['nouveau', 'faite', 'h1234@accor.com', 2, 80, 'economique', 'ibis budget']);
  const parc = hs.find(h => h.nom === 'Hôtel du Parc');
  same([parc.statut, parc.analyse, parc.email_choisi], ['nouveau', 'a_faire', 'contact@hotelduparc.fr']);
  assert.strictEqual(g.etat().aAnalyser, 2);

  // l'adresse du fichier est gardée en cache : data.gouv.fr n'est interrogé qu'une fois
  g.scanVille('Paris 8e', 400);
  assert.strictEqual(g.appels.datagouv, 1);
  const quai = g.listeHotels('Paris 8e')[0];
  same([quai.nom, quai.ville, quai.email_choisi], ['Hôtel "Le Quai"', 'Paris', 'quai@hotel-quai.fr']);
  const dept = g.scanVille('74', 400);
  assert.strictEqual(dept.nouveaux, 1);
  same(g.listeHotels('74').map(h => [h.nom, h.ville, h.segment]), [["L'Escale d'Angleterre", 'Annecy', 'intermediaire']]);

  // plusieurs zones : une seule lecture du fichier ; serveur qui ignore les plages : tout lu d'un coup
  const g2 = context();
  g2.sansPlages = true;
  const z = g2.hotelsAtoutZones_(['Lyon', '74', 'Paris 8e', 'Marseille']);
  same(z.map(l => l.length), [3, 1, 1, 0]);
  assert.strictEqual(g2.appels.csv, 1);
  same(z[0].map(h => h.nom), ['Hôtel du Parc', 'ibis budget Lyon Est', 'Hôtel Sans Contact']);
  const v = g2.verifierAtout_();
  assert.ok(/nom=NOM COMMERCIAL/.test(v.colonnes) && /email=COURRIEL/.test(v.colonnes), v.colonnes);
});

test('analyse rapide : une seule vague de requêtes quand le site donne une bonne adresse', () => {
  const g = context();
  const h = { nom: 'Hôtel du Parc', site: 'http://hotelduparc.test/', emails: [] };
  g.crawlLot_([h]);
  assert.strictEqual(g.appels.fetchAll, 2);   // accueil + 3 pages devinées, puis 2 pages trouvées dans les liens
  assert.ok(g.appels.urls.length <= 6, g.appels.urls.join(' '));
  assert.ok(g.appels.urls.includes('http://hotelduparc.test/recrutement'));

  // un site qui affiche une adresse recrutement dès l'accueil : pas de 2e vague
  const g2 = context();
  fs.writeFileSync(path.join(SITE, 'recrutement'), '<p>Envoyez votre CV à jobs@hotelduparc.fr</p>');
  try {
    const h2 = { nom: 'Hôtel du Parc', site: 'http://hotelduparc.test/', emails: [] };
    g2.crawlLot_([h2]);
    assert.strictEqual(g2.appels.fetchAll, 1);
    assert.strictEqual(h2.emails[0].email, 'jobs@hotelduparc.fr');
  } finally {
    fs.unlinkSync(path.join(SITE, 'recrutement'));
  }
});

test('parcours complet : scan, analyse, envoi, doublon refusé, mauvais compte', () => {
  const g = context();
  g.osm = { elements: [
    { type: 'node', id: 1, tags: { name: 'Hôtel du Parc', website: 'http://hotelduparc.test/', tourism: 'hotel' } },
    { type: 'node', id: 2, tags: { name: 'Hôtel Fantôme', website: 'http://site-mort.test/', tourism: 'hotel' } },
    { type: 'node', id: 3, tags: { name: 'Sans contact', tourism: 'hotel' } },
    { type: 'way', id: 4, tags: { name: 'Hôtel Bis', email: 'marie.dupont@hotelduparc.fr', tourism: 'hotel' } },
  ] };
  const r = g.scanVille('Lyon', 400);
  same([r.nouveaux, r.dejaConnus], [4, 0]);              // Parc (2 sources, 1 seul hôtel), ibis, Fantôme, Bis
  assert.strictEqual(g.triggers.length, 1);              // analyse en arrière-plan programmée
  assert.strictEqual(g.analyserProchains(1), 1);
  assert.strictEqual(g.analyserProchains(5), 1);          // le premier est déjà réservé / fait
  assert.strictEqual(g.analyserProchains(5), 0);
  g.traiterFileAttente();
  assert.strictEqual(g.triggers.length, 0);              // plus rien à faire : le déclencheur s'arrête
  const hs = g.listeHotels('Lyon');
  const parc = hs.find(h => h.nom === 'Hôtel du Parc');
  // la visite du site trouve mieux que l'adresse officielle : "Directeur de la publication : Marie Dupont"
  assert.strictEqual(parc.email_choisi, 'marie.dupont@hotelduparc.fr');
  assert.ok(parc.emails[0].raisons.includes('indiquée comme adresse de la direction'));
  same([parc.chambres, parc.etoiles, parc.segment, parc.analyse], [28, 3, 'independant', 'faite']);
  const found = parc.emails.map(c => c.email);
  assert.ok(found.includes('contact@hotelduparc.fr') && found.includes('direction@hotelduparc.fr'));
  assert.ok(!found.includes('support@ovh.net'));
  assert.strictEqual(found[found.length - 1], 'reservation@hotelduparc.fr');
  assert.strictEqual(hs.find(h => h.nom === 'Hôtel Fantôme').emails.length, 0);

  // un 2e scan ne repropose rien de connu
  same((({ nouveaux, dejaConnus }) => [nouveaux, dejaConnus])(g.scanVille('Lyon, Annecy', 400)), [1, 4]);
  assert.strictEqual(g.listeHotels().length, 5);

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
  try { f(); console.log('ok  ', n); } catch (e) { ko++; console.log('FAIL', n, '\n', e.stack.split('\n').slice(0, 4).join('\n')); }
}
process.exit(ko ? 1 : 0);
