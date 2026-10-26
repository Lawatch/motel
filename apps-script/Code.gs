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

  cvNom: 'CV_Leopold_Watchi',          // nom du CV dans Google Drive (PDF ou Google Doc, sans l'extension)

  modeTest: true,                      // true : tout part vers adresseTest, rien n'est marqué comme envoyé
  adresseTest: 'leo.watchi@gmail.com',

  limiteParJour: 60,
  delaiEntreEnvoisSec: [6, 15],        // pause aléatoire entre deux mails
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
    modeTest: CONFIG.modeTest,
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

/** 1. Liste des hôtels d'une ville (OpenStreetMap). Retourne les id à analyser. */
function scanVille(ville, limite) {
  ville = String(ville || '').trim();
  if (!ville) throw new Error('Indiquez une ville');
  const trouves = hotelsOsm_(ville).slice(0, limite || 150);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existants = lireHotels_();
    const parCle = {};
    existants.forEach(h => { parCle[h.cle] = h; });
    let maxId = existants.reduce((m, h) => Math.max(m, Number(h.id) || 0), 0);
    const nouveaux = [], aAnalyser = [], maj = [];
    trouves.forEach(t => {
      const h = parCle[t.cle];
      if (h) {
        h.recherche = ville; maj.push(h);
        if (h.statut === 'a_analyser') aAnalyser.push(h.id);
      } else {
        t.id = ++maxId; t.statut = 'a_analyser'; t.recherche = ville;
        t.emails = t.emails_osm.map(e => ({ email: e, source: 'OpenStreetMap' }));  // adresse indiquée sur la carte
        nouveaux.push(t); aAnalyser.push(t.id);
        parCle[t.cle] = t;
      }
    });
    if (nouveaux.length) {
      const sh = feuille_('Hôtels');
      sh.getRange(sh.getLastRow() + 1, 1, nouveaux.length, COLS.length).setValues(nouveaux.map(ligne_));
    }
    ecrireHotels_(maj);
    return { recherche: ville, total: trouves.length, aAnalyser: aAnalyser };
  } finally {
    lock.releaseLock();
  }
}

/** 2. Analyse des sites d'un petit lot d'hôtels (appelée en boucle par la page). */
function analyserLot(ids) {
  const set = {};
  ids.forEach(i => { set[i] = true; });
  const lot = lireHotels_().filter(h => set[h.id]);
  crawlLot_(lot);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const frais = {};
    lireHotels_().forEach(h => { frais[h.id] = h; });
    lot.forEach(h => {
      const f = frais[h.id];
      Object.assign(f, {
        emails: h.emails, chambres: h.chambres, etoiles: h.etoiles, marque: h.marque, segment: h.segment,
        statut: f.statut === 'a_analyser' ? 'nouveau' : f.statut, scanne_le: maintenant_(),
      });
      if (!f.email_choisi && h.emails.length) f.email_choisi = h.emails[0].email;
    });
    ecrireHotels_(lot.map(h => frais[h.id]));
  } finally {
    lock.releaseLock();
  }
  return lot.length;
}

function recherches() {
  const n = {}, ordre = [];
  lireHotels_().reverse().forEach(h => {
    if (!(h.recherche in n)) { n[h.recherche] = 0; ordre.push(h.recherche); }
    n[h.recherche]++;
  });
  return ordre.map(r => ({ recherche: r, n: n[r] }));
}

