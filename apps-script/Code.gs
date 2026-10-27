/**
 * Candidatures spontanées en hôtellerie - Google Apps Script
 * À installer sur le compte qui envoie les mails : leo.watchi@gmail.com
 */

// ============================================================ RÉGLAGES

const CONFIG = {
  prenom: 'Léopold',
  nom: 'Watchi',
  telephone: '07 81 44 34 13',
  email: 'leo.watchi@gmail.com',      // compte d'envoi : le script refuse d'envoyer depuis un autre compte

  cvNom: 'CV_Leopold_Watchi.pdf',      // nom du CV dans Google Drive : le plus récent est utilisé

  limiteParJour: 100,                  // Gmail autorise 100 destinataires par jour depuis un script
  delaiEntreEnvoisSec: [3, 6],         // pause aléatoire entre deux mails (100 mails ≈ 10 min)
  scoreMinimumAuto: 20,                // score minimum pour la sélection automatique
  copieCvDrive: false,                 // true : garde une copie de chaque CV renommé dans Drive
};

// ============================================================ INTERFACE WEB

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Candidatures hôtels')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function etat() {
  const compte = Session.getEffectiveUser().getEmail();
  return {
    version: VERSION,
    cv: infoCv_(),
    aAnalyser: lireHotels_().filter(h => h.statut === 'a_analyser').length,
    compte: compte,
    bonCompte: compte.toLowerCase() === CONFIG.email.toLowerCase(),
    envoyesAujourdhui: envoisDuJour_(),
    limite: CONFIG.limiteParJour,
    quotaGmail: MailApp.getRemainingDailyQuota(),
    scoreMin: CONFIG.scoreMinimumAuto,
    delai: CONFIG.delaiEntreEnvoisSec,
    sheetUrl: classeur_().getUrl(),
  };
}

// Affichée en haut de la page : si elle ne correspond pas, la page utilise une ancienne version du code
const VERSION = '5 - lettre ciblée, anti-doublon Gmail';

// ============================================================ STOCKAGE (Google Sheet)

const COLS = ['id', 'cle', 'nom', 'ville', 'adresse', 'site', 'etoiles', 'chambres', 'marque', 'segment',
  'emails', 'email_choisi', 'statut', 'objet_perso', 'corps_perso', 'recherche', 'scanne_le'];
const COLS_ENVOIS = ['email', 'hotel_id', 'hotel_nom', 'objet', 'envoye_le'];

function classeur_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* supprimé : on le recrée */ }
  }
  const ss = SpreadsheetApp.create('Candidatures hôtels - suivi');
  const h = ss.getSheets()[0].setName('Hôtels');
  const e = ss.insertSheet('Envois');
  // tout en texte brut, sinon Sheets transforme les dates et les nombres
  h.getRange(1, 1, h.getMaxRows(), COLS.length).setNumberFormat('@');
  e.getRange(1, 1, e.getMaxRows(), COLS_ENVOIS.length).setNumberFormat('@');
  h.appendRow(COLS);
  e.appendRow(COLS_ENVOIS);
  h.setFrozenRows(1);
  e.setFrozenRows(1);
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function feuille_(nom) { return classeur_().getSheetByName(nom); }

function lireHotels_() {
  const values = feuille_('Hôtels').getDataRange().getValues();
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const h = { _ligne: r + 1 };
    COLS.forEach((c, i) => { h[c] = texte_(values[r][i]); });
    ['id', 'etoiles', 'chambres'].forEach(c => { h[c] = h[c] === null ? null : Number(h[c]); });
    h.emails = h.emails ? JSON.parse(h.emails) : [];
    out.push(h);
  }
  return out;
}

function texte_(v) {
  if (v === '' || v === null || v === undefined) return null;
  return v instanceof Date ? Utilities.formatDate(v, 'Europe/Paris', "yyyy-MM-dd'T'HH:mm:ss") : String(v);
}

function ligne_(h) {
  return COLS.map(c => {
    const v = c === 'emails' ? JSON.stringify(h.emails || []) : h[c];
    return v === null || v === undefined ? '' : v;
  });
}

function ecrireHotels_(hotels) {
  const sh = feuille_('Hôtels');
  hotels.forEach(h => sh.getRange(h._ligne, 1, 1, COLS.length).setValues([ligne_(h)]));
}

function lireEnvois_() {
  const values = feuille_('Envois').getDataRange().getValues();
  return values.slice(1).map(v => ({ email: String(v[0]).toLowerCase(), hotel_id: Number(v[1]), hotel_nom: String(v[2]),
    objet: String(v[3]), envoye_le: texte_(v[4]) || '' }));
}

