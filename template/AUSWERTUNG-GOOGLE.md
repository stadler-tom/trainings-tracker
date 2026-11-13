# Auswertung in Google Sheets

Dieselbe Auswertung wie in Excel: Dashboard, Übersicht, Volumen und Körper, als eigene Google-Sheets-Datei.

- Sie liest die Daten **live** aus deinem Tracker-Sheet. Du musst nichts veröffentlichen und nichts aktualisieren.
- Sie läuft auch in der Google-Sheets-App auf dem Handy.
- Alles darin sind normale Formeln und Diagramme: Du kannst sie selbst ändern.
- Dein Tracker-Sheet wird nur gelesen, nie verändert.

Es gibt zwei Wege. **A** ist für Tom, einmalig. **B** ist für alle anderen.

---

## A. Datei einmalig erstellen (Tom, etwa 10 Minuten am PC)

### A1. Datei hochladen und umwandeln

1. [Trainings-Auswertung-Google.xlsx](Trainings-Auswertung-Google.xlsx) herunterladen (auf GitHub **Download raw file**).
2. <https://drive.google.com> öffnen → **Neu → Datei hochladen** → die Datei wählen.
3. Die hochgeladene Datei per Doppelklick öffnen → oben **Datei → Als Google Tabellen speichern**.
4. Es öffnet sich eine neue Datei mit grünem Symbol. Mit dieser arbeitest du ab jetzt weiter. Die hochgeladene .xlsx kannst du in Drive löschen.

### A2. Einrichtungs-Script ausführen

1. In der neuen Datei: **Erweiterungen → Apps Script**.
2. Den Inhalt von `Code.gs` komplett durch [Auswertung.gs](Auswertung.gs) ersetzen (auf GitHub **Copy raw file**). Mit Strg + S speichern.
3. Oben die Funktion **setupAnalysis** wählen und auf **Ausführen** klicken.
4. Google fragt nach Berechtigungen: **Berechtigungen prüfen** → Konto wählen → **Erweitert** → **Zu … wechseln (unsicher)** → **Zulassen**.
5. Im Tab mit der Auswertung erscheint „Fertig“. Mit **OK** schließen.

Das Script schreibt die Import-Formeln, die Diagramme, die Verlaufslinien und die Übungsauswahl. Danach braucht die Datei es nicht mehr. Erneutes Ausführen stellt diese Teile wieder her, falls du sie einmal verbastelt hast.

### A3. Mit deinem Tracker verbinden

Wie in Teil B, Schritt B2.

### A4. Vorlage für deine Freunde

1. Von der fertig eingerichteten Datei eine Kopie machen: **Datei → Kopie erstellen**. Name zum Beispiel „Trainings-Auswertung Vorlage“.
2. In der Kopie im Blatt **Einstellungen** die Adresse in **C13 löschen**. Sonst sähe jeder deine Daten.
3. Kopie freigeben: **Freigeben → Jeder mit dem Link → Betrachter → Link kopieren**. Im Link das Ende ab `/edit` durch `/copy` ersetzen.
4. Diesen Link plus diese Anleitung (Teil B) an deine Freunde schicken.

---

## B. Auswertung nutzen (alle, etwa 3 Minuten)

### B1. Kopie erstellen

Den Vorlage-Link öffnen und **Kopie erstellen** klicken. Script und Formeln sind schon drin.

### B2. Mit dem eigenen Tracker verbinden

1. Dein **Tracker-Sheet** öffnen (das Sheet, in das die App speichert) und die Adresse aus der Adresszeile des Browsers kopieren. Sie beginnt mit `https://docs.google.com/spreadsheets/d/`.
2. In der Auswertung das Blatt **Einstellungen** öffnen und die Adresse in Zelle **C13** neben „Tracker-Sheet“ einfügen.
3. Auf die Zelle **C14** neben „Verbindung“ klicken. Dort steht zuerst `#REF!`. Beim Darüberfahren oder Antippen erscheint **Zugriff erlauben**. Klicken.
4. In C14 steht jetzt **verbunden**. Nach ein paar Sekunden füllen sich Dashboard, Übersicht, Volumen und Körper.

Fertig. Jedes gespeicherte Training erscheint beim nächsten Öffnen der Auswertung.

---

## Bedienung

- **Dashboard:** In C4 eine Übung auswählen. Die Liste enthält alle Übungen, die schon mindestens einmal trainiert wurden.
- **Volumen:** Muskelgruppen und Ziele (gelbe Zellen) kannst du selbst anpassen.
- **Datenblätter** (graue Reiter „Daten …“ und `_calc`): Hier werden die Daten vorbereitet. Diese Blätter nicht bearbeiten.

## Wenn etwas nicht klappt

| Was du siehst | Lösung |
| --- | --- |
| Hinweis „Noch nicht eingerichtet“ | Adresse in Einstellungen C13 eintragen |
| C14 zeigt „Adresse prüfen“ | Die Adresse gehört nicht zu einem Tracker-Sheet. Adresse des Sheets nehmen, in das die App speichert. |
| C14 zeigt dauerhaft `#REF!` | Auf C14 klicken und **Zugriff erlauben** wählen |
| Dashboard leer, obwohl verbunden | In C4 eine Übung aus der Liste wählen |
| Diagramme oder Verlaufslinien fehlen | Teil A2 wiederholen: **setupAnalysis** erneut ausführen |