function listeHotels(recherche) {
  const deja = {};
  lireEnvois_().forEach(e => { deja[e.email] = true; });
  return lireHotels_()
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
    if (lireEnvois_().some(e => e.email === to)) {
      h.statut = 'ignore'; ecrireHotels_([h]);
      throw new Error(to + ' a déjà reçu une candidature : envoi annulé');
    }
    if (!CONFIG.modeTest && envoisDuJour_() >= CONFIG.limiteParJour) throw new Error('Limite quotidienne atteinte');
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Quota Gmail du jour épuisé');

    const l = construireLettre_(h, CONFIG);
    const objet = h.objet_perso || l.objet;
    const corps = h.corps_perso || l.corps;
    const cv = cvBlob_().setName(nomFichierCv_(h.nom, CONFIG, '.pdf'));
    const options = { attachments: [cv], name: CONFIG.prenom + ' ' + CONFIG.nom, replyTo: CONFIG.email };

    if (CONFIG.modeTest) {
      GmailApp.sendEmail(CONFIG.adresseTest, '[TEST -> ' + to + '] ' + objet, corps, options);
      return { test: true, hotel: h.nom };
    }
    GmailApp.sendEmail(to, objet, corps, options);
    feuille_('Envois').appendRow([to, h.id, h.nom, objet, maintenant_()]);
    h.statut = 'envoye';
    ecrireHotels_([h]);
    if (CONFIG.copieCvDrive) dossierCopies_().createFile(cv);
    return { test: false, hotel: h.nom };
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

let cvCache_ = null;
function cvBlob_() {
  if (!cvCache_) {
    const it = DriveApp.searchFiles('title contains "' + CONFIG.cvNom.replace(/"/g, '') + '" and trashed = false');
    let doc = null, pdf = null;
    while (it.hasNext()) {
      const f = it.next();
      if (f.getMimeType() === MimeType.PDF && !pdf) pdf = f;
      if (f.getMimeType() === MimeType.GOOGLE_DOCS && !doc) doc = f;
    }
    if (pdf) cvCache_ = pdf.getBlob();
    else if (doc) cvCache_ = doc.getAs(MimeType.PDF);
    else throw new Error('CV introuvable dans Google Drive (nom attendu : ' + CONFIG.cvNom + ', en PDF ou Google Doc)');
  }
  return cvCache_.copyBlob();
}

function dossierCopies_() {
  const it = DriveApp.getFoldersByName('Candidatures hôtels - CV envoyés');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Candidatures hôtels - CV envoyés');
}

/** À lancer une fois depuis l'éditeur (bouton Exécuter) pour donner les autorisations et vérifier le CV. */
function installer() {
  const ss = classeur_();
  const cv = cvBlob_();
  Logger.log('Suivi : ' + ss.getUrl());
  Logger.log('CV trouvé : ' + cv.getName() + ' (' + Math.round(cv.getBytes().length / 1024) + ' Ko)');
  Logger.log('Compte : ' + Session.getEffectiveUser().getEmail());
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

const INDICES_LIENS = /contact|mention|legal|recrut|emploi|carriere|career|job|rejoindre|equipe|team|about|a-propos|qui-sommes|notre-hotel|l-hotel|nous-trouver|acces|impressum/i;
const PAGES_PRIORITAIRES = /recrut|emploi|carri|job|mention|legal/i;
const CHEMINS_COURANTS = ['/contact', '/mentions-legales'];
const MAX_SOUS_PAGES = 6;

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
    if (INDICES_LIENS.test(m[2].replace(/<[^>]+>/g, ' ') + ' ' + href)) { vus[url] = true; liens.push(url); }
  }
  CHEMINS_COURANTS.forEach(p => { const u = resoudreUrl_(base, p); if (!vus[u]) { vus[u] = true; liens.push(u); } });
  liens.sort((a, b) => (PAGES_PRIORITAIRES.test(a) ? 0 : 1) - (PAGES_PRIORITAIRES.test(b) ? 0 : 1));
  return liens.slice(0, MAX_SOUS_PAGES);
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
  const texte = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&eacute;/g, 'é').replace(/\s+/g, ' ');
  if (!h._infos.chambres) {
    const m = texte.match(/\b(\d{1,3})\s+(?:chambres|rooms|chambres et suites)\b/i);
    if (m && Number(m[1]) >= 2) h._infos.chambres = Number(m[1]);
  }
  if (!h._infos.etoiles) {
    const m = texte.match(/\b([1-5])\s*(?:étoiles|etoiles|\*|★)/i);
    if (m) h._infos.etoiles = Number(m[1]);
  }
}

function finaliserHotel_(h) {
  h.chambres = h.chambres || h._infos.chambres;
  h.etoiles = h.etoiles || h._infos.etoiles;
  h.marque = detecterChaine_(h);
  const classees = classer_(h._trouves, h.site);
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
  delete h._trouves; delete h._infos;
  return h;
}

// ============================================================ CHOIX DE L'ADRESSE E-MAIL
//  1. direction / directeur / GM       -> la personne qu'on veut assister
//  2. RH / recrutement / emploi        -> le bon canal pour une candidature
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
  [/(^|[._-])(rh|drh|hr|recrutement|recrutements|recruitment|recrut|jobs?|emplois?|careers?|carrieres?|candidatures?|talents?|people)([._-]|\d|$)/, 45, 'RH / recrutement'],
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

function scoreEmail_(email, site, source) {
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

  const src = String(source || '').toLowerCase();
  if (/recrut|emploi|carriere|career|job|rejoindre|join/.test(src)) { score += 10; raisons.push('trouvée sur la page recrutement'); }
  else if (/mention|legal|impressum/.test(src)) { score += 5; raisons.push('trouvée dans les mentions légales'); }
  return { score: score, raisons: raisons };
}

function classer_(trouves, site) {
  return Object.keys(trouves).map(e => {
    const s = scoreEmail_(e, site, trouves[e]);
    return { email: e, score: s.score, raisons: s.raisons, source: trouves[e] };
  }).sort((a, b) => b.score - a.score || a.email.length - b.email.length);
}

/** Hôtels Accor : convention H1234@accor.com (réception) / H1234-GM@accor.com (directeur). */
function devinerAccor_(site) {
  const m = String(site || '').match(/accor\.com\/(?:[a-z]{2}\/)?hotel\/(\d{4})/i);
  return m ? ['h' + m[1] + '-gm@accor.com', 'h' + m[1] + '@accor.com'] : [];
}

// ============================================================ TYPE D'HÔTEL

const CHAINES = ['ibis', 'mercure', 'novotel', 'sofitel', 'pullman', 'mgallery', 'adagio', 'campanile', 'kyriad',
  'premiere classe', 'première classe', 'golden tulip', 'tulip inn', 'best western', 'b&b hotel', 'b&b hôtel',
  'holiday inn', 'crowne plaza', 'intercontinental', 'hilton', 'doubletree', 'hampton', 'marriott', 'courtyard',
  'moxy', 'ac hotel', 'renaissance', 'radisson', 'park inn', 'hyatt', 'citadines', 'okko', 'hotelf1', 'hôtel f1',
  'hotel f1', "appart'city", 'appart city', 'fasthotel', 'brit hotel', 'the originals', 'zenitude', 'odalys',
  'staycity', 'mama shelter', 'greet', 'comfort hotel', 'quality hotel', 'clarion', 'residence inn', 'nemea',
  'séjours & affaires', 'sejours & affaires'];
const DOMAINES_CHAINES = { 'accor.com': 'Accor', 'marriott.com': 'Marriott', 'hilton.com': 'Hilton', 'ihg.com': 'IHG',
  'bestwestern': 'Best Western', 'hotel-bb.com': 'B&B Hotels', 'choicehotels': 'Choice Hotels',
  'louvrehotels.com': 'Louvre Hotels', 'radissonhotels.com': 'Radisson', 'hyatt.com': 'Hyatt',
  'appartcity.com': "Appart'City", 'brithotel.fr': 'Brit Hotel', 'okkohotels.com': 'Okko' };

function detecterChaine_(h) {
  if (h.marque) return h.marque;
  const nom = String(h.nom || '').toLowerCase();
  for (const c of CHAINES) {
    const re = new RegExp('(^|[^a-zà-ÿ])' + c.replace(/[.*+?^${}()|[\]\\&']/g, '\\$&') + '([^a-zà-ÿ]|$)');
    if (re.test(nom)) return c === 'ibis' ? 'ibis' : c.replace(/(^|\s)\S/g, s => s.toUpperCase());
  }
  const site = String(h.site || '').toLowerCase();
  for (const d in DOMAINES_CHAINES) if (site.indexOf(d) >= 0) return DOMAINES_CHAINES[d];
  return '';
}

/** independant | intermediaire | groupe | luxe : choisit le paragraphe adapté dans la lettre. */
function segment_(h) {
  if ((h.etoiles || 0) >= 5) return 'luxe';
  if (h.marque) return 'groupe';
  if (h.chambres && h.chambres > 45) return 'intermediaire';
  if (h.etoiles === 4 && !h.chambres) return 'intermediaire';
  return 'independant';
}
