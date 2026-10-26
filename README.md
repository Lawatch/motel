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
2. **Le script** : aller sur [script.google.com](https://script.google.com) → *Nouveau projet*,
   le renommer « Candidatures hôtels ». Puis copier-coller les 3 fichiers du dossier `apps-script/` :
   - `Code.gs` : remplacer tout le contenu du fichier `Code.gs` déjà présent ;
   - `Lettre.gs` : bouton **+** → *Script* → nommer `Lettre` → coller ;
   - `Index.html` : bouton **+** → *HTML* → nommer `Index` → coller.

   Enregistrer (Ctrl+S).
3. **Autoriser** : dans la barre du haut, choisir la fonction `installer` → *Exécuter*.
   Google demande l'accès à Gmail, Drive et Sheets. Il affiche « Google n'a pas validé cette application » :
   c'est normal pour un script personnel → *Paramètres avancés* → *Accéder à Candidatures hôtels*.
   Le journal d'exécution doit afficher « CV trouvé » et le lien du Google Sheet de suivi.
4. **Ouvrir l'outil** : *Déployer → Tester les déploiements* → copier l'URL de l'application Web
   (elle finit par `/dev`) et l'ajouter aux favoris. Cette URL n'est accessible qu'à vous
   et utilise toujours la dernière version enregistrée du code.

Au départ, `modeTest: true` : tous les mails partent vers vous-même, avec l'adresse réelle de l'hôtel
dans l'objet, et rien n'est compté comme envoyé. Quand tout est bon : mettre `modeTest: false`
en haut de `Code.gs`, enregistrer, recharger la page.

## Utilisation (≈ 10 minutes pour 50 mails)

1. Taper une ville ou un arrondissement (« Lyon », « Paris 8e Arrondissement », « Annecy ») → **Scanner**.
   Les hôtels viennent d'OpenStreetMap, puis le script visite leur site (accueil, contact, mentions légales,
   recrutement) pour trouver les adresses e-mail, le nombre de chambres et les étoiles.
2. La **sélection auto** coche les hôtels dont la meilleure adresse est assez bonne
   (score ≥ `scoreMinimumAuto`) et jamais contactée.
3. Vérifier d'un coup d'œil : l'adresse (menu avec les autres adresses trouvées, ou « Autre adresse… »),
   le type d'hôtel. **Aperçu** ouvre la lettre ; ← / → pour passer d'un hôtel à l'autre ; on peut la retoucher.
4. **Envoyer la sélection**. Les mails partent un par un, espacés de 6 à 15 s pour ne pas passer en spam :
   **garder l'onglet ouvert** pendant l'envoi (≈ 10 min pour 50). Le bouton *Arrêter* interrompt proprement.

## Choix de l'adresse e-mail

Chaque adresse trouvée reçoit un score (règles en bas de `Code.gs`, à ajuster après les premiers tests) :

| Adresse | Points |
|---|---|
| direction@, directeur@, gm@, gerant@ | +50 |
| rh@, recrutement@, emploi@, jobs@ | +45 |
| prenom.nom@ (souvent le directeur) | +35 |
| contact@, info@, accueil@, reception@ | +20 |
| reservation@, booking@, commercial@, events@, spa@… | −40 |
| même domaine que le site de l'hôtel | +15 |
| trouvée sur la page recrutement / mentions légales | +10 / +5 |
| noreply, webmaster, rgpd, prestataires web, Booking… | exclue |

Hôtels Accor : l'adresse du directeur suit la convention `H1234-GM@accor.com` (code de l'hôtel dans l'URL).
Elle est proposée avec la mention « déduite, non vérifiée ».

## Anti-doublon

Chaque adresse utilisée est inscrite dans l'onglet **Envois** du Google Sheet de suivi. Une adresse déjà utilisée
est refusée, même si elle réapparaît pour un autre hôtel (fréquent pour les chaînes) ou deux fois dans la même
sélection. Limite : `limiteParJour` (60 par défaut ; Gmail autorise 100 destinataires par jour depuis un script).

## La lettre

Le texte est dans `Lettre.gs`, entre les deux accents graves `` ` ``, modifiable directement dans l'éditeur.
Un paragraphe change selon le type d'hôtel, détecté automatiquement et modifiable dans le tableau :

- **Indépendant** (petit hôtel) : polyvalence, aider la direction au quotidien
- **Intermédiaire** (> 45 chambres ou 4★) : coordination des services, suivi de l'activité et des coûts
- **Groupe / chaîne** (ibis, Mercure, Best Western…) : lien entre l'établissement et les standards d'un groupe
- **Luxe** (5★) : exigence, détail, langues

Chaque section a plusieurs variantes : les mails du jour ne sont pas identiques mot pour mot,
mais un hôtel donné reçoit toujours la version affichée dans l'aperçu.

Le CV joint s'appelle `CV Léopold Watchi <Nom de l'hôtel>.pdf`.

## Tests (développement)

`node tests/test.js` : charge les fichiers `.gs` avec de faux services Google et un faux site d'hôtel.
