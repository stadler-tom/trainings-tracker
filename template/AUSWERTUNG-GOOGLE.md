# Auswertung in Google Sheets

> Diese Auswertung pflege ich nicht mehr. Inzwischen gibt es die PC-Auswertung, siehe [ANLEITUNG.md](ANLEITUNG.md#auswertung).

Das ist dieselbe Auswertung wie in Excel, also Dashboard, Übersicht, Volumen und Körper, nur als eigene Google-Sheets-Datei.

- Sie liest die Daten **live** aus deinem Tracker-Sheet. Du musst nichts veröffentlichen und nichts aktualisieren.
- Sie läuft auch in der Google-Sheets-App auf dem Handy.
- Alles darin sind normale Formeln und Diagramme, du kannst sie also selbst anpassen.
- Dein Tracker-Sheet wird nur gelesen, nie verändert.

Es gibt zwei Teile. **A** mache ich einmalig. **B** ist für alle anderen.

---

## A. Datei einmalig erstellen (mache ich, etwa 10 Minuten am PC)

### A1. Datei hochladen und umwandeln

1. [Trainings-Auswertung-Google.xlsx](Trainings-Auswertung-Google.xlsx) herunterladen (auf GitHub **Download raw file**).
2. <https://drive.google.com> öffnen → **Neu → Datei hochladen** → die Datei wählen.
3. Die hochgeladene Datei per Doppelklick öffnen → oben **Datei → Als Google Tabellen speichern**.
4. Es öffnet sich eine neue Datei mit grünem Symbol. Mit der geht es weiter. Die hochgeladene .xlsx kann in Drive gelöscht werden.

### A2. Einrichtungs-Script ausführen

1. In der neuen Datei: **Erweiterungen → Apps Script**.
2. Den Inhalt von `Code.gs` komplett durch [Auswertung.gs](Auswertung.gs) ersetzen (auf GitHub **Copy raw file**). Mit Strg + S speichern.
3. Oben die Funktion **setupAnalysis** wählen und auf **Ausführen** klicken.
4. Google fragt nach Berechtigungen: **Berechtigungen prüfen** → Konto wählen → **Erweitert** → **Zu … wechseln (unsicher)** → **Zulassen**.
5. Im Tab mit der Auswertung erscheint „Fertig“. Mit **OK** schließen.

Das Script schreibt die Import-Formeln, die Diagramme, die Verlaufslinien und die Übungsauswahl. Danach braucht die Datei es nicht mehr. Führt man es noch einmal aus, stellt es diese Teile wieder her, falls man sie mal verbastelt hat.

### A3. Mit deinem Tracker verbinden

Wie in Teil B, Schritt B2.

### A4. Vorlage für deine Freunde

1. Von der fertig eingerichteten Datei eine Kopie machen: **Datei → Kopie erstellen**, Name zum Beispiel „Trainings-Auswertung Vorlage“.
2. In der Kopie im Blatt **Einstellungen** die Adresse in **C13 löschen**. Sonst sähe jeder meine Daten.
3. Kopie freigeben: **Freigeben → Jeder mit dem Link → Betrachter → Link kopieren**. Im Link alles ab `/edit` durch `/copy` ersetzen.
4. Diesen Link und diese Anleitung (Teil B) an die Freunde schicken.

---

## B. Auswertung nutzen (alle, etwa 3 Minuten)

### B1. Kopie erstellen

Den Vorlage-Link von mir öffnen und **Kopie erstellen** klicken. Script und Formeln sind schon drin.

### B2. Mit dem eigenen Tracker verbinden

1. Dein **Tracker-Sheet** öffnen (das Sheet, in das die App speichert) und die Adresse aus der Adresszeile des Browsers kopieren. Sie fängt mit `https://docs.google.com/spreadsheets/d/` an.
2. In der Auswertung das Blatt **Einstellungen** öffnen und die Adresse in Zelle **C13** neben „Tracker-Sheet“ einfügen.
3. Auf die Zelle **C14** neben „Verbindung“ klicken. Dort steht erst `#REF!`. Wenn du mit der Maus darüberfährst oder die Zelle antippst, erscheint **Zugriff erlauben**. Draufklicken.
4. In C14 steht jetzt **verbunden**. Nach ein paar Sekunden füllen sich Dashboard, Übersicht, Volumen und Körper.

Das war's. Jedes gespeicherte Training taucht beim nächsten Öffnen der Auswertung auf.

---

## Bedienung

- **Dashboard:** In C4 eine Übung auswählen. In der Liste stehen alle Übungen, die du schon mindestens einmal trainiert hast.
- **Volumen:** Muskelgruppen und Ziele (gelbe Zellen) kannst du selbst anpassen.
- **Datenblätter** (graue Reiter „Daten …“ und `_calc`): Hier werden die Daten vorbereitet. Bitte nicht bearbeiten.

## Wenn etwas nicht klappt

| Was du siehst | Lösung |
| --- | --- |
| Hinweis „Noch nicht eingerichtet“ | Adresse in Einstellungen C13 eintragen |
| C14 zeigt „Adresse prüfen“ | Die Adresse gehört nicht zu einem Tracker-Sheet. Nimm die Adresse des Sheets, in das die App speichert. |
| C14 zeigt dauerhaft `#REF!` | Auf C14 klicken und **Zugriff erlauben** wählen |
| Dashboard leer, obwohl verbunden | In C4 eine Übung aus der Liste wählen |
| Diagramme oder Verlaufslinien fehlen | Teil A2 wiederholen: **setupAnalysis** noch einmal ausführen |
