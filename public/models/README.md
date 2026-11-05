# Modèles MediaPipe (suivi du visage et du corps)

Les effets « Visage & corps » (déformations, vieillir / rajeunir) ont besoin de deux
fichiers modèles, servis depuis ce dossier (la CSP interdit les CDN externes) :

| Fichier | Sert à | Téléchargement |
| --- | --- | --- |
| `face_landmarker.task` | visage (obligatoire) | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task |
| `pose_landmarker_lite.task` | corps (effets « Corps ») | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task |

```bash
cd public/models
curl -LO https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
curl -LO https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
```

Les fichiers WebAssembly (`public/mediapipe/wasm/`) sont copiés automatiquement par
`npm run dev` / `npm run build`. Sans ces modèles, les filtres d'ambiance marchent
normalement ; seul l'onglet « Visage & corps » affiche « Suivi indisponible ».
