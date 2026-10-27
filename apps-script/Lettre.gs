/**
 * La lettre de motivation (corps du mail) : modifiez le texte entre les deux accents graves ` ci-dessous.
 *
 * - Chaque [section] contient une ou plusieurs variantes séparées par une ligne "--".
 *   Une variante est tirée au hasard (mais toujours la même pour un hôtel donné),
 *   pour que les 50 mails du jour ne soient pas mot pour mot identiques.
 * - Si une variante utilise une info inconnue (ex : {chambres} vide), elle est ignorée.
 * - [segment:xxx] : paragraphe choisi selon le type d'hôtel :
 *   independant | intermediaire | groupe | economique | residence | luxe
 * - Les lignes qui commencent par # sont des commentaires (ignorées).
 * - Quand on connaît la marque, le nombre de chambres ou les étoiles, les variantes qui les citent passent en priorité.
 * - [langues] est collé à la fin du parcours (et omis pour les hôtels "luxe", où c'est déjà dit).
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
Depuis février, je suis chargé de l'intégration de nouvelles filiales chez Batisanté, un groupe de services aux bâtiments (propreté, hygiène, sécurité incendie). Je pilote cinq projets en parallèle et je travaille au quotidien avec les équipes terrain pour faire évoluer leur organisation. À Grenoble, par exemple, j'ai revu avec les responsables locaux les tournées d'une équipe de 70 agents de propreté : 31 % de kilomètres en moins, sans que le service rendu aux clients en pâtisse.

Avant cela, j'ai suivi des travaux et des budgets chez Air Liquide, construit des prévisions financières dans la promotion immobilière et participé à des missions d'audit chez Keolis. À chaque poste, j'ai découvert un nouveau métier. J'aime comprendre comment les choses fonctionnent sur le terrain, poser des questions à ceux qui les font, puis trouver avec eux ce qui peut être amélioré.
--
Je travaille aujourd'hui chez Batisanté, un groupe de propreté, d'hygiène et de sécurité des bâtiments, où je pilote l'intégration de nouvelles filiales : planning, coordination entre les équipes et le siège, accompagnement des agents quand les outils et les méthodes changent. Mon dernier chantier a consisté à réorganiser les tournées de 70 agents à Grenoble, avec 31 % de kilomètres en moins et la même qualité de service.

Mon parcours m'a fait passer par des métiers assez différents : la gestion de sites et de travaux chez Air Liquide, la finance dans la promotion immobilière, l'audit interne chez Keolis. J'y ai appris à me mettre vite dans le bain, à écouter ceux qui connaissent le terrain et à tenir des objectifs avec des équipes que je découvrais.

[hotellerie]
L'hôtellerie m'attire parce que le travail d'organisation s'y voit tout de suite : dans l'accueil, dans l'état d'une chambre, dans la façon dont un imprévu est réglé. J'ai envie d'être sur place, au quotidien, aux côtés d'une direction.
--
Ce qui me plaît dans l'hôtellerie, c'est le lien direct entre le travail des équipes et ce que vit le client. Un planning bien construit, une maintenance suivie, un accueil soigné : tout se ressent immédiatement. C'est dans ce type d'environnement que j'ai envie de travailler, en appui d'une direction.

# Petit hôtel indépendant, maison familiale, hôtel de charme
[segment:independant]
Dans un établissement de {chambres} chambres comme le vôtre, je sais qu'un adjoint passe d'un sujet à l'autre dans la même journée : un planning à ajuster, un fournisseur à relancer, un client à recevoir, un budget à suivre. Cette polyvalence est justement ce que je recherche, et je serais heureux de pouvoir soulager la direction sur une partie de ces sujets.
--
Dans un hôtel indépendant, je sais qu'un adjoint passe d'un sujet à l'autre dans la même journée : un planning à ajuster, un fournisseur à relancer, un client à recevoir, un budget à suivre. Cette polyvalence est justement ce que je recherche, et je serais heureux de pouvoir soulager la direction sur une partie de ces sujets.
--
Ce qui m'attire dans un hôtel indépendant, c'est d'être proche de tout : les clients, les équipes, l'entretien de la maison, les comptes. On y aide aussi bien à l'accueil un jour d'affluence qu'au suivi des dépenses ou à la relance d'un artisan. C'est cette variété qui me plaît, et c'est là que je pense être le plus utile.

# Hôtel indépendant de taille moyenne ou 4 étoiles, plusieurs services
[segment:intermediaire]
Avec {chambres} chambres, votre établissement fait travailler ensemble la réception, les étages, la maintenance et souvent la restauration. C'est sur cette coordination que je pense pouvoir vous être utile rapidement : suivre l'activité et les coûts, préparer les points avec la direction, faire le lien entre les services et veiller à ce que les décisions soient bien appliquées.
--
Dans un hôtel comme le vôtre, où la réception, les étages, la maintenance et souvent la restauration doivent avancer ensemble, je pense pouvoir être utile rapidement : suivre l'activité et les coûts, préparer les points avec la direction, faire le lien entre les services et veiller à ce que les décisions soient bien appliquées.

# Hôtel de chaîne milieu / haut de gamme (Mercure, Novotel, Best Western, Hilton...)
[segment:groupe]
Travailler dans un hôtel {marque} m'intéresse pour une raison précise : mon poste actuel consiste à faire le lien entre des établissements et le siège d'un groupe, en veillant à ce que les standards et les outils communs restent applicables sur le terrain. J'aimerais mettre cette expérience au service de votre direction, tout en apprenant les standards de l'enseigne.
--
Votre hôtel faisant partie du réseau {marque}, je pense que mon expérience actuelle peut vous servir : j'accompagne des établissements dans l'application des process et des outils d'un groupe, en tenant compte de leurs contraintes réelles. J'aimerais en faire profiter votre direction, tout en apprenant les standards de l'enseigne.
--
Travailler dans un hôtel de groupe m'intéresse pour une raison précise : mon poste actuel consiste à faire le lien entre des établissements et le siège d'un groupe, en veillant à ce que les standards et les outils communs restent applicables sur le terrain. J'aimerais mettre cette expérience au service de votre direction, tout en apprenant les standards de l'enseigne.

# Hôtel économique (ibis, B&B, Campanile, Première Classe... ou 1-2 étoiles)
[segment:economique]
Je sais que dans un hôtel {marque}, l'organisation doit être très efficace : des équipes resserrées, beaucoup de passage, des coûts suivis de près. C'est un terrain que je connais : chez Batisanté comme chez Air Liquide, mon travail consiste à trouver des marges de manœuvre sans dégrader le service. Je serais heureux d'aider la direction à tenir ce cap au quotidien, sur le planning, les achats ou le suivi de l'activité.
--
Je sais que dans un hôtel économique, l'organisation doit être très efficace : des équipes resserrées, beaucoup de passage, des coûts suivis de près. C'est un terrain que je connais : chez Batisanté comme chez Air Liquide, mon travail consiste à trouver des marges de manœuvre sans dégrader le service. Je serais heureux d'aider la direction à tenir ce cap au quotidien, sur le planning, les achats ou le suivi de l'activité.

# Résidence hôtelière / appart'hôtel (Adagio, Citadines, Appart'City...)
[segment:residence]
Une résidence {marque} demande une organisation un peu particulière : des séjours plus longs, une clientèle souvent en déplacement professionnel, des appartements et des équipements à suivre de près. La gestion de sites et la coordination d'équipes de propreté, qui font partie de mon quotidien, me semblent très proches de ces sujets, et j'aimerais aider la direction à les tenir au jour le jour.
--
Une résidence hôtelière demande une organisation un peu particulière : des séjours plus longs, une clientèle souvent en déplacement professionnel, des appartements et des équipements à suivre de près. La gestion de sites et la coordination d'équipes de propreté, qui font partie de mon quotidien, me semblent très proches de ces sujets, et j'aimerais aider la direction à les tenir au jour le jour.

# 5 étoiles, palace, grandes enseignes de luxe
[segment:luxe]
Je mesure le niveau d'exigence d'un établissement {etoiles} étoiles comme le vôtre, où le client remarque tout. J'ai l'habitude d'aller dans le détail des processus pour repérer ce qui coince et de suivre chaque sujet jusqu'au bout, et je crois que c'est une qualité utile dans un hôtel de ce niveau. J'ai par ailleurs étudié trois ans à Manchester et je parle anglais couramment, ainsi qu'espagnol.
--
Je mesure le niveau d'exigence d'un établissement comme le vôtre, où le client remarque tout. J'ai l'habitude d'aller dans le détail des processus pour repérer ce qui coince et de suivre chaque sujet jusqu'au bout, et je crois que c'est une qualité utile dans un hôtel de ce niveau. J'ai par ailleurs étudié trois ans à Manchester et je parle anglais couramment, ainsi qu'espagnol.

# Phrase ajoutée à la fin du parcours. Pas utilisée pour les hôtels "luxe" (déjà dit dans leur paragraphe).
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

const ORDRE_LETTRE = ['ouverture', 'parcours', 'langues', 'hotellerie', 'segment', 'conclusion', 'politesse'];
const CHAMPS_OPTIONNELS = ['chambres', 'etoiles', 'marque', 'ville'];

function lireModele_(texte) {
  const sections = {};
  let courante = null, tampon = [];
  const vider = () => {
    if (courante === null) return;
    sections[courante] = tampon.join('\n').split(/^--\s*$/m).map(v => v.replace(/^\n+|\n+$/g, '')).filter(v => v.trim());
  };
  texte.split('\n').forEach(l => {
    if (l.charAt(0) === '#') return;
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
  const optionnels = v => (v.match(/\{(\w+)\}/g) || []).map(x => x.slice(1, -1)).filter(k => CHAMPS_OPTIONNELS.indexOf(k) >= 0);
  let ok = (variantes || []).filter(v => optionnels(v).every(k => f[k]));
  if (!ok.length) return null;
  // on préfère les variantes qui citent ce qu'on sait de l'hôtel (marque, nombre de chambres, étoiles)
  const max = Math.max.apply(null, ok.map(v => optionnels(v).length));
  ok = ok.filter(v => optionnels(v).length === max);
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
