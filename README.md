# Motel - candidatures spontanées en hôtellerie

Outil pour envoyer des candidatures spontanées (poste d'adjoint à la direction) à des hôtels :
**scan → choix de l'adresse → lettre adaptée + CV renommé → envoi depuis leo.watchi@gmail.com**,
sur une seule page, sans jamais écrire deux fois à la même adresse.

**Rien à installer** : c'est un Google Apps Script. Le code tourne chez Google, sur le compte Gmail,
et s'utilise depuis un simple navigateur (y compris sur un ordinateur pro verrouillé).
Les mails partent du Gmail de leo.watchi@gmail.com et apparaissent dans « Messages envoyés ».
Le suivi (hôtels trouvés, adresses déjà contactées) est tenu dans un Google Sheet créé automatiquement.

## Mise en place (10 minutes, une seule fois)

Tout se fait connecté au compte **leo.watchi@gmail.com** (si le navigateur est connecté à un compte pro,
utiliser une fenêtre de navigation privée). Le script vérifie le compte et refuse d'envoyer depuis un autre.

1. **Le CV** : dans Word, *Fichier → Enregistrer sous → PDF*, nommé `CV_Leopold_Watchi.pdf`,
   puis le déposer dans [Google Drive](https://drive.google.com) (glisser-déposer).
   S'il y a plusieurs `CV_Leopold_Watchi.pdf` dans le Drive, c'est **le plus récent** qui est joint :
   pour mettre le CV à jour, il suffit d'en déposer un nouveau. La date du CV utilisé est affichée en haut de la page.
2. **Le script** : aller sur [script.google.com](https://script.google.com) → *Nouveau projet*,
   le renommer « Candidatures hôtels ». Puis copier-coller les 3 fichiers du dossier `apps-script/` :
   - `Code.gs` : remplacer tout le contenu du fichier `Code.gs` déjà présent ;
   - `Lettre.gs` : bouton **+** → *Script* → nommer `Lettre` → coller ;
   - `Index.html` : bouton **+** → *HTML* → nommer `Index` → coller.

   Enregistrer (Ctrl+S).
3. **Autoriser et vérifier** : dans la barre du haut, choisir la fonction `installer` → *Exécuter*.
   Google demande l'accès à Gmail, Drive, Sheets et aux déclencheurs. Il affiche « Google n'a pas validé
   cette application » : c'est normal pour un script personnel → *Paramètres avancés* → *Accéder à Candidatures hôtels*.
   Le script s'envoie alors un **mail de contrôle** (lettre + CV joint) : s'il arrive, l'envoi fonctionne.
   À refaire après chaque mise à jour du code.
4. **Ouvrir l'outil** : *Déployer → Tester les déploiements* → copier l'URL de l'application Web
   (elle finit par `/dev`) et l'ajouter aux favoris. Cette URL n'est accessible qu'à vous
   et utilise toujours la dernière version enregistrée du code.

Les candidatures partent **directement à l'adresse de chaque hôtel** (il n'y a plus de mode test).
Seul `installer` s'envoie un mail de contrôle à vous-même.

**Mise à jour du code** : recoller les fichiers, enregistrer, relancer `installer`, puis si vous utilisez l'URL
`/exec` : *Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer*.
Le numéro de version est affiché en haut de la page (`v5 - lettre ciblée, anti-doublon Gmail`) : s'il ne correspond pas,
la page tourne encore sur l'ancien code.

## Utilisation (≈ 10 minutes pour 50 mails)

1. Taper une ou plusieurs villes (« Lyon, Annecy, Paris 8e Arrondissement ») → **Scanner**.
   Les hôtels viennent d'OpenStreetMap, puis le script visite leur site (accueil + 3 pages au plus :
   recrutement en priorité, puis mentions légales, puis contact). 6 analyses tournent en parallèle et les hôtels
   apparaissent au fur et à mesure : **on peut commencer à envoyer sans attendre la fin**.
   Si la page est fermée, l'analyse continue en arrière-plan ; le plus efficace est de scanner quelques villes
   à l'avance pour avoir une réserve d'hôtels prête.
2. La **sélection auto** coche les hôtels dont la meilleure adresse est assez bonne
   (score ≥ `scoreMinimumAuto`) et jamais contactée.
3. Vérifier d'un coup d'œil : l'adresse (menu avec les autres adresses trouvées, ou « Autre adresse… »),
   le type d'hôtel. **Aperçu** ouvre la lettre ; ← / → pour passer d'un hôtel à l'autre ; on peut la retoucher.
4. **Envoyer la sélection**. Les mails partent un par un, espacés de 3 à 6 s :
   **garder l'onglet ouvert** pendant l'envoi (≈ 10 min pour 100). Le bouton *Arrêter* interrompt proprement.

## Choix de l'adresse e-mail

Chaque adresse trouvée reçoit un score (règles en bas de `Code.gs`, à ajuster après les premiers tests) :

L'adresse « contact » ou « réservation » est lue par la réception, qui traite des demandes clients :
une candidature y est souvent oubliée ou transmise tard. L'outil cherche donc d'abord l'adresse prévue pour le
recrutement, puis celle de la direction.

| Adresse | Points |
|---|---|
| présentée pour le recrutement sur le site (« Envoyez votre CV à… », « Recrutement : … ») | +45 |
| rh@, recrutement@, emploi@, jobs@ | +55 |
| direction@, directeur@, gm@, gerant@ | +50 |
| présentée comme celle de la direction (« Directeur : … ») | +15 |
| prenom.nom@ (souvent le directeur) | +35 |
| contact@, info@, accueil@, reception@ | +20 |
| reservation@, booking@, commercial@, events@, spa@… | −40 |
| présentée pour les réservations | −15 |
| même domaine que le site de l'hôtel | +15 |
| trouvée sur la page recrutement / mentions légales | +10 / +5 |
| noreply, webmaster, rgpd, prestataires web, Booking… | exclue |

Hôtels Accor : l'adresse du directeur suit la convention `H1234-GM@accor.com` (code de l'hôtel dans l'URL).
Elle est proposée avec la mention « déduite, non vérifiée ».

## Anti-doublon et suivi des envois

- Chaque candidature envoyée est inscrite dans l'onglet **Envois** du Google Sheet de suivi
  (adresse, hôtel, objet, date et heure). Le bouton **Historique** de la page affiche la même liste.
- **Envoi bloqué** si l'adresse est déjà dans l'onglet Envois, ou si Gmail contient déjà un message envoyé
  à cette adresse (par exemple envoyé à la main) : l'adresse est alors ajoutée au suivi.
- **Le scan ne propose que des contacts nouveaux** : un hôtel déjà dans le suivi n'est jamais reproposé,
  et pour chaque hôtel l'outil choisit la meilleure adresse **jamais contactée**. Si toutes ses adresses ont déjà
  reçu une candidature (fréquent pour les chaînes qui partagent une adresse), l'hôtel passe en « Déjà contacté »
  et disparaît de la liste.
- `installer` et le bouton *Récupérer depuis Gmail* (dans Historique) ajoutent au suivi les mails
  « Candidature spontanée » trouvés dans « Messages envoyés ».
- Limite : `limiteParJour` = 100, le maximum autorisé par Gmail depuis un script.

## La lettre

Le texte est dans `Lettre.gs`, entre les deux accents graves `` ` ``, modifiable directement dans l'éditeur.
Elle met en avant la polyvalence, la curiosité, le pilotage de projets et le travail avec les équipes terrain,
sans parler d'expérience en hôtellerie. Un paragraphe change selon le **type d'hôtel**, détecté automatiquement
(enseigne, étoiles, nombre de chambres) et modifiable dans le tableau. À vérifier d'un coup d'œil avant d'envoyer :

| Type | Exemples | Ce que dit la lettre |
|---|---|---|
| Indépendant | petit hôtel, hôtel de charme | polyvalence, soulager la direction au quotidien |
| Indépendant moyen / 4★ | > 45 chambres ou 4★ sans enseigne | coordination réception / étages / maintenance, suivi de l'activité |
| Chaîne | Mercure, Novotel, Best Western, Hilton… | lien entre l'établissement et les standards du groupe |
| Économique | ibis, B&B, Campanile, Première Classe… | équipes resserrées, coûts, efficacité |
| Résidence / appart'hôtel | Adagio, Citadines, Appart'City… | séjours longs, gestion des appartements et des équipements |
| Luxe 5★ | 5 étoiles, Sofitel, Barrière… | exigence, détail, langues |

Quand la marque, le nombre de chambres ou les étoiles sont connus, la lettre les cite (« un hôtel Mercure »,
« avec 64 chambres »). Chaque section a plusieurs variantes : les mails du jour ne sont pas identiques mot pour mot,
mais un hôtel donné reçoit toujours la version affichée dans l'aperçu.

Le CV joint s'appelle `CV Léopold Watchi <Nom de l'hôtel>.pdf`.

## Tests (développement)

`node tests/test.js` : charge les fichiers `.gs` avec de faux services Google et un faux site d'hôtel.
