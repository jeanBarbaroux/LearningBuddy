# Architecture de LearningBuddy.Electron

## Les cinq zones

`core/` et `shared/` sont des couches de code; `main/`, `preload/` et `renderer/` correspondent aux
différents côtés de l’application Electron.

| Dossier | Responsabilité | Exemples |
| --- | --- | --- |
| `src/core/` | Règles métier et modèles indépendants de l’interface: cartes, révisions, statistiques, réglages et compagnon. | `review/reviewScheduler.ts`, `cards/cardContent.ts` |
| `src/main/` | Processus privilégié Electron: état de référence, orchestration, stockage, fichiers, fenêtres et intégrations Windows. | `application.ts`, `services/`, `data/`, `windows/` |
| `src/preload/` | Petit pont sécurisé entre une page et Electron. Il expose seulement `window.learningBuddy`, jamais `ipcRenderer` directement. | `preload.ts` |
| `src/renderer/` | Interfaces React dans le navigateur, une entrée par fenêtre. Aucun accès direct au système de fichiers ni à l’API Electron. | `main/pages/`, `bubble/`, `companion/`, `invitation/`, `image/` |
| `src/shared/` | Contrats et utilitaires sans accès à Electron, utilisés de part et d’autre de l’IPC. | `ipc.ts`, `i18n/`, `assistantStatus.ts` |

Quelques repères complémentaires:

- `main/main.ts` démarre l’application; `main/application.ts` assemble les services et orchestre les
  commandes reçues, les fenêtres et les événements système.
- `main/ipc/` valide les données entrantes et les transmet à l’application; `main/services/` traite les
  opérations métier applicatives, et `main/data/` persiste les documents JSON.
- `renderer/lib/api.ts` transforme le pont exposé par le preload en fonctions typées utilisables par React.
  Les composants communs sont dans `renderer/react/`; l’état et les pages de la fenêtre principale sont
  dans `renderer/main/`.
- `shared/ipc.ts` définit les canaux et les types échangés. Il importe certains types de `core/`; les
  deux imports de `shared/i18n/texts.ts` depuis `core/` sont uniquement des imports de type, effacés à la
  compilation.

## Trajet d’une commande

```text
Vue React
  → renderer/lib/api.ts
  → window.learningBuddy (pont du preload)
  → src/main/ipc/ipcRouter.ts (origine et arguments validés)
  → src/main/application.ts
  → services / règles de src/core/ / stockage de src/main/data/
```

Pour une réponse, le processus principal renvoie le résultat de l’invocation ou envoie un événement
`Push`; `renderer/lib/api.ts` le remet à la vue. Les noms des canaux et la forme des messages sont définis
dans `shared/ipc.ts`. Le processus principal reste l’unique source de vérité: les renderers affichent des
états et envoient des commandes, mais ne modifient pas les données directement.

## Règles de dépendance

- `core/` ne dépend ni d’Electron, ni de Node.js, ni du DOM, ni des dossiers `main/`, `preload/` ou
  `renderer/`. Il peut utiliser le type de clé de traduction de `shared/`, sans importer son code à
  l’exécution.
- `main/` peut utiliser Electron, Node.js, `core/` et `shared/`, mais pas le code des renderers ni le
  preload.
- `preload/` reste limité à Electron et au contrat `shared/ipc.ts`; pas de logique métier ou d’interface.
- `renderer/` utilise React, les API navigateur, `core/`, `shared/` et son propre adaptateur `lib/api.ts`;
  il n’importe ni Electron ni le processus principal.
- `shared/` ne dépend d’aucun processus Electron et n’accède ni au DOM ni au système de fichiers.

Un changement suit donc le chemin correspondant à sa responsabilité: règle métier dans `core/`, accès
aux fichiers ou au système dans `main/`, commande IPC dans `shared/ipc.ts` et `main/ipc/`, puis affichage
dans la fenêtre concernée sous `renderer/`. Les données reçues par IPC doivent toujours être validées dans
le processus principal, même si leurs types sont déclarés dans `shared/ipc.ts`.

## Compilation et tests

`build.mjs` produit un bundle du processus principal, un du preload et un bundle navigateur pour chacune
des cinq fenêtres (`main`, `companion`, `bubble`, `invitation`, `image`). `npm run typecheck`, `npm test`
et `npm run test:e2e` vérifient respectivement les types, les règles/services et les parcours réels dans
Electron; un test d’architecture vérifie également les frontières d’import entre les dossiers.