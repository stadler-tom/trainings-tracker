# Für Tom: Version 1 einspielen und Vorlage erstellen

Drei Teile, alle am PC. Reihenfolge einhalten.

- **A** stellt dein echtes Sheet auf die App um (etwa 15 Minuten).
- **B** erstellt einmalig die Vorlage für deine Freunde (etwa 10 Minuten).
- **C** ersetzt deine Excel-Auswertung (etwa 5 Minuten).

---

## A. Echtes Sheet umstellen

Dabei werden nur Script-Dateien ersetzt und Dinge ergänzt:
- im Blatt Übungen am Ende die zwei Spalten **Gerätenotiz** und **Stangengewicht kg**,
- in jedem Tagesblatt eine ausgeblendete Spalte G mit der ID jeder gewählten Übung.

Log, Körper, Übungen und alle sichtbaren Zellen deiner Tagesblätter bleiben unverändert. Das ist an einer Nachbildung mit deinem alten Script-Stand getestet.

### A1. Sicherung

Im echten Sheet **Datei → Kopie erstellen**, Name „Sicherung vor App 12.11.2026“. Nicht weiter benutzen, nur Reserve.

### A2. Script-Dateien

1. Im echten Sheet **Erweiterungen → Apps Script**.
2. Datei `Save.gs`: Inhalt komplett durch [api/Save.gs](../api/Save.gs) ersetzen (auf GitHub **Copy raw file**, im Editor Strg + A, Strg + V).
3. Datei `Setup.gs`: Inhalt komplett durch [api/Setup.gs](../api/Setup.gs) ersetzen. Damit verschwinden auch die alten Funktionen zum Zurücksetzen (resetToStartData), die im echten Sheet nichts mehr verloren haben.
4. Neue Datei anlegen: links neben **Dateien** auf **+ → Script**, Name `Api`. Inhalt aus [api/Api.gs](../api/Api.gs) einfügen.
5. Strg + S.

Danach stehen genau drei Dateien da: `Save.gs`, `Setup.gs`, `Api.gs`. Steht noch eine Datei aus einem früheren Stand da (z. B. `Speichern.gs` oder `Info.gs`), diese löschen (drei Punkte → Löschen). Ihr Inhalt steckt auch in der Sicherung aus A1.

### A3. Einrichtung

1. Funktion **setupApi** wählen, **Ausführen**, Berechtigungen bestätigen (**Erweitert → Zu … wechseln → Zulassen**).
2. Im Tab mit dem Sheet erscheint „Fertig. Trainingstage: Beine, Push, Pull, Upper.“ Mit **OK** schließen.
3. Kurz prüfen: Deine Tagesblätter sehen aus wie vorher.

### A4. Stangengewichte eintragen

Im Blatt **Übungen** ganz rechts in Spalte **Stangengewicht kg**:

| Übung | Stangengewicht kg |
| --- | --- |
| E01 Kniebeuge (Langhantel) | 20 |
| E02 Rumänisches Kreuzheben (LH) | 20 |
| E06 Schrägbankdrücken Multipresse | 0 |

Alle anderen Zeilen leer lassen.

### A5. Bereitstellen

1. Im Script-Editor **Bereitstellen → Neue Bereitstellung**, Zahnrad → **Web-App**.
2. Ausführen als **Ich**, Zugriff **Jeder**, **Bereitstellen**.
3. Die Web-App-URL (endet auf `/exec`) **kopieren**.

### A6. App umstellen

1. Funktion **showSetupLink** ausführen, im Sheet-Tab die URL aus A5 einfügen, **OK**.
2. Den angezeigten Einrichtungslink kopieren und aufs iPhone schicken (Mail an dich, Notizen).
3. In der App: **Einstellungen → Einrichtungslink** einfügen → **Link übernehmen** → Meldung „Verbunden mit …“ und Web-API 1.2.0 → **Speichern**.

Die App arbeitet jetzt mit deinem echten Sheet. Die Testkopie brauchst du nicht mehr.

Ab jetzt gilt: Tag umbenennen = nur den Reiter umbenennen. Beim nächsten Öffnen der App zieht das Script den Namen im Log nach.

> Ein späteres Script-Update geht nach [UPDATE.md](UPDATE.md): mit „Bereitstellungen verwalten → Bearbeiten → Neue Version“ bleibt die Adresse gleich, in der App ändert sich nichts.

---

## B. Vorlage für Freunde erstellen (einmalig)

Die Vorlage ist ein eigenes, neues Sheet ohne deine Daten.

1. Am PC <https://sheets.new> öffnen. Ein leeres Sheet entsteht.
2. **Erweiterungen → Apps Script**. Die vorhandene Datei `Code.gs` in `Save` umbenennen (drei Punkte neben dem Namen → Umbenennen) und den Inhalt durch [api/Save.gs](../api/Save.gs) ersetzen.
3. Zwei neue Dateien anlegen (**+ → Script**): `Setup` mit [api/Setup.gs](../api/Setup.gs) und `Api` mit [api/Api.gs](../api/Api.gs). Strg + S.
4. Funktion **create** wählen, **Ausführen**, Berechtigungen bestätigen.
5. Das Sheet heißt jetzt „Trainings-Tracker“ und hat die Blätter Hilfe, Training A, Körper, Übungen und Log. Log und Körper sind leer. „Training A“ ist das Beispiel-Tagesblatt, das deine Freunde umbenennen und duplizieren.

**Nicht** setupApi und **nicht** showSetupLink in der Vorlage ausführen. Sonst bekäme jede Kopie denselben Schlüssel.

6. Oben rechts **Freigeben** → unter „Allgemeiner Zugriff“ **Jeder mit dem Link**, Rolle **Betrachter** → **Link kopieren**.
7. Im kopierten Link das Ende ab `/edit` durch `/copy` ersetzen. Aus `https://docs.google.com/spreadsheets/d/ABC…/edit?usp=sharing` wird `https://docs.google.com/spreadsheets/d/ABC…/copy`.
8. Diesen Kopier-Link plus den Link zur [Anleitung](ANLEITUNG.md) an deine Freunde schicken. Mehr brauchen sie nicht.

Freunde sehen über den Link nur die leere Vorlage, nie dein echtes Sheet.

---

## C. Excel-Auswertung ersetzen

1. [Trainings-Auswertung.xlsx](Trainings-Auswertung.xlsx) herunterladen und an den Platz deiner bisherigen Datei legen. Die alte Datei kannst du danach löschen.
2. Öffnen, **Bearbeitung aktivieren** und **Inhalt aktivieren**.
3. Blatt **Einstellungen**: deine drei bisherigen CSV-Links für Log, Übungen und Körper eintragen. Du findest sie in der alten Excel-Datei unter **Daten → Abfragen und Verbindungen** (Abfrage anklicken → Bearbeiten → erster Schritt) oder im Google Sheet unter **Datei → Freigeben → Im Web veröffentlichen**.
4. **Daten → Alle aktualisieren**. Fragt Excel nach dem Zugriff: **Anonym** → **Verbinden**.

Die Übersicht sortiert die Trainingstage jetzt nach Wochentag ihres letzten Trainings (bei dir Beine, Push, Pull, Upper). Damit funktioniert dieselbe Datei auch mit anderen Tagesnamen.
