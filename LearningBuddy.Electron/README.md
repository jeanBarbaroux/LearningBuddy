# LearningBuddy v2 — prototype Electron

Base minimale d’une version Electron de LearningBuddy, avec un compagnon 3D rendu par
[three.js](https://threejs.org/) (`WebGPURenderer`, repli automatique sur WebGL2) et des matériaux écrits en
TSL (Three Shading Language).

Le prototype est autonome (100 % TypeScript) et n’utilise pas les projets .NET. Les règles métier essentielles
de `LearningBuddy.Core` ont été portées pour conserver les mêmes comportements.

## Démarrage

Prérequis : Node.js 22 ou plus récent.

```powershell
cd LearningBuddy.Electron
npm install
npm start          # compile puis lance l’application
npm run dev        # compile, lance et relance Electron après chaque modification
```

| Commande | Rôle |
| --- | --- |
| `npm start` | Compile (`dist/`) et lance Electron |
| `npm run dev` | Compile, lance Electron et redémarre automatiquement après une modification de `src/` ou des paquets par défaut |
| `npm run typecheck` | Vérification TypeScript stricte |
| `npm test` | Tests unitaires (Vitest) du cœur, du stockage et du contrôleur de révision |
| `npm run test:e2e` | Tests de bout en bout de l’application réelle (Playwright + Electron) |

Lancement en arrière-plan (zone de notification uniquement) : `npx electron . --background`.
La variable `LEARNING_BUDDY_USER_DATA` permet d’utiliser un profil isolé (utilisée par les tests).

## Fonctionnalités

- **Fenêtre principale** : accueil (état de l’assistant, statistiques), bibliothèque des paquets fournis dans
  `../assets/default-packages`, gestion des paquets (import d’un fichier JSON `learning-buddy`, sélection pour la
  révision, suppression), options (pause entre séries, questions par série, promenade).
- **Compagnon** : fenêtre transparente toujours au premier plan ; clic = réviser maintenant, glisser = déplacer
  (position mémorisée), clic droit = menu ; les zones transparentes laissent passer les clics vers le bureau.
- **Bulle de révision** placée à côté du compagnon : carte classique ou QCM, puis évaluation
  À revoir / Difficile / Correct / Facile (raccourcis 1 à 4), « Passer », ou fermeture sans résultat (Échap).
- **Zone de notification**, **instance unique**, fermeture de la fenêtre principale = masquage.
- **Persistance locale** : un document JSON écrit de façon atomique dans le dossier `userData` d’Electron.

## Comportements conservés

| Comportement | Source .NET | Portage |
| --- | --- | --- |
| Niveaux et délais de révision, choix de la carte suivante (niveau le plus bas, rotation des paquets) | `ReviewScheduler` | `src/core/reviewScheduler.ts` |
| Format d’import `learning-buddy` v1 et ses validations principales | `PackageImportParser` | `src/core/packageParser.ts` |
| Priorités d’animation : disparition > apparition > sommeil > réaction > demande > déplacement > repos | `CompanionAnimationStateMachine` | `src/core/companionAnimationStateMachine.ts` |
| Réactions : À revoir / Difficile → réfléchir ; Correct / Facile → célébrer | `CompanionCharacterStateMachine` | `src/core/avatarStoryboard.ts` |
| Identifiants et durées des 8 animations du storyboard | `AvatarStoryboard` | `src/core/avatarStoryboard.ts` |
| Promenade autonome, repos aléatoires, placement de la bulle | `CompanionWanderer`, `CompanionLayout` | `src/core/companionLayout.ts` |
| Séries de questions et pause entre séries | `AssistantSession` | `src/core/assistantSession.ts` (simplifié) |

Comme dans la version WPF, le compagnon dort tant que l’assistant est en pause, y compris pendant une révision
manuelle.

## Compagnon 3D

`src/renderer/companion/avatar.ts` construit un hibou procédural (aucun fichier de modèle). Les matériaux TSL
combinent un dégradé de plumes bruité (`mx_noise_float`), une teinte d’humeur et un liseré de Fresnel dont
l’intensité suit l’émotion. Chaque animation du storyboard (`idle`, `move`, `appear`, `disappear`, `request`,
`think`, `celebrate`, `sleep`) est une pose procédurale ; les fins d’animations ponctuelles sont minutées à partir
des durées du storyboard, indépendamment de la fréquence d’affichage.

Pour passer à un modèle glTF animé, il suffit de remplacer `CompanionAvatar` en conservant ses méthodes `play`,
`setQuestionDisplayed` et `hitTest` : la machine à états et le processus principal restent inchangés.

## Architecture

```text
src/
  core/       logique métier pure, testée (aucune dépendance Electron)
  main/       processus principal, organisé par responsabilité
    main.ts              amorçage Electron et instance unique
    application.ts       composition des services et orchestration applicative
    windows/             création, placement et interactions des fenêtres
    ipcController.ts     validation et routage des messages IPC
    tray.ts              zone de notification et menus contextuels
    config.ts            constantes et chemins de ressources
    validation.ts        validation des arguments entrants
    library.ts, store.ts stockage local et bibliothèque
    reviewController.ts  orchestration des révisions
  preload/    pont sécurisé (contextIsolation + sandbox) exposant window.learningBuddy
  shared/     contrat IPC typé
  renderer/   fenêtres main, companion (three.js/TSL) et bubble
e2e/          scénarios Playwright sur l’application réelle
```

Les fenêtres utilisent `contextIsolation`, `sandbox`, une politique CSP stricte, et le processus principal valide
l’origine et les arguments de chaque appel IPC.

## Non repris dans ce prototype

Planification à heures fixes, pause pendant les réunions Teams, invitation quand le compagnon est masqué,
masquage automatique après une série, lancement au démarrage de Windows, éditeur de cartes, export, statistiques
détaillées et chronologie, fréquences par paquet, choix et taille de l’avatar, interface anglaise, thèmes Magellan,
migration des données SQLite de la v1 et empaquetage de l’installateur.
