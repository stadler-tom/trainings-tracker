# Trainings-Tracker

Web-App zum Erfassen von Krafttraining am Handy. Jeder Nutzer speichert seine Daten im **eigenen Google Sheet**; die App ist nur die Oberfläche. Die Auswertung läuft in Excel.

**Neu hier?** → [Einrichtungsanleitung](template/ANLEITUNG.md)

| Ordner | Inhalt |
| --- | --- |
| `app/` | Web-App (Vue 3, TypeScript, Vite), veröffentlicht über GitHub Pages |
| `api/` | Script für das Google Sheet: Sheet-Aufbau und Web-API |
| `template/` | Anleitungen und Excel-Auswertung |

## Aufbau

- **App** (`app/src`): `App.vue` schaltet zwischen Start, Training und Einstellungen. Die Rechenlogik (Ziel heute, Rekord, Scheibenrechner, Aufwärmsätze) steht in `training.ts`, das laufende Training und die Speicherdaten in `draft.ts`, die Aufrufe des Web-API in `api.ts`. Tests liegen jeweils daneben (`*.test.ts`).
- **Script** (`api/`): `Save.gs` ist der Sheet-Aufbau zur Laufzeit (Tagesblätter, Info-Zeilen, Speichern im Sheet), `Setup.gs` baut die Vorlage und legt Tagesblätter an, `Api.gs` ist das Web-API für die App (Version in `API_VERSION`).
- Die App rechnet, das Web-API liest und schreibt nur.

## Entwicklung

```bash
cd app
npm install
npm run dev     # lokaler Server
npm test        # Tests der Rechenlogik
npm run build   # Typprüfung und Build
```

Jeder Push auf `main` baut die App und veröffentlicht sie automatisch (`.github/workflows/deploy.yml`).

Getestet wird nie am echten Sheet, nur an einer Kopie oder an der Vorlage.

## Script-Änderungen

1. `API_VERSION` in `api/Api.gs` erhöhen. Braucht die App die neue Version, `MIN_API_VERSION` in `app/src/api.ts` anheben; die App zeigt dann den Hinweis mit der Anleitung [UPDATE.md](template/UPDATE.md).
2. Änderungen möglichst abwärtskompatibel halten, damit nicht jedes App-Update ein Script-Update erzwingt.

## Sicherheit

Dieses Repository ist öffentlich. Es enthält **keine** Schlüssel, Web-API-Adressen, CSV-Links oder persönlichen Daten. Diese stehen nur in den Einstellungen der App auf dem jeweiligen Handy, in den Script-Eigenschaften des eigenen Sheets bzw. im Blatt Einstellungen der eigenen Excel-Datei.
