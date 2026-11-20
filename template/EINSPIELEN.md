# Meine Checkliste: Version 1 einspielen und Vorlage erstellen

Meine eigene Checkliste für die Umstellung auf die App. Zwei Teile, beide am PC, in dieser Reihenfolge:

- **A** stellt mein echtes Sheet auf die App um (etwa 15 Minuten).
- **B** erstellt einmalig die Vorlage für meine Freunde (etwa 10 Minuten).

---

## A. Echtes Sheet umstellen

Dabei werden nur die Script-Dateien ersetzt und ein paar Dinge ergänzt:
- im Blatt Übungen am Ende die zwei Spalten **Gerätenotiz** und **Stangengewicht kg**,
- in jedem Tagesblatt eine ausgeblendete Spalte G mit der ID jeder gewählten Übung.

Log, Körper, Übungen und alle sichtbaren Zellen der Tagesblätter bleiben unverändert. Getestet ist das an einer Nachbildung mit meinem alten Script-Stand.

### A1. Sicherung

Im echten Sheet **Datei → Kopie erstellen**, Name „Sicherung vor App 12.11.2026“. Die Kopie nicht weiter benutzen, sie ist nur Reserve.

### A2. Script-Dateien

1. Im echten Sheet **Erweiterungen → Apps Script**.
2. Datei `Save.gs`: Inhalt komplett durch [api/Save.gs](../api/Save.gs) ersetzen (auf GitHub **Copy raw file**, im Editor Strg + A, Strg + V).
3. Datei `Setup.gs`: Inhalt komplett durch [api/Setup.gs](../api/Setup.gs) ersetzen. Damit fliegen auch die alten Funktionen zum Zurücksetzen (resetToStartData) raus, die im echten Sheet nichts mehr verloren haben.
4. Neue Datei anlegen: links neben **Dateien** auf **+ → Script**, Name `Api`. Den Inhalt aus [api/Api.gs](../api/Api.gs) einfügen.
5. Strg + S.

Danach stehen genau drei Dateien da: `Save.gs`, `Setup.gs`, `Api.gs`. Ist noch eine Datei aus einem früheren Stand übrig (z. B. `Speichern.gs` oder `Info.gs`), lösche ich sie (drei Punkte → Löschen). Ihr Inhalt steckt ja auch in der Sicherung aus A1.

### A3. Einrichtung

1. Funktion **setupApi** wählen, **Ausführen**, Berechtigungen bestätigen (**Erweitert → Zu … wechseln → Zulassen**).
2. Im Tab mit dem Sheet erscheint „Fertig. Trainingstage: Beine, Push, Pull, Upper.“ Mit **OK** schließen.
3. Kurz prüfen, ob die Tagesblätter noch so aussehen wie vorher.

### A4. Stangengewichte eintragen

Im Blatt **Übungen** ganz rechts in der Spalte **Stangengewicht kg**:

| Übung | Stangengewicht kg |
| --- | --- |
| E01 Kniebeuge (Langhantel) | 20 |
| E02 Rumänisches Kreuzheben (LH) | 20 |
| E06 Schrägbankdrücken Multipresse | 0 |

Alle anderen Zeilen bleiben leer.

### A5. Bereitstellen

1. Im Script-Editor **Bereitstellen → Neue Bereitstellung**, Zahnrad → **Web-App**.
2. Ausführen als **Ich**, Zugriff **Jeder**, **Bereitstellen**.
3. Die Web-App-URL (endet auf `/exec`) **kopieren**.

### A6. App umstellen

1. Funktion **showSetupLink** ausführen, im Sheet-Tab die URL aus A5 einfügen, **OK**.
2. Den angezeigten Einrichtungslink kopieren und aufs iPhone schicken (Mail an mich, Notizen).
3. In der App: **Einstellungen → Einrichtungslink** einfügen → **Link übernehmen** → Meldung „Verbunden mit …“ und Web-API 1.4.0 → **Speichern**.

Ab hier arbeitet die App mit meinem echten Sheet. Die Testkopie brauche ich nicht mehr.

Ab jetzt gilt: Tag umbenennen heißt nur den Reiter umbenennen. Beim nächsten Öffnen der App zieht das Script den Namen im Log nach.

> Spätere Script-Updates laufen nach [UPDATE.md](UPDATE.md): Mit „Bereitstellungen verwalten → Bearbeiten → Neue Version“ bleibt die Adresse gleich, in der App ändert sich nichts.

---

## B. Vorlage für Freunde erstellen (einmalig)

Die Vorlage ist ein eigenes, neues Sheet ohne meine Daten.

1. Am PC <https://sheets.new> öffnen. Ein leeres Sheet entsteht.
2. **Erweiterungen → Apps Script**. Die vorhandene Datei `Code.gs` in `Save` umbenennen (drei Punkte neben dem Namen → Umbenennen) und den Inhalt durch [api/Save.gs](../api/Save.gs) ersetzen.
3. Zwei neue Dateien anlegen (**+ → Script**): `Setup` mit [api/Setup.gs](../api/Setup.gs) und `Api` mit [api/Api.gs](../api/Api.gs). Strg + S.
4. Funktion **create** wählen, **Ausführen**, Berechtigungen bestätigen.
5. Das Sheet heißt jetzt „Trainings-Tracker“ und hat die Blätter Hilfe, Training A, Körper, Übungen, Muskelgruppen und Log. Log und Körper sind leer. „Training A“ ist das Beispiel-Tagesblatt, das meine Freunde umbenennen und duplizieren.

**Nicht** setupApi und **nicht** showSetupLink in der Vorlage ausführen. Sonst hätte jede Kopie denselben Schlüssel.

6. Oben rechts **Freigeben** → unter „Allgemeiner Zugriff“ **Jeder mit dem Link**, Rolle **Betrachter** → **Link kopieren**.
7. Im kopierten Link alles ab `/edit` (einschließlich `?usp=sharing`) durch `/copy` ersetzen. Aus `https://docs.google.com/spreadsheets/d/ABC…/edit?usp=sharing` wird `https://docs.google.com/spreadsheets/d/ABC…/copy`.
8. Den Kopier-Link in [ANLEITUNG.md](ANLEITUNG.md) bei Schritt 1 eintragen (aktuell steht dort meine Vorlage). Dann reicht es, meinen Freunden den Link zur Anleitung zu schicken.

Über den Link sehen sie nur die leere Vorlage, nie mein echtes Sheet.