function aujourdhui_() { return Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd'); }
function maintenant_() { return Utilities.formatDate(new Date(), 'Europe/Paris', "yyyy-MM-dd'T'HH:mm:ss"); }
function envoisDuJour_() { const j = aujourdhui_(); return lireEnvois_().filter(e => e.envoye_le.indexOf(j) === 0).length; }

// ============================================================ API appelée par la page

/** 1. Liste des hôtels d'une ou plusieurs villes ("Lyon, Annecy, Grenoble"). Les sites sont ensuite
 *  analysés par la page (plusieurs lots en parallèle) et, si la page est fermée, en arrière-plan. */
function scanVille(villes, limite) {
  const liste = String(villes || '').split(/[,;\n]+/).map(v => v.trim()).filter(Boolean);
  if (!liste.length) throw new Error('Indiquez une ville');
  const parVille = liste.map(v => ({ ville: v, hotels: hotelsOsm_(v).slice(0, limite || 150) }));
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let total = 0, nouveauxTotal = 0, dejaConnus = 0;
  try {
    const existants = lireHotels_();
    const parCle = {};
    existants.forEach(h => { parCle[h.cle] = h; });
    let maxId = existants.reduce((m, h) => Math.max(m, Number(h.id) || 0), 0);
    const nouveaux = [], maj = [];
    const vus = {};
    parVille.forEach(pv => pv.hotels.forEach(t => {
      if (vus[t.cle]) return;   // même hôtel trouvé pour deux villes voisines
      vus[t.cle] = true;
      total++;
      const h = parCle[t.cle];
      if (h) {   // déjà dans le suivi (contacté, ignoré ou en attente) : jamais reproposé comme nouveau
        dejaConnus++;
        if (h.recherche !== pv.ville && h.statut !== 'envoye') { h.recherche = pv.ville; maj.push(h); }
        return;
      }
      t.id = ++maxId; t.statut = 'a_analyser'; t.recherche = pv.ville;
      t.emails = t.emails_osm.map(e => ({ email: e, source: 'OpenStreetMap' }));  // adresse indiquée sur la carte
      nouveaux.push(t);
      parCle[t.cle] = t;
    }));
    if (nouveaux.length) {
      const sh = feuille_('Hôtels');
      sh.getRange(sh.getLastRow() + 1, 1, nouveaux.length, COLS.length).setNumberFormat('@').setValues(nouveaux.map(ligne_));
    }
    ecrireHotels_(maj);
    nouveauxTotal = nouveaux.length;
  } finally {
    lock.releaseLock();
  }
  if (nouveauxTotal) assurerDeclencheur_();
  return { recherches: liste, total: total, nouveaux: nouveauxTotal, dejaConnus: dejaConnus };
}

/** 2. Analyse les prochains hôtels en attente. Plusieurs appels peuvent tourner en même temps :
 *  chaque hôtel est "réservé" quelques minutes pour ne pas être analysé deux fois. Retourne le nombre traité. */
function analyserProchains(n) {
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  let lot;
  lock.waitLock(30000);
  try {
    const attente = lireHotels_().filter(h => h.statut === 'a_analyser');
    const pris = cache.getAll(attente.map(h => 'analyse_' + h.id));
    lot = attente.filter(h => !pris['analyse_' + h.id]).slice(0, n || 8);
    const marques = {};
    lot.forEach(h => { marques['analyse_' + h.id] = '1'; });
    if (lot.length) cache.putAll(marques, 240);
  } finally {
    lock.releaseLock();
  }
  if (!lot.length) return 0;
  crawlLot_(lot);
  lock.waitLock(30000);
  try {
    const frais = {}, deja = adressesContactees_();
    lireHotels_().forEach(h => { frais[h.id] = h; });
    const aEcrire = lot.filter(h => frais[h.id]).map(h => {
      const f = frais[h.id];
      Object.assign(f, {
        emails: h.emails, chambres: h.chambres, etoiles: h.etoiles, marque: h.marque, segment: h.segment,
        statut: f.statut === 'a_analyser' ? 'nouveau' : f.statut, scanne_le: maintenant_(),
      });
      choisirAdresseLibre_(f, deja);
      return f;
    });
    ecrireHotels_(aEcrire);
  } finally {
    lock.releaseLock();
  }
  return lot.length;
}

/** Analyse en arrière-plan (déclencheur toutes les minutes), même page fermée. S'arrête quand tout est fait. */
function traiterFileAttente() {
  const debut = Date.now();
  while (Date.now() - debut < 4 * 60 * 1000) {
    if (!analyserProchains(10)) {
      if (!lireHotels_().some(h => h.statut === 'a_analyser')) supprimerDeclencheur_();
      return;
    }
  }
}

function assurerDeclencheur_() {
  if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'traiterFileAttente')) return;
  ScriptApp.newTrigger('traiterFileAttente').timeBased().everyMinutes(1).create();
}

function supprimerDeclencheur_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'traiterFileAttente')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function recherches() {
  const n = {}, ordre = [];
  lireHotels_().reverse().forEach(h => {
    if (!(h.recherche in n)) { n[h.recherche] = 0; ordre.push(h.recherche); }
    n[h.recherche]++;
  });
  return ordre.map(r => ({ recherche: r, n: n[r] }));
}

/** Adresses déjà contactées (onglet Envois), en minuscules. */
function adressesContactees_() {
  const deja = {};
  lireEnvois_().forEach(e => { deja[e.email] = true; });
  return deja;
}

/** Choisit la meilleure adresse jamais contactée. Si toutes l'ont été, l'hôtel passe en "deja_contacte".
 *  Retourne true si l'hôtel a changé. */
function choisirAdresseLibre_(h, deja) {
  if (h.statut !== 'nouveau') return false;
  const avant = h.email_choisi;
  if (h.email_choisi && !deja[h.email_choisi]) return false;
  const libre = h.emails.find(c => !deja[c.email]);
  if (libre) h.email_choisi = libre.email;
  else if (h.emails.length || h.email_choisi) h.statut = 'deja_contacte';
  return h.email_choisi !== avant || h.statut !== 'nouveau';
}

function listeHotels(recherche) {
  const deja = adressesContactees_();
  // une adresse peut avoir été contactée via un autre hôtel (chaînes) : on bascule sur une adresse libre
  const tous = lireHotels_(), changes = tous.filter(h => choisirAdresseLibre_(h, deja));
  if (changes.length) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { ecrireHotels_(changes); } finally { lock.releaseLock(); }
  }
  return tous
    .filter(h => !recherche || h.recherche === recherche)
    .reverse()
    .map(h => {
      h.emails.forEach(c => { c.deja_envoye = !!deja[c.email]; });
      h.deja_envoye = !!deja[String(h.email_choisi || '').toLowerCase()];
      delete h._ligne;
      return h;
    });
}

