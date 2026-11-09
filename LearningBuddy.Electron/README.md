# LearningBuddy v2 — application Electron + React

LearningBuddy est un assistant de révision par répétition espacée, avec des interfaces renderer réalisées
en React. Un compagnon (un hibou 3D rendu avec
[three.js](https://threejs.org/), `WebGPURenderer` avec repli WebGL2) reste sur le bureau et propose
régulièrement des questions dans une bulle..

## Démarrage

Prérequis : Node.js 22 ou plus récent, Windows (zone de notification, détection Teams).

```powershell
cd LearningBuddy.Electron
npm install
npm start          # compile puis lance l’application
npm run dev        # compile, lance et relance Electron après chaque modification
```

## Créer l’installateur Windows

Après l’installation des dépendances, générez l’installateur NSIS avec :

```powershell
npm run dist:win
```

La commande compile l’application puis place l’installateur `.exe` dans `release/`. L’assistant
d’installation permet de choisir le dossier et crée des raccourcis Bureau et menu Démarrer. Les données
de l’utilisateur restent dans `%APPDATA%\LearningBuddy\data`, même après la désinstallation.

| Commande | Rôle |
| --- | --- |
| `npm start` | Compile (`dist/`) et lance Electron |
| `npm run dev` | Relance automatiquement après une modification de `src/` ou de `../assets` |
| `npm run typecheck` | Vérification TypeScript stricte |
| `npm test` | Tests unitaires (Vitest) : règles métier, stockage, services et contrôleur de révision |
| `npm run test:e2e` | Scénarios de bout en bout sur l’application réelle (Playwright + Electron) |
| `npm run dist:win` | Compile l’application et génère l’installateur NSIS dans `release/` |

- `npx electron . --startup` démarre en arrière-plan (compagnon et icône de notification seulement), comme
  au lancement de session Windows.
- `LEARNING_BUDDY_USER_DATA` utilise un profil isolé ; `LEARNING_BUDDY_TEAMS_DETECTION=off` désactive la
  détection Teams (utilisés par les tests).

## Publier une version sur GitHub

La pipeline crée une GitHub Release et y dépose l’installateur Windows lorsqu’un tag commençant par `v`
est poussé. Le numéro du tag devient la version de l’application empaquetée ; les tags contenant un tiret,
comme `v2.0.0-alpha.2`, sont publiés comme préversions.

```powershell
git tag v2.0.0-alpha.2
git push origin v2.0.0-alpha.2
```

## Fonctionnalités

| Espace | Contenu |
| --- | --- |
| **Accueil** | État de la session, démarrage/pause de l’assistant, question manuelle, réglages « Votre rythme » (par intervalle ou horaires fixes, délai de rappel), affichage et marche du compagnon |
| **Bibliothèque** | Paquets fournis dans `../assets/default-packages` : recherche, aperçu des cartes, téléchargement |
| **Paquets & questions** | Import JSON avec aperçu (correction ou exclusion de chaque carte), modèle JSON, sélection des paquets révisés, fréquences par paquet, export, renommage, suppression, gestion des cartes (recherche, filtre par niveau, éditeur avec QCM, images, langue, tags, niveau) |
| **Statistiques** | Activité sur 52 semaines, indicateurs, état des cartes, autoévaluations, questions présentées et évolution des niveaux sur une période, pour tous les paquets ou un seul |
| **Avatar** | Taille du compagnon et de la bulle (50–200 %), aperçu de la bulle |
| **Options** | Langue (français, anglais), thème (système, clair, sombre), lancement au démarrage de Windows, masquage automatique après une série, pause pendant les réunions Teams |

Hors de la fenêtre principale :

- **Compagnon** : clic = question, glisser = déplacer (position mémorisée par écran), clic droit = menu,
  promenade facultative, animations (apparition, sommeil quand l’assistant est arrêté, demande, réflexion
  après « À revoir »/« Difficile », célébration après « Correct »/« Facile »).
- **Bulle de révision** : question, image agrandissable, QCM à une ou plusieurs réponses, réponse,
  explication avec liens, autoévaluation (raccourcis 1 à 4) avec changement de niveau, « Passer »,
  « Mettre en pause », « Modifier la carte » ; la fermer (✕ ou Échap) termine sans résultat.
- **Invitation** quand le compagnon est masqué : « Afficher », « Reporter N min », « Mettre en pause ».
- **Zone de notification**, **instance unique**, fermeture de la fenêtre = masquage, veille et verrouillage
  de session pris en compte, pause automatique pendant une réunion Teams.

Le format d’import est `learning-buddy` v1 ;

## Architecture

Le code est réparti entre les processus Electron et les règles métier. `core/` contient les règles sans
accès à Electron; `shared/` contient des contrats et utilitaires partagés, ce n’est pas un processus.
Le guide [ARCHITECTURE.md](ARCHITECTURE.md) explique le rôle de chaque dossier, le trajet d’une commande
entre React et le processus principal, et les règles de dépendance à respecter.

## Données locales

Les données sont dans `%APPDATA%\LearningBuddy\data` (ou le profil de `LEARNING_BUDDY_USER_DATA`) :

| Fichier | Contenu |
| --- | --- |
| `settings.json` | Préférences |
| `catalog.json` | Paquets et cartes (images en base64) |
| `reviews.json` | État de révision de chaque carte et historique des présentations |

Chaque fichier est écrit dans un fichier temporaire puis renommé ; une modification qui échoue est annulée
en mémoire. Répondre à une question ne réécrit que `reviews.json`.

## Différences avec la v1

- Un seul avatar (le hibou 3D) : pas de choix d’apparence.
- Les données SQLite de la v1 ne sont pas migrées : exportez vos paquets depuis la v1 puis importez-les.
- Le lancement au démarrage de Windows n’est inscrit que pour l’application empaquetée.
