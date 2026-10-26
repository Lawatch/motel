# Motel - candidatures spontanées en hôtellerie

Petit outil local pour envoyer des candidatures spontanées (poste d'adjoint à la direction)
à des hôtels : **scan → choix de l'adresse → lettre adaptée + CV renommé → envoi**, depuis une seule page,
sans jamais écrire deux fois à la même adresse.

## Installation (une fois)

```bash
pip install -r requirements.txt
cp config.example.json config.json
```

1. Mettre le CV dans `data/CV_Leopold_Watchi.docx` (ou un `.pdf`, chemin dans `config.json` → `cv_path`).
   Le `.docx` est converti en PDF automatiquement si LibreOffice est installé, sinon le `.docx` est joint.
2. Créer un **mot de passe d'application Gmail** (compte Google → Sécurité → Validation en deux étapes →
   Mots de passe des applications) et le coller dans `config.json` → `smtp.password`.
3. Laisser `"mode_test": true` pour les premiers essais : tous les mails partent vers `adresse_test`,
   avec l'adresse réelle dans l'objet, et rien n'est marqué comme envoyé.

## Utilisation (≈ 10 minutes pour 50 mails)

```bash
python app.py        # puis ouvrir http://localhost:5050
```

1. Taper une ville ou un arrondissement (« Lyon », « Paris 8e Arrondissement », « Annecy ») → **Scanner**.
   Les hôtels viennent d'OpenStreetMap, puis l'outil visite leur site (accueil, contact, mentions légales,
   recrutement) pour récupérer les adresses e-mail, le nombre de chambres et les étoiles.
2. La **sélection auto** coche les hôtels dont la meilleure adresse est assez bonne
   (score ≥ `score_minimum_auto`) et pas encore contactée.
3. Vérifier d'un coup d'œil : adresse (menu déroulant avec les autres candidates), type d'hôtel.
   **Aperçu** ouvre la lettre ; ← / → pour passer d'un hôtel à l'autre ; on peut la retoucher et enregistrer.
4. **Envoyer la sélection**. Les mails partent en arrière-plan, espacés de 8 à 20 s (réglable)
   pour ne pas être classés en spam. Ils apparaissent dans « Envoyés » de Gmail.

Pas assez d'hôtels sur OpenStreetMap ? Importer un CSV (`nom;site;ville` + colonnes facultatives
`email;etoiles;chambres;marque`) : les sites sont analysés de la même façon.

## Choix de l'adresse e-mail

Chaque adresse trouvée reçoit un score (`motel/emails.py`, règles à ajuster après les premiers tests) :

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

Toutes les adresses utilisées sont gardées dans `data/motel.db` (table `envois`).
Une adresse déjà utilisée est refusée, même si elle réapparaît pour un autre hôtel (fréquent pour les chaînes),
et même au sein d'une même sélection. Limite quotidienne : `limite_par_jour`.

## La lettre

Le texte est dans `templates/lettre.txt`, à modifier librement (sans toucher au code).
Un paragraphe change selon le type d'hôtel, détecté automatiquement et modifiable dans le tableau :

- **Indépendant** (petit hôtel) : polyvalence, aider la direction au quotidien
- **Intermédiaire** (> 45 chambres ou 4★) : coordination des services, suivi de l'activité et des coûts
- **Groupe / chaîne** (ibis, Mercure, Best Western…) : lien entre l'établissement et les standards d'un groupe
- **Luxe** (5★) : exigence, détail, langues

Chaque section a plusieurs variantes : les mails du jour ne sont pas identiques mot pour mot,
mais un hôtel donné reçoit toujours la même version (celle de l'aperçu).

Le CV joint est nommé `CV Léopold Watchi <Nom de l'hôtel>.pdf` ; une copie est gardée dans `sortie/CV/`.

## Tests

```bash
python -m unittest discover -s tests -t .
```
