# Trainings-Tracker

Web-App zum Erfassen von Krafttraining am Handy. Jeder Nutzer speichert seine Daten im **eigenen Google Sheet**; die App ist nur die Oberfläche. Die Auswertung läuft in Excel.

| Ordner | Inhalt |
| --- | --- |
| `app/` | Web-App (Vue 3, TypeScript, Vite), veröffentlicht über GitHub Pages |
| `api/` | Web-API als Google Apps Script, läuft im Sheet jedes Nutzers |
| `template/` | Anleitung zur Einrichtung für neue Nutzer |

## Entwicklung

```bash
cd app
npm install
npm run dev     # lokaler Server
npm test        # Tests der Rechenlogik
npm run build   # Build für GitHub Pages
```

Jeder Push auf `main` baut die App und veröffentlicht sie automatisch (`.github/workflows/deploy.yml`).

## Sicherheit

Dieses Repository ist öffentlich. Es enthält **keine** Schlüssel, Web-API-Adressen, CSV-Links oder persönlichen Daten. Diese stehen nur in den Einstellungen der App auf dem jeweiligen Handy bzw. in den Script-Eigenschaften des eigenen Sheets.
