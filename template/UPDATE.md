# Script im Sheet aktualisieren

Die App aktualisiert sich von selbst. Das Script in deinem Google Sheet nicht: Zeigt die App „Script im Sheet veraltet“ oder willst du die Neuerungen einer Version nutzen (siehe unten), ersetzt du die Script-Dateien einmal mit dieser Anleitung. Deine Daten bleiben dabei unverändert, und die App-Verbindung (Adresse und Schlüssel) bleibt gleich.

Dauer: etwa 5 Minuten am PC.

## 1. Sicherung

Im Sheet **Datei → Kopie erstellen**. Die Kopie zum Beispiel „Sicherung TT-MM-JJJJ“ nennen. Sie ist nur Reserve, du arbeitest im Original weiter.

## 2. Script-Dateien ersetzen

1. Im Sheet **Erweiterungen → Apps Script**.
2. Links unter **Dateien** stehen `Save.gs`, `Setup.gs` und `Api.gs`.
3. Für jede der drei Dateien:
   1. Im Repository die Datei öffnen: [Save.gs](../api/Save.gs), [Setup.gs](../api/Setup.gs), [Api.gs](../api/Api.gs).
   2. Oben rechts auf **Copy raw file** (Symbol mit zwei Rechtecken) klicken.
   3. Im Script-Editor die gleichnamige Datei öffnen, mit Strg + A alles markieren und mit Strg + V ersetzen.
   4. Fehlt eine Datei im Editor: links neben **Dateien** auf **+ → Script** klicken und sie genau so benennen (ohne `.gs`).
4. Mit Strg + S speichern.

> Die Namen der Dateien im Editor können abweichen (z. B. `Code.gs`). Wichtig ist nur, dass der Inhalt jeder der drei Dateien genau einmal vorhanden ist. Eine alte Datei, deren Inhalt du ersetzt hast, darf nicht zusätzlich stehen bleiben.

## 3. Einrichtung erneut ausführen

1. Oben die Funktion **setupApi** wählen und **Ausführen** klicken.
2. Fragt Google nach Berechtigungen, wie bei der Einrichtung bestätigen (**Erweitert → Zu … wechseln → Zulassen**).
3. Im Tab mit dem Sheet die Meldung lesen und mit **OK** schließen. Steht dort **ACHTUNG Muskelgruppen**, siehe Version 1.7.0 unten.

setupApi ergänzt nur, was fehlt. Es ändert keine Daten und erzeugt keinen neuen Schlüssel.

## 4. Neue Version bereitstellen, gleiche Adresse

1. **Bereitstellen → Bereitstellungen verwalten**.
2. Die bestehende Web-App-Bereitstellung auswählen und auf das **Stift-Symbol** (Bearbeiten) klicken.
3. Bei **Version** den Eintrag **Neue Version** wählen.
4. **Bereitstellen** klicken.

> Nicht „Neue Bereitstellung“ wählen: Das erzeugt eine neue Adresse, und du müsstest den Einrichtungslink neu in die App übernehmen. Mit „Bearbeiten → Neue Version“ bleibt die Adresse gleich.

## 5. Prüfen

In der App **Einstellungen → Verbindung testen**. Die Meldung zeigt die neue Web-API-Version, der Hinweis „veraltet“ ist weg.

## Neu in Version 1.7.0

Die App funktioniert auch ohne dieses Update weiter. Für die drei Neuerungen brauchst du es.

**Muskelgruppen.** setupApi legt das Blatt **Muskelgruppen** an und übernimmt jede Gruppe, die bei deinen Übungen steht. Im Blatt Übungen wählst du die Gruppe danach aus einer Liste.
- Trag bei jeder Gruppe **Sätze/Woche Min** und **Max** ein. Das ist der Zielbereich auf der Seite Volumen der PC-Auswertung.
- Meldet setupApi **ACHTUNG Muskelgruppen**, gibt es dieselbe Gruppe in zwei Schreibweisen (z. B. „Brust“ und „brust“). Dann:
  1. Im Blatt **Übungen** alle betroffenen Zellen auf eine Schreibweise ändern.
  2. Im Blatt **Muskelgruppen** die Zeile mit der anderen Schreibweise leeren (Inhalt löschen).
  3. setupApi noch einmal ausführen. Jetzt kommt die Auswahlliste.
- Eine Gruppe benennst du nur noch im Blatt Muskelgruppen um. Die Übungen ziehen sofort nach. Das Log bleibt, wie es gespeichert wurde.

**1RM-Test.** Das Log bekommt die Spalte **1RM-Test** (Spalte M). In der App gibt es bei jeder Übung den Haken „1RM-Test (Maximalversuch)“.

**PC-Auswertung.** Im Script-Editor die Funktion **showSetupLink** ausführen. Das Fenster zeigt jetzt zwei Links. Den zweiten (**PC-Auswertung**) am PC als Lesezeichen anlegen und öffnen. Mit synchronisierten Lesezeichen geht es danach auf jedem PC.
