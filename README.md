# Trainings-Tracker

Mit diesem Tracker erfasse ich mein Krafttraining am Handy. Die Daten liegen in einem ganz normalen Google Sheet, damit ich jederzeit selbst etwas ändern kann. Die App ist nur die Oberfläche dafür. Für die Auswertung am PC gibt es eine eigene Seite.

Ein paar Freunde nutzen den Tracker auch. Jeder hat sein eigenes Sheet, ich sehe von ihren Daten nichts.

**Neu hier?** Dann fang mit der [Einrichtungsanleitung](template/ANLEITUNG.md) an.

| Ordner | Inhalt |
| --- | --- |
| `app/` | Web-App (Vue 3, TypeScript, Vite) inklusive PC-Auswertung, läuft über GitHub Pages |
| `api/` | Script für das Google Sheet: Sheet-Aufbau und Web-API |
| `template/` | Anleitungen und Bilder dazu |

## Aufbau

- **App** (`app/src`): `App.vue` schaltet zwischen Start, Training, Verlauf, Körper und Einstellungen um. Die Rechenlogik (Ziel heute, Rekord, Scheibenrechner, Aufwärmsätze) steckt in `training.ts`, der Deload-Check in `deload.ts`, die Gewichtsauswertung in `body.ts`. Das laufende Training und die Speicherdaten liegen in `draft.ts`, die Aufrufe des Web-API in `api.ts`. Die Tests stehen jeweils daneben (`*.test.ts`).
- **PC-Auswertung** (`app/src/analysis`): eigene Seite unter `/auswertung/`. Sie liest nur und ändert nichts im Sheet.
- **Script** (`api/`): `Save.gs` baut das Sheet zur Laufzeit auf (Tagesblätter mit Wochentagen und Satzzahl, Muskelgruppen, Zugriff aufs Log). `Setup.gs` erzeugt die Vorlage, `Api.gs` ist das Web-API für die App. Die Version steht in `API_VERSION`.
- **Das Log wird nur ergänzt.** Keine Aktion ändert oder löscht ein gespeichertes Training. Korrekturen mache ich von Hand im Sheet.
- Das Blatt **Einstellungen** im Sheet enthält unter anderem das Deload-Intervall, das Gewichtsziel pro Woche und „Gewicht pro Satz“. `setupApi` ergänzt fehlende Zeilen. Seit 1.9.0 lassen sich die Werte auch in der App ändern.
- Die App rechnet, das Web-API liest und schreibt nur.
- Jede Angabe steht an genau einer Stelle. Ein Trainingstag heißt so wie sein Reiter, das Log zieht Umbenennungen nach. Eine Übung heißt so wie im Blatt Übungen, Tagesblätter und Log verweisen über die ID darauf.

## Entwicklung

```bash
cd app
npm install
npm run dev     # lokaler Server
npm test        # Tests der Rechenlogik
npm run build   # Typprüfung und Build
```

Jeder Push auf `main` baut die App und veröffentlicht sie automatisch (`.github/workflows/deploy.yml`).

Getestet wird nie an meinem echten Sheet, nur an einer Kopie oder an der Vorlage.

## Script-Änderungen

1. `API_VERSION` in `api/Api.gs` erhöhen. Braucht die App die neue Version zwingend, auch `MIN_API_VERSION` in `app/src/api.ts` anheben. Die App zeigt dann einen Hinweis mit Link auf [UPDATE.md](template/UPDATE.md).
2. Änderungen möglichst abwärtskompatibel halten, damit nicht jedes App-Update gleich ein Script-Update erzwingt.

## Sicherheit

Das Repository ist öffentlich. Hier stehen deshalb **keine** Schlüssel, Web-API-Adressen, CSV-Links oder persönlichen Daten. Die liegen nur in den Einstellungen der App auf dem jeweiligen Handy und in den Script-Eigenschaften des eigenen Sheets.
