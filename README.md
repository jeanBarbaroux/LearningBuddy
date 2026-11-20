# LearningBuddy

Assistant de révision par répétition espacée pour Windows : un compagnon 3D reste sur le bureau et
propose régulièrement des questions issues de vos paquets de cartes.

| Dossier | Contenu |
| --- | --- |
| [`LearningBuddy.Electron/`](LearningBuddy.Electron/README.md) | Application Electron + React (démarrage, tests, installateur, format des paquets) |
| `assets/` | Icône, polices et paquets fournis dans la bibliothèque (`default-packages/`) |
| `.github/workflows/` | Intégration continue (`ci.yml`) et publication des versions (`release.yml`) |

```powershell
cd LearningBuddy.Electron
npm install
npm start
```

Voir [ARCHITECTURE.md](LearningBuddy.Electron/ARCHITECTURE.md) pour l’organisation du code.