function apercu(id) {
  const h = hotel_(id);
  const l = construireLettre_(h, CONFIG);
  return {
    objet: h.objet_perso || l.objet, corps: h.corps_perso || l.corps,
    perso: !!(h.objet_perso || h.corps_perso), email: h.email_choisi,
    cv: nomFichierCv_(h.nom, CONFIG, '.pdf'),
  };
}

function modifierHotel(id, champs) {
  const autorises = ['email_choisi', 'statut', 'objet_perso', 'corps_perso', 'segment', 'chambres', 'etoiles', 'marque'];
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const h = hotel_(id);
    autorises.forEach(k => { if (k in champs) h[k] = champs[k]; });
    if (h.email_choisi) h.email_choisi = String(h.email_choisi).trim().toLowerCase();
    ecrireHotels_([h]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** 3. Envoi d'une candidature (la page appelle cette fonction mail par mail). */
function envoyer(id) {
  const compte = Session.getEffectiveUser().getEmail().toLowerCase();
  if (compte !== CONFIG.email.toLowerCase()) {
    throw new Error('Le script tourne sur ' + compte + ' : installez-le sur ' + CONFIG.email + ' pour envoyer depuis cette adresse.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const h = hotel_(id);
    const to = String(h.email_choisi || '').trim().toLowerCase();
    if (!to) throw new Error(h.nom + ' : pas d\'adresse choisie');
    if (h.statut === 'envoye') throw new Error(h.nom + ' : déjà envoyé');
    if (adressesContactees_()[to]) {
      h.statut = 'deja_contacte'; ecrireHotels_([h]);
      throw new Error(to + ' a déjà reçu une candidature : envoi bloqué');
    }
    const ancien = dejaDansGmail_(to);   // envoyé à la main ou par une ancienne version de l'outil
    if (ancien) {
      noterEnvoi_(to, h.id, h.nom + ' (trouvé dans Gmail)', ancien.objet, ancien.date);
      h.statut = 'deja_contacte'; ecrireHotels_([h]);
      throw new Error(to + ' a déjà reçu un mail de votre part le ' + ancien.date.slice(0, 10) + ' : envoi bloqué');
    }
    if (envoisDuJour_() >= CONFIG.limiteParJour) throw new Error('Limite quotidienne atteinte');
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Quota Gmail du jour épuisé');

    const l = construireLettre_(h, CONFIG);
    const objet = h.objet_perso || l.objet;
    const corps = h.corps_perso || l.corps;
    const cv = cvBlob_().setName(nomFichierCv_(h.nom, CONFIG, '.pdf'));
    const options = { attachments: [cv], name: CONFIG.prenom + ' ' + CONFIG.nom, replyTo: CONFIG.email };
    GmailApp.sendEmail(to, objet, corps, options);
    noterEnvoi_(to, h.id, h.nom, objet, maintenant_());
    h.statut = 'envoye';
    ecrireHotels_([h]);
    if (CONFIG.copieCvDrive) dossierCopies_().createFile(cv);
    return { hotel: h.nom, email: to };
  } finally {
    lock.releaseLock();
  }
}

function noterEnvoi_(email, hotelId, hotelNom, objet, date) {
  const env = feuille_('Envois');
  env.getRange(env.getLastRow() + 1, 1, 1, COLS_ENVOIS.length).setNumberFormat('@')
    .setValues([[email, hotelId, hotelNom, objet, date]]);
}

function dejaDansGmail_(email) {
  const fils = GmailApp.search('in:sent to:"' + email.replace(/"/g, '') + '"', 0, 1);
  if (!fils.length) return null;
  const m = fils[0].getMessages().filter(x => x.getTo().toLowerCase().indexOf(email) >= 0).pop() || fils[0].getMessages()[0];
  return { objet: m.getSubject(), date: Utilities.formatDate(m.getDate(), 'Europe/Paris', "yyyy-MM-dd'T'HH:mm:ss") };
}

/** Ajoute à l'onglet Envois les candidatures trouvées dans "Messages envoyés" de Gmail (envoyées hors de l'outil).
 *  Retourne le nombre d'adresses ajoutées. */
function synchroniserEnvoisGmail() {
  const moi = Session.getEffectiveUser().getEmail().toLowerCase();
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const deja = adressesContactees_();
    let ajouts = 0;
    for (let debut = 0; debut < 2000; debut += 100) {
      const fils = GmailApp.search('in:sent subject:"Candidature spontanée"', debut, 100);
      fils.forEach(f => f.getMessages().forEach(m => {
        if (m.getFrom().toLowerCase().indexOf(moi) < 0) return;
        const date = Utilities.formatDate(m.getDate(), 'Europe/Paris', "yyyy-MM-dd'T'HH:mm:ss");
        ((m.getTo() + ',' + m.getCc()).toLowerCase().match(EMAIL_RE) || []).forEach(e => {
          if (e === moi || deja[e]) return;
          deja[e] = true; ajouts++;
          noterEnvoi_(e, '', '(trouvé dans Gmail)', m.getSubject(), date);
        });
      }));
      if (fils.length < 100) break;
    }
    return ajouts;
  } finally {
    lock.releaseLock();
  }
}

function historique() { return lireEnvois_().reverse(); }

function hotel_(id) {
  const h = lireHotels_().find(x => Number(x.id) === Number(id));
  if (!h) throw new Error('Hôtel introuvable : ' + id);
  return h;
}

/** Le fichier CV_Leopold_Watchi.pdf le plus récent du Drive (s'il y en a plusieurs du même nom). */
function fichierCv_() {
  const it = DriveApp.searchFiles('title = "' + CONFIG.cvNom.replace(/"/g, '') + '" and trashed = false');
  let cv = null;
  while (it.hasNext()) {
    const f = it.next();
    if (f.getMimeType() !== MimeType.PDF) continue;
    if (!cv || f.getLastUpdated() > cv.getLastUpdated()) cv = f;
  }
  if (!cv) throw new Error('CV introuvable : déposez ' + CONFIG.cvNom + ' (en PDF) dans votre Google Drive');
  return cv;
}

function infoCv_() {
  try {
    const f = fichierCv_();
    return { ok: true, date: Utilities.formatDate(f.getLastUpdated(), 'Europe/Paris', "dd/MM/yyyy 'à' HH:mm"), url: f.getUrl() };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
}

let cvCache_ = null;
function cvBlob_() {
  if (!cvCache_) cvCache_ = fichierCv_().getBlob();
  return cvCache_.copyBlob();
}

function dossierCopies_() {
  const it = DriveApp.getFoldersByName('Candidatures hôtels - CV envoyés');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Candidatures hôtels - CV envoyés');
}

/** À lancer depuis l'éditeur (bouton Exécuter) après chaque copier-coller du code :
 *  donne les autorisations, vérifie le CV et s'envoie un mail de contrôle avec le CV joint. */
function installer() {
  const ss = classeur_();
  const cv = cvBlob_().setName(nomFichierCv_('Hôtel Exemple', CONFIG, '.pdf'));
  ScriptApp.getProjectTriggers();   // autorisation pour l'analyse en arrière-plan
  Logger.log('Candidatures retrouvées dans Gmail et ajoutées au suivi : ' + synchroniserEnvoisGmail());
  const compte = Session.getEffectiveUser().getEmail();
  Logger.log('Suivi : ' + ss.getUrl());
  Logger.log('CV utilisé : ' + CONFIG.cvNom + ' du ' + infoCv_().date + ' (' + Math.round(cv.getBytes().length / 1024) + ' Ko)');
  Logger.log('Compte : ' + compte + (compte.toLowerCase() === CONFIG.email.toLowerCase() ? ' ✔' : ' ✘ ce n\'est pas ' + CONFIG.email));
  const l = construireLettre_({ nom: 'Hôtel Exemple', ville: 'Lyon', segment: 'independant' }, CONFIG);
  GmailApp.sendEmail(compte, '[Contrôle] ' + l.objet, l.corps,
    { attachments: [cv], name: CONFIG.prenom + ' ' + CONFIG.nom, replyTo: CONFIG.email });
  Logger.log('Mail de contrôle envoyé à vous-même (' + compte + ') : vérifiez votre boîte de réception.');
  Logger.log('Depuis la page, les candidatures partent directement à l\'adresse de chaque hôtel.');
  Logger.log('Quota Gmail restant aujourd\'hui : ' + MailApp.getRemainingDailyQuota());
}

// ============================================================ OPENSTREETMAP

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

function hotelsOsm_(ville) {
  const nom = ville.replace(/[\\^$.*+?()[\]{}|"]/g, '\\$&');
  const q = '[out:json][timeout:90];' +
    'area["ISO3166-1"="FR"][admin_level=2]->.fr;' +
    'rel(area.fr)["boundary"="administrative"]["admin_level"~"^(8|9|10)$"]["name"~"^' + nom + '$",i];' +
    'map_to_area->.a;' +
    '(nwr["tourism"="hotel"](area.a);nwr["tourism"="guest_house"]["website"](area.a););' +
    'out center tags;';
  let data = null, erreur = '';
  for (const url of OVERPASS) {
    try {
      const r = UrlFetchApp.fetch(url, { method: 'post', payload: { data: q }, muteHttpExceptions: true });
      if (r.getResponseCode() === 200) { data = JSON.parse(r.getContentText()); break; }
      erreur = 'code ' + r.getResponseCode();
    } catch (e) { erreur = e.message; }
  }
  if (!data) throw new Error('OpenStreetMap ne répond pas (' + erreur + '), réessayez dans une minute.');
  return hotelsDepuisOsm_(data, ville);
}

function hotelsDepuisOsm_(data, ville) {
  const out = [];
  (data.elements || []).forEach(el => {
    const t = el.tags || {};
    if (!t.name) return;
    const site = t.website || t['contact:website'] || t.url || '';
    const mail = t.email || t['contact:email'] || '';
    if (!site && !mail) return;
    out.push({
      cle: 'osm:' + el.type + '/' + el.id,
      nom: t.name.trim(),
      ville: t['addr:city'] || ville,
      adresse: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
      site: site.trim(),
      etoiles: entier_(t.stars), chambres: entier_(t.rooms),
      marque: t.brand || '',
      emails_osm: mail.split(/[;,\s]+/).filter(e => e.indexOf('@') > 0).map(e => e.toLowerCase()),
    });
  });
  return out;
}

function entier_(v) { const m = String(v || '').match(/\d+/); return m ? Number(m[0]) : null; }

// ============================================================ ANALYSE DES SITES

// Pages visitées en plus de l'accueil, par ordre d'intérêt : recrutement > mentions légales > contact
const LIENS_RECRUTEMENT = /recrut|emploi|carri[eè]re|career|jobs?\b|rejoin|nous-rejoindre|join-us|work-with-us|travailler|candidature/i;
const LIENS_MENTIONS = /mention|legal|impressum/i;
const LIENS_CONTACT = /contact|nous-ecrire|acces|nous-trouver/i;
const PAGES_PRIORITAIRES = /recrut|emploi|carri|job|rejoin|candidature|mention|legal/i;
const MAX_SOUS_PAGES = 3;

/** Récupère plusieurs URLs en parallèle. Une URL en erreur donne null (sans bloquer les autres). */
function recupererPages_(urls) {
  if (!urls.length) return [];
  const req = urls.map(u => ({ url: u, muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false,
    headers: { 'Accept-Language': 'fr-FR,fr;q=0.9' } }));
  let rep;
  try {
    rep = UrlFetchApp.fetchAll(req);
  } catch (e) {
    rep = req.map(r => { try { return UrlFetchApp.fetch(r.url, r); } catch (err) { return null; } });
  }
  return rep.map(r => {
    if (!r || r.getResponseCode() !== 200) return null;
    const type = String(r.getHeaders()['Content-Type'] || r.getHeaders()['content-type'] || 'text/html');
    return type.indexOf('html') >= 0 ? r.getContentText() : null;
  });
}

function crawlLot_(hotels) {
  hotels.forEach(h => {
    h._trouves = {};
    (h.emails || []).forEach(c => { if (c.source !== 'déduite') h._trouves[c.email] = c.source; });
    h._infos = { chambres: null, etoiles: null };
    h._contexte = {};
    h.site = normaliserUrl_(h.site);
  });
  const avecSite = hotels.filter(h => h.site);
  const accueils = recupererPages_(avecSite.map(h => h.site));
  const sous = [];
  avecSite.forEach((h, i) => {
    const html = accueils[i];
    if (!html) return;
    recolter_(html, h.site, h);
    liensUtiles_(html, h.site).forEach(u => sous.push({ h: h, url: u }));
  });
  const pages = recupererPages_(sous.map(s => s.url));
  sous.forEach((s, i) => { if (pages[i]) recolter_(pages[i], s.url, s.h); });
  hotels.forEach(finaliserHotel_);
  return hotels;
}

function normaliserUrl_(u) {
  u = String(u || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : 'http://' + u;
}

function liensUtiles_(html, base) {
  const dom = domaineSite_(base), vus = {}, liens = [];
  vus[base.split('#')[0]] = true;
  const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1].trim();
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    const url = resoudreUrl_(base, href).split('#')[0];
    if (!url || domaineSite_(url) !== dom || vus[url]) continue;
    const libelle = m[2].replace(/<[^>]+>/g, ' ') + ' ' + href;
    const rang = LIENS_RECRUTEMENT.test(libelle) ? 0 : LIENS_MENTIONS.test(libelle) ? 1 : LIENS_CONTACT.test(libelle) ? 2 : -1;
    if (rang >= 0) { vus[url] = true; liens.push({ url: url, rang: rang }); }
  }
  if (!liens.some(l => l.rang === 2)) liens.push({ url: resoudreUrl_(base, '/contact'), rang: 3 });
  liens.sort((a, b) => a.rang - b.rang);
  return liens.slice(0, MAX_SOUS_PAGES).map(l => l.url);
}

function resoudreUrl_(base, href) {
  const b = base.match(/^(https?:)\/\/([^/?#]+)([^?#]*)/i);
  if (!b) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (href.indexOf('//') === 0) return b[1] + href;
  if (href.charAt(0) === '/') return b[1] + '//' + b[2] + href;
  const dir = b[3].replace(/[^/]*$/, '') || '/';
  return b[1] + '//' + b[2] + dir + href.replace(/^\.\//, '');
}

function recolter_(html, url, h) {
  extraireEmails_(html).forEach(e => {
    if (!(e in h._trouves) || PAGES_PRIORITAIRES.test(url)) h._trouves[e] = url;
  });
  const texte = texteBrut_(html);
  const ctx = contexteEmails_(texte);
  for (const e in ctx) if (!h._contexte[e] || ctx[e] === 'recrutement') h._contexte[e] = ctx[e];
  if (!h._infos.chambres) {
    const m = texte.match(/\b(\d{1,3})\s+(?:chambres|rooms|chambres et suites)\b/i);
    if (m && Number(m[1]) >= 2) h._infos.chambres = Number(m[1]);
  }
  if (!h._infos.etoiles) {
    const m = texte.match(/\b([1-5])\s*(?:étoiles|etoiles|\*|★)/i);
    if (m) h._infos.etoiles = Number(m[1]);
  }
}

function texteBrut_(html) {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\s[^>]*href\s*=\s*["']mailto:([^"'?]+)[^>]*>([\s\S]*?)<\/a>/gi, ' $2 $1 ')  // garde l'adresse des liens mailto
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&#64;|&commat;/g, '@')
    .replace(/\s+/g, ' ');
}

/** Ce que dit le texte juste avant une adresse : "Recrutement : jobs@...", "Envoyez votre CV à ...", "Réservations : ..." */
function contexteEmails_(texte) {
  const out = {};
  let m, finPrecedente = 0;
  const re = new RegExp(EMAIL_RE.source, 'g');
  while ((m = re.exec(texte))) {
    // texte qui précède l'adresse, sans remonter au-delà de l'adresse précédente
    const avant = texte.slice(Math.max(finPrecedente, m.index - 90), m.index).toLowerCase();
    finPrecedente = m.index + m[0].length;
    const e = m[0].toLowerCase();
    if (/recrut|candidat|emploi|\bcv\b|rejoindre|carri[eè]re|job|ressources humaines|\brh\b|postuler/.test(avant)) out[e] = 'recrutement';
    else if (/directeur|directrice|direction|g[ée]rant|general manager|propri[ée]taire/.test(avant)) out[e] = out[e] || 'direction';
    else if (/r[ée]serv|booking|s[ée]minaire|[ée]v[ée]nement|restaurant|spa\b/.test(avant)) out[e] = out[e] || 'client';
  }
  return out;
}

function finaliserHotel_(h) {
  h.chambres = h.chambres || h._infos.chambres;
  h.etoiles = h.etoiles || h._infos.etoiles;
  h.marque = detecterChaine_(h);
  const classees = classer_(h._trouves, h.site, h._contexte);
  const connues = {};
  classees.forEach(c => { connues[c.email] = true; });
  devinerAccor_(h.site).forEach(g => {
    if (connues[g]) return;
    const s = scoreEmail_(g, h.site, '');
    classees.push({ email: g, score: s.score - 5, raisons: s.raisons.concat(['déduite (convention Accor, non vérifiée)']), source: 'déduite' });
  });
  classees.sort((a, b) => b.score - a.score);
  h.emails = classees;
  h.segment = segment_(h);
  delete h._trouves; delete h._infos; delete h._contexte;
  return h;
}

// ============================================================ CHOIX DE L'ADRESSE E-MAIL
//  1. RH / recrutement / emploi        -> le canal prévu pour les candidatures
//     (+ bonus si le site la présente comme telle : "Recrutement : ...", "Envoyez votre CV à ...")
//  2. direction / directeur / GM       -> la personne qu'on veut assister
//  3. prenom.nom@domaine-de-l-hotel    -> souvent le directeur ou le gérant
//  4. contact / info / accueil         -> générique mais lu par l'équipe
//  5. réservation / booking / commercial -> adresses clients, à éviter
//  Les adresses techniques (noreply, webmaster, rgpd, prestataires web...) sont exclues.

const EMAIL_RE = /[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,10}/g;
const OBFUSQUE_RE = /([A-Za-z0-9._%+-]+)\s*[\[\(\{]\s*(?:at|arobase|@)\s*[\]\)\}]\s*([A-Za-z0-9-]+(?:\s*(?:[\[\(\{]\s*(?:dot|point)\s*[\]\)\}]|\.)\s*[A-Za-z0-9-]+)+)/gi;
const EXTENSIONS_FICHIER = /\.(png|jpe?g|gif|webp|svg|css|js|avif)$/i;
const EXCLURE = /(no-?reply|ne-?pas-?repondre|donotreply|webmaster|postmaster|mailer-daemon|abuse|privacy|rgpd|gdpr|dpo|cnil|unsubscribe|desinscription|example|exemple|votre-?email|your-?email|^nom@|^email@|^test@|sentry|wixpress|wordpress|squarespace|godaddy|ovh\.net|domain\.com|sitedomain|@2x|@3x)/i;
const DOMAINES_ETRANGERS = ['sentry.io', 'wix.com', 'wixpress.com', 'booking.com', 'expedia.com', 'tripadvisor.com',
  'tripadvisor.fr', 'hotels.com', 'google.com', 'facebook.com', 'instagram.com', 'w3.org', 'schema.org',
  'mailchimp.com', 'sendinblue.com', 'brevo.com', 'd-edge.com', 'availpro.com', 'reservit.com', 'synxis.com',
  'cloudflare.com', 'jquery.com'];
const MESSAGERIES_PERSO = ['gmail.com', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'hotmail.fr', 'hotmail.com',
  'yahoo.fr', 'yahoo.com', 'outlook.fr', 'outlook.com', 'laposte.net', 'neuf.fr', 'live.fr', 'icloud.com'];

const REGLES = [
  [/(^|[._-])(direction|directeur|directrice|director|dg|gm|general-?manager|gerant|gerance|manager|management)([._-]|\d|$)/, 50, 'direction'],
  [/(^|[._-])(rh|drh|hr|recrutement|recrutements|recruitment|recrut|jobs?|emplois?|careers?|carrieres?|candidatures?|talents?|people)([._-]|\d|$)/, 55, 'RH / recrutement'],
  [/(^|[._-])(resa|reservations?|booking|bookings|sales|commercial|ventes?|events?|evenements?|seminaires?|groupes?|groups|mice|banquets?|restaurant|bar|spa|presse|press|marketing|compta|comptabilite|factur|billing|achats?)([._-]|\d|$)/, -40, 'adresse client / service'],
  [/(^|[._-])(contact|info|infos|information|hello|bonjour|accueil|reception|hotel|welcome)([._-]|\d|$)/, 20, 'contact général'],
];
const NOMINATIVE_RE = /^[a-z]{2,}[._-][a-z]{2,}$/;
const ACCOR_RE = /^h(\d{4})(-[a-z]{2})?@accor\.com$/i;

function decoderCfEmail_(hex) {
  const cle = parseInt(hex.substr(0, 2), 16);
  let s = '';
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ cle);
  return s;
}

function extraireEmails_(html) {
  const trouves = {};
  const texte = html.replace(/&#64;|&commat;|%40/g, '@');
  (texte.match(EMAIL_RE) || []).forEach(e => { trouves[e] = 1; });
  let m;
  OBFUSQUE_RE.lastIndex = 0;
  while ((m = OBFUSQUE_RE.exec(texte))) {
    const dom = m[2].replace(/\s*[\[\(\{]\s*(?:dot|point)\s*[\]\)\}]\s*/gi, '.').replace(/\s/g, '');
    trouves[m[1] + '@' + dom] = 1;
  }
  const cf = /data-cfemail="([0-9a-fA-F]+)"/g;
  while ((m = cf.exec(html))) trouves[decoderCfEmail_(m[1])] = 1;
  return Object.keys(trouves)
    .map(e => e.replace(/^[.\-_]+|[.\-_]+$/g, '').toLowerCase())
    .filter(e => /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,10}$/.test(e))
    .filter(e => !EXTENSIONS_FICHIER.test(e) && !EXCLURE.test(e) && DOMAINES_ETRANGERS.indexOf(e.split('@')[1]) < 0)
    .filter((e, i, a) => a.indexOf(e) === i);
}

function domaineSite_(url) {
  const m = String(url || '').toLowerCase().match(/^(?:https?:\/\/)?([^/:?#]+)/);
  const host = m ? m[1] : '';
  return host.indexOf('www.') === 0 ? host.slice(4) : host;
}

function racine_(dom) { return dom.split('.').slice(-2).join('.'); }

function scoreEmail_(email, site, source, contexte) {
  const parts = email.toLowerCase().split('@'), local = parts[0], dom = parts[1];
  let score = 0, raisons = [];
  const regle = REGLES.find(r => r[0].test(local));
  if (regle) { score += regle[1]; raisons.push(regle[2]); }
  else if (NOMINATIVE_RE.test(local) && MESSAGERIES_PERSO.indexOf(dom) < 0) { score += 35; raisons.push('adresse nominative'); }
  else { score += 10; raisons.push('adresse non identifiée'); }

  const a = email.match(ACCOR_RE);
  if (a) {
    const suf = (a[2] || '').toLowerCase();
    if (suf === '-gm') { score = 55; raisons = ['direction (Accor GM)']; }
    else if (suf === '-hr' || suf === '-rh') { score = 50; raisons = ['RH (Accor)']; }
    else if (suf === '' || suf === '-re' || suf === '-fo') { score = 18; raisons = ['réception (Accor)']; }
    else { score = -30; raisons = ['service Accor (' + suf.slice(1).toUpperCase() + ')']; }
  }

  const web = site ? domaineSite_(site) : '';
  if (web && racine_(dom) === racine_(web)) { score += 15; raisons.push('même domaine que le site'); }
  else if (MESSAGERIES_PERSO.indexOf(dom) >= 0) { score += 3; raisons.push('messagerie perso (petit établissement ?)'); }
  else if (web) { score -= 10; raisons.push('domaine différent du site'); }

  if (contexte === 'recrutement') { score += 45; raisons.push('indiquée pour le recrutement sur le site'); }
  else if (contexte === 'direction') { score += 15; raisons.push('indiquée comme adresse de la direction'); }
  else if (contexte === 'client') { score -= 15; raisons.push('indiquée pour les réservations'); }

  const src = String(source || '').toLowerCase();
  if (/recrut|emploi|carriere|career|job|rejoindre|join/.test(src)) { score += 10; raisons.push('trouvée sur la page recrutement'); }
  else if (/mention|legal|impressum/.test(src)) { score += 5; raisons.push('trouvée dans les mentions légales'); }
  return { score: score, raisons: raisons };
}

function classer_(trouves, site, contexte) {
  return Object.keys(trouves).map(e => {
    const s = scoreEmail_(e, site, trouves[e], (contexte || {})[e]);
    return { email: e, score: s.score, raisons: s.raisons, source: trouves[e] };
  }).sort((a, b) => b.score - a.score || a.email.length - b.email.length);
}

/** Hôtels Accor : convention H1234@accor.com (réception) / H1234-GM@accor.com (directeur). */
function devinerAccor_(site) {
  const m = String(site || '').match(/accor\.com\/(?:[a-z]{2}\/)?hotel\/(\d{4})/i);
  return m ? ['h' + m[1] + '-gm@accor.com', 'h' + m[1] + '@accor.com'] : [];
}

// ============================================================ TYPE D'HÔTEL
// Le type choisit le paragraphe de la lettre : il doit être juste, sinon la lettre tombe à côté.
// Il reste modifiable à la main dans le tableau.

// [motif dans le nom ou la marque, libellé utilisé dans la lettre, type]  (les motifs longs d'abord)
const ENSEIGNES = [
  ['ibis budget', 'ibis budget', 'economique'], ['ibis styles', 'ibis Styles', 'economique'], ['ibis', 'ibis', 'economique'],
  ['hotelf1', 'hotelF1', 'economique'], ['hôtel f1', 'hotelF1', 'economique'], ['hotel f1', 'hotelF1', 'economique'],
  ['b&b hotel', 'B&B', 'economique'], ['b&b hôtel', 'B&B', 'economique'], ['premiere classe', 'Première Classe', 'economique'],
  ['première classe', 'Première Classe', 'economique'], ['campanile', 'Campanile', 'economique'], ['kyriad', 'Kyriad', 'economique'],
  ['fasthotel', 'Fasthotel', 'economique'], ['brit hotel', 'Brit Hotel', 'economique'], ['greet', 'Greet', 'economique'],
  ['ace hotel', 'Ace Hotel', 'economique'], ['quick palace', 'Quick Palace', 'economique'], ['balladins', 'Balladins', 'economique'],
  ['hampton', 'Hampton by Hilton', 'economique'], ['holiday inn express', 'Holiday Inn Express', 'economique'],

  ['aparthotel adagio', 'Adagio', 'residence'], ['adagio', 'Adagio', 'residence'], ['citadines', 'Citadines', 'residence'],
  ["appart'city", "Appart'City", 'residence'], ['appart city', "Appart'City", 'residence'], ['staycity', 'Staycity', 'residence'],
  ['odalys', 'Odalys', 'residence'], ['zenitude', 'Zenitude', 'residence'], ['séjours & affaires', 'Séjours & Affaires', 'residence'],
  ['sejours & affaires', 'Séjours & Affaires', 'residence'], ['residence inn', 'Residence Inn', 'residence'],
  ['nemea', 'Nemea', 'residence'], ['lagrange', 'Lagrange', 'residence'], ['pierre & vacances', 'Pierre & Vacances', 'residence'],

  ['sofitel', 'Sofitel', 'luxe'], ['raffles', 'Raffles', 'luxe'], ['fairmont', 'Fairmont', 'luxe'],
  ['four seasons', 'Four Seasons', 'luxe'], ['ritz', 'Ritz', 'luxe'], ['shangri-la', 'Shangri-La', 'luxe'],
  ['peninsula', 'Peninsula', 'luxe'], ['mandarin oriental', 'Mandarin Oriental', 'luxe'], ['waldorf', 'Waldorf Astoria', 'luxe'],
  ['park hyatt', 'Park Hyatt', 'luxe'], ['barrière', 'Barrière', 'luxe'], ['cheval blanc', 'Cheval Blanc', 'luxe'],
  ['st. regis', 'St. Regis', 'luxe'], ['bulgari', 'Bulgari', 'luxe'],

  ['mercure', 'Mercure', 'groupe'], ['novotel', 'Novotel', 'groupe'], ['pullman', 'Pullman', 'groupe'],
  ['mgallery', 'MGallery', 'groupe'], ['golden tulip', 'Golden Tulip', 'groupe'], ['tulip inn', 'Tulip Inn', 'groupe'],
  ['best western', 'Best Western', 'groupe'], ['holiday inn', 'Holiday Inn', 'groupe'], ['crowne plaza', 'Crowne Plaza', 'groupe'],
  ['intercontinental', 'InterContinental', 'groupe'], ['doubletree', 'DoubleTree by Hilton', 'groupe'], ['hilton', 'Hilton', 'groupe'],
  ['marriott', 'Marriott', 'groupe'], ['courtyard', 'Courtyard by Marriott', 'groupe'], ['moxy', 'Moxy', 'groupe'],
  ['ac hotel', 'AC Hotels', 'groupe'], ['renaissance', 'Renaissance', 'groupe'], ['radisson', 'Radisson', 'groupe'],
  ['park inn', 'Park Inn', 'groupe'], ['hyatt', 'Hyatt', 'groupe'], ['okko', 'Okko', 'groupe'],
  ['the originals', 'The Originals', 'groupe'], ['mama shelter', 'Mama Shelter', 'groupe'], ['comfort hotel', 'Comfort', 'groupe'],
  ['quality hotel', 'Quality', 'groupe'], ['clarion', 'Clarion', 'groupe'], ['kopster', 'Kopster', 'groupe'],
];
const DOMAINES_ENSEIGNES = { 'hotel-bb.com': ['B&B', 'economique'], 'appartcity.com': ["Appart'City", 'residence'],
  'adagio-city.com': ['Adagio', 'residence'], 'citadines.com': ['Citadines', 'residence'], 'brithotel.fr': ['Brit Hotel', 'economique'],
  'campanile.com': ['Campanile', 'economique'], 'kyriad.com': ['Kyriad', 'economique'], 'premiereclasse.com': ['Première Classe', 'economique'],
  'bestwestern': ['Best Western', 'groupe'], 'marriott.com': ['Marriott', 'groupe'], 'hilton.com': ['Hilton', 'groupe'],
  'ihg.com': ['IHG', 'groupe'], 'radissonhotels.com': ['Radisson', 'groupe'], 'hyatt.com': ['Hyatt', 'groupe'],
  'okkohotels.com': ['Okko', 'groupe'], 'accor.com': ['Accor', 'groupe'] };

function chercherEnseigne_(texte) {
  const t = String(texte || '').toLowerCase();
  for (const e of ENSEIGNES) {
    const re = new RegExp('(^|[^a-zà-ÿ])' + e[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-zà-ÿ]|$)');
    if (re.test(t)) return { marque: e[1], type: e[2] };
  }
  return null;
}

/** { marque, type } d'après la marque OpenStreetMap, le nom, puis le site. */
function enseigne_(h) {
  const parMarque = chercherEnseigne_(h.marque) || chercherEnseigne_(h.nom);
  if (parMarque) return parMarque;
  const site = String(h.site || '').toLowerCase();
  for (const d in DOMAINES_ENSEIGNES) if (site.indexOf(d) >= 0) return { marque: DOMAINES_ENSEIGNES[d][0], type: DOMAINES_ENSEIGNES[d][1] };
  return h.marque ? { marque: h.marque, type: 'groupe' } : null;
}

function detecterChaine_(h) { const e = enseigne_(h); return e ? e.marque : ''; }

/** independant | intermediaire | groupe | economique | residence | luxe */
function segment_(h) {
  const e = enseigne_(h);
  const etoiles = h.etoiles || 0;
  if (etoiles >= 5 || (e && e.type === 'luxe')) return 'luxe';
  if (e) return e.type;
  if (/(^|[^a-zà-ÿ])(r[ée]sidence|appart'?h[oô]tel|aparth[oô]tel|apparth[oô]tel)([^a-zà-ÿ]|$)/i.test(h.nom || '')) return 'residence';
  if (h.chambres && h.chambres > 45) return 'intermediaire';
  if (etoiles === 4) return 'intermediaire';
  if (etoiles && etoiles <= 2 && h.chambres && h.chambres > 30) return 'economique';
  return 'independant';
}
