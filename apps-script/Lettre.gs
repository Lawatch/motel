/**
 * La lettre de motivation (corps du mail) : modifiez le texte entre les deux accents graves ` ci-dessous.
 *
 * - Chaque [section] contient une ou plusieurs variantes séparées par une ligne "--".
 *   Une variante est tirée au hasard (mais toujours la même pour un hôtel donné),
 *   pour que les 50 mails du jour ne soient pas mot pour mot identiques.
 * - Si une variante utilise une info inconnue (ex : {chambres} vide), elle est ignorée.
 * - [segment:xxx] : paragraphe choisi selon le type d'hôtel : independant | intermediaire | groupe | luxe
 * - [langues] est collé à la fin du paragraphe précédent (et omis pour les hôtels "luxe").
 *
 * Variables : {hotel} {de_hotel} {au_sein_de} {ville} {a_ville} {chambres} {etoiles} {marque}
 *             {prenom} {nom} {telephone} {email}
 */
const LETTRE = `

[objet]
Candidature spontanée - Adjoint à la direction - {hotel}

[ouverture]
Je me permets de vous adresser ma candidature spontanée pour un poste d'adjoint à la direction {au_sein_de}{a_ville}.
--
Je me permets de vous écrire pour vous proposer ma candidature spontanée à un poste d'adjoint à la direction {au_sein_de}{a_ville}.

[parcours]
Je travaille depuis février chez Batisanté, un groupe de services aux bâtiments (propreté, hygiène, sécurité incendie), où je m'occupe de l'intégration de nouvelles filiales. Une bonne partie de mon temps se passe avec les équipes sur le terrain, pour comprendre comment elles travaillent avant d'organiser les changements avec le siège. À Grenoble, par exemple, j'ai revu les tournées d'une équipe de 70 agents de propreté : 31 % de kilomètres en moins, sans que le service rendu aux clients en pâtisse.

Avant cela, j'ai suivi des travaux et des budgets d'entretien de sites chez Air Liquide, construit des prévisions financières dans la promotion immobilière, et participé à des missions d'audit chez Keolis. Ce sont des métiers très différents, et c'est ce qui m'a plu : à chaque fois, il a fallu apprendre vite et me rendre utile auprès de personnes qui connaissaient leur métier mieux que moi.
--
Depuis février, je suis chez Batisanté, un groupe de propreté, d'hygiène et de sécurité des bâtiments. J'y intègre de nouvelles filiales au fonctionnement du groupe, ce qui veut dire beaucoup de temps passé avec les équipes terrain, et autant à faire le lien avec le siège. Mon dernier chantier : réorganiser les tournées de 70 agents de propreté à Grenoble, avec 31 % de kilomètres en moins et la même qualité de service.

Auparavant, j'ai travaillé chez Air Liquide sur la gestion des sites (travaux, cahiers des charges, suivi des coûts), dans la promotion immobilière sur les prévisions financières, et chez Keolis en audit interne. J'ai donc pris l'habitude de changer de métier, d'en apprendre rapidement le fonctionnement et de m'y rendre utile.

[hotellerie]
Je n'ai pas encore travaillé dans l'hôtellerie, et je préfère vous le dire simplement. C'est pourtant un secteur qui m'attire depuis longtemps : dans un hôtel, l'organisation ne reste pas dans un tableau de bord, elle se voit tout de suite dans l'accueil, l'état d'une chambre ou la façon dont un imprévu est réglé. Après plusieurs postes où je travaillais souvent depuis un siège, j'ai envie d'être sur place, au quotidien, aux côtés d'une direction.
--
Je ne viens pas de l'hôtellerie. Ce qui m'y attire, c'est le lien direct entre le travail des équipes et ce que vit le client : un planning bien construit, une maintenance suivie, un accueil soigné, tout se ressent immédiatement. J'ai envie de quitter un peu les sièges pour un établissement où je vois chaque jour le résultat de ce que je fais, en assistant une direction.

[segment:independant]
Dans un établissement de {chambres} chambres comme le vôtre, je sais qu'un adjoint doit pouvoir passer d'un sujet à l'autre dans la même journée : un planning à ajuster, un fournisseur à relancer, un client à recevoir, un budget à suivre. C'est exactement ce type de poste que je recherche.
--
Dans un hôtel à taille humaine, je sais qu'un adjoint doit pouvoir passer d'un sujet à l'autre dans la même journée : un planning à ajuster, un fournisseur à relancer, un client à recevoir, un budget à suivre. C'est exactement ce type de poste que je recherche.
--
Dans un hôtel à taille humaine, l'adjoint n'a pas un seul sujet : il faut aussi bien aider à l'accueil un jour de forte affluence que suivre les dépenses ou relancer un artisan. C'est cette variété qui me plaît, et c'est là que je pense être le plus utile.

[segment:intermediaire]
Avec {chambres} chambres et plusieurs services qui doivent avancer ensemble, votre établissement demande une organisation solide. C'est là que je pense pouvoir vous être utile rapidement : suivre l'activité et les coûts, préparer les points avec la direction, faire le lien entre les équipes et veiller à ce que les décisions soient bien appliquées.
--
Dans un hôtel où plusieurs services doivent avancer ensemble, je pense pouvoir être utile rapidement : suivre l'activité et les coûts, préparer les points avec la direction, faire le lien entre les équipes et veiller à ce que les décisions soient bien appliquées.

[segment:groupe]
Travailler dans un hôtel {marque} m'intéresse aussi pour une raison précise : mon poste actuel consiste à faire le lien entre des établissements et les standards d'un groupe, en veillant à ce que les outils et les process du siège restent applicables sur le terrain. C'est un rôle que je me verrais bien tenir dans votre établissement.
--
Votre hôtel faisant partie du réseau {marque}, je pense que mon expérience actuelle peut vous servir : j'accompagne des établissements dans l'application des process et des outils d'un groupe, en tenant compte de leurs contraintes réelles. C'est une expérience que j'aimerais mettre à profit chez vous.

[segment:luxe]
Je mesure le niveau d'exigence d'un établissement {etoiles} étoiles comme le vôtre, où le client remarque tout. Chez Air Liquide comme chez Keolis, j'ai appris à aller dans le détail des processus pour repérer ce qui coince, et je crois que c'est une habitude utile dans un hôtel de ce niveau. J'ai par ailleurs étudié trois ans à Manchester et je parle anglais couramment, ainsi qu'espagnol.
--
Je mesure le niveau d'exigence d'un établissement comme le vôtre, où le client remarque tout. Chez Air Liquide comme chez Keolis, j'ai appris à aller dans le détail des processus pour repérer ce qui coince, et je crois que c'est une habitude utile dans un hôtel de ce niveau. J'ai par ailleurs étudié trois ans à Manchester et je parle anglais couramment, ainsi qu'espagnol.

[langues]
Je parle anglais couramment, après trois ans d'études à Manchester, et j'ai un bon niveau d'espagnol.
--
J'ai étudié trois ans à Manchester et je parle anglais couramment, ainsi qu'espagnol.

[conclusion]
Je serais heureux de vous rencontrer, ou simplement d'échanger par téléphone, pour voir si mon profil peut correspondre à vos besoins. Vous trouverez mon CV en pièce jointe.
--
Si ma démarche vous intéresse, je serais ravi d'en parler avec vous, par téléphone ou lors d'un rendez-vous. Mon CV est joint à ce message.

[politesse]
Je vous remercie pour le temps consacré à ma candidature et vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.
--
Je vous remercie de votre attention et vous prie d'agréer, Madame, Monsieur, mes sincères salutations.

[signature]
{prenom} {nom}
{telephone}
{email}
`;

const ORDRE_LETTRE = ['ouverture', 'parcours', 'hotellerie', 'segment', 'langues', 'conclusion', 'politesse'];
const CHAMPS_OPTIONNELS = ['chambres', 'etoiles', 'marque', 'ville'];

function lireModele_(texte) {
  const sections = {};
  let courante = null, tampon = [];
  const vider = () => {
    if (courante === null) return;
    sections[courante] = tampon.join('\n').split(/^--\s*$/m).map(v => v.replace(/^\n+|\n+$/g, '')).filter(v => v.trim());
  };
  texte.split('\n').forEach(l => {
    const m = l.match(/^\[([\w:]+)\]\s*$/);
    if (m) { vider(); courante = m[1]; tampon = []; } else tampon.push(l);
  });
  vider();
  return sections;
}

/** 'Hôtel du Parc' -> "de l'Hôtel du Parc", 'Le Grand Hôtel' -> 'du Grand Hôtel', 'Mercure Lyon' -> "de l'hôtel Mercure Lyon" */
function deHotel_(nom) {
  const n = String(nom).trim(), low = n.toLowerCase();
  if (/^l['’]/.test(low)) return 'de ' + n;
  if (/^(h[oô]tel|auberge|appart|aparth[oô]tel)/.test(low)) return "de l'" + n;
  if (low.indexOf('le ') === 0) return 'du ' + n.slice(3);
  if (low.indexOf('les ') === 0) return 'des ' + n.slice(4);
  if (low.indexOf('la ') === 0) return 'de la ' + n.slice(3);
  return "de l'hôtel " + n;
}

function champsLettre_(h, c) {
  const nom = String(h.nom).trim(), ville = String(h.ville || '').trim(), de = deHotel_(nom);
  return {
    hotel: nom, de_hotel: de, au_sein_de: 'au sein ' + de, ville: ville,
    a_ville: ville && nom.toLowerCase().indexOf(ville.toLowerCase()) < 0 ? ' à ' + ville : '',
    chambres: h.chambres ? String(h.chambres) : '', etoiles: h.etoiles ? String(h.etoiles) : '',
    marque: h.marque || '', prenom: c.prenom, nom: c.nom, telephone: c.telephone, email: c.email,
  };
}

function hash_(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

function choisirVariante_(variantes, f, graine) {
  const ok = (variantes || []).filter(v => (v.match(/\{(\w+)\}/g) || [])
    .every(x => { const k = x.slice(1, -1); return CHAMPS_OPTIONNELS.indexOf(k) < 0 || f[k]; }));
  if (!ok.length) return null;
  return ok[hash_(graine) % ok.length].replace(/\{(\w+)\}/g, (x, k) => (k in f ? f[k] : x));
}

/** Retourne { objet, corps } pour un hôtel. */
function construireLettre_(h, candidat) {
  const s = lireModele_(LETTRE), f = champsLettre_(h, candidat);
  const seg = h.segment || 'independant', graine = String(h.nom).toLowerCase();
  const paras = [];
  ORDRE_LETTRE.forEach(cle => {
    if (cle === 'segment') cle = 'segment:' + seg;
    if (cle === 'langues' && seg === 'luxe') return;
    const t = choisirVariante_(s[cle], f, graine + cle);
    if (t && cle === 'langues' && paras.length) paras[paras.length - 1] += ' ' + t;
    else if (t) paras.push(t);
  });
  return {
    objet: choisirVariante_(s.objet, f, graine + 'objet'),
    corps: 'Madame, Monsieur,\n\n' + paras.join('\n\n') + '\n\n' + choisirVariante_(s.signature, f, graine),
  };
}

/** "CV Léopold Watchi Hôtel du Parc.pdf" */
function nomFichierCv_(nomHotel, c, ext) {
  const propre = String(nomHotel).replace(/[<>:"/\\|?*\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return 'CV ' + c.prenom + ' ' + c.nom + ' ' + propre + (ext || '.pdf');
}
