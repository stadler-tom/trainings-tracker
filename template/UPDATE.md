# Script im Sheet aktualisieren

Die App aktualisiert sich von selbst, das Script in deinem Google Sheet aber nicht. Meldet die App „Script im Sheet veraltet“ oder willst du die Neuerungen einer Version nutzen (siehe unten), tauschst du die Script-Dateien einmal mit dieser Anleitung aus. Deine Daten bleiben dabei, wie sie sind, und auch die Verbindung zur App (Adresse und Schlüssel) ändert sich nicht.

Dauer: etwa 5 Minuten am PC.

## 1. Sicherung

Im Sheet **Datei → Kopie erstellen** und die Kopie zum Beispiel „Sicherung TT-MM-JJJJ“ nennen. Die ist nur für den Notfall da, weitergearbeitet wird im Original.

## 2. Script-Dateien ersetzen

1. Im Sheet **Erweiterungen → Apps Script**.
2. Links unter **Dateien** findest du `Save.gs`, `Setup.gs` und `Api.gs`.
3. Für jede der drei Dateien:
   1. Die Datei im Repository öffnen: [Save.gs](../api/Save.gs), [Setup.gs](../api/Setup.gs), [Api.gs](../api/Api.gs).
   2. Oben rechts auf **Copy raw file** klicken (Symbol mit zwei Rechtecken).
   3. Im Script-Editor die gleichnamige Datei öffnen, mit Strg + A alles markieren und mit Strg + V ersetzen.
   4. Fehlt eine Datei im Editor: links neben **Dateien** auf **+ → Script** klicken und sie genau so benennen (ohne `.gs`).
4. Mit Strg + S speichern.

> Bei dir können die Dateien im Editor anders heißen (z. B. `Code.gs`). Wichtig ist nur, dass der Inhalt jeder der drei Dateien genau einmal da ist. Eine alte Datei, deren Inhalt du ersetzt hast, darf nicht zusätzlich stehen bleiben.

## 3. Einrichtung erneut ausführen

1. Oben die Funktion **setupApi** wählen und **Ausführen** klicken.
2. Fragt Google nach Berechtigungen, bestätigst du sie wie bei der Einrichtung (**Erweitert → Zu … wechseln → Zulassen**).
3. Im Tab mit dem Sheet die Meldung lesen und mit **OK** schließen. Steht dort **ACHTUNG Muskelgruppen**, schau bei Version 1.7.0 unten nach.

setupApi ergänzt nur, was fehlt. Es ändert nichts im Log und erzeugt keinen neuen Schlüssel. Einzige Ausnahme: Beim Update auf 1.8.0 baut es die Tagesblätter einmal um (siehe unten).

## 4. Neue Version bereitstellen, gleiche Adresse

1. **Bereitstellen → Bereitstellungen verwalten**.
2. Die bestehende Web-App-Bereitstellung auswählen und aufs **Stift-Symbol** (Bearbeiten) klicken.
3. Bei **Version** den Eintrag **Neue Version** wählen.
4. **Bereitstellen** klicken.

> Bitte nicht „Neue Bereitstellung“ nehmen. Das erzeugt eine neue Adresse, und du müsstest den Einrichtungslink neu in die App übernehmen. Mit „Bearbeiten → Neue Version“ bleibt die Adresse gleich.

## 5. Prüfen

In der App **Einstellungen → Verbindung testen**. Die Meldung zeigt jetzt die neue Web-API-Version, und der Hinweis „veraltet“ ist weg.

## Neu in Version 1.9.0

**Einstellungen in der App.** Unter *Einstellungen → Globale Einstellungen* zeigt dir die App die Werte aus dem Blatt **Einstellungen** (Deload-Intervall, Ziel Körpergewicht, Gewicht pro Satz). Änderungen speichert sie direkt ins Sheet. Ohne das Script-Update steht dort nur ein Hinweis, der Rest der App läuft normal weiter.

**Dunkelmodus** (nur App, dafür brauchst du kein Script-Update): Schieber unter *Einstellungen → Darstellung*. Er gilt pro Gerät. Solange du ihn nicht anfasst, richtet sich die App wie bisher nach der Einstellung deines Handys.

## Neu in Version 1.8.1

**Wichtig:** Ab jetzt braucht die App Script-Version 1.8.1. Bist du noch auf 1.7, machst du das Update einmal und bekommst alles aus 1.8.0 gleich mit (siehe unten).

**Rekord.** Das Rekordbild gibt es nur noch, wenn du mit einem neuen, höheren Gewicht mindestens die Min-Wdh der Übung schaffst. Mehr Wiederholungen beim gleichen Gewicht sind kein Rekord. Schaffst du die Min-Wdh einer Übung zum ersten Mal, ist das erst der Ausgangswert, noch kein Rekord. Das gilt auch für die 🏆 in der Zusammenfassung. Die PC-Auswertung zählt weiterhin neue e1RM-Bestwerte.

## Neu in Version 1.8.0

**Wichtig:** Bis du das Script aktualisiert hast, zeigt die App „Script im Sheet veraltet“ und speichert nicht. Mach das Update also vor deinem nächsten Training.

**Tagesblätter neu.** setupApi baut jedes Tagesblatt einmal in den neuen Aufbau um. Übungen und Reihenfolge bleiben, das Log wird nicht angefasst. In der Meldung stehen die umgebauten Blätter. Danach schaust du in jedem Tagesblatt kurz nach:
- **B2 Wochentag:** an welchem Tag du diese Einheit trainierst (Auswahlliste). **B3** ist für einen optionalen zweiten Wochentag. Damit rahmt die App den heutigen Tag ein und zeigt die Tage am Knopf, z. B. „Push (Mo, Do)“. Ohne Wochentag schätzt die App wie bisher.
- **Sätze** (Spalte B neben jeder Übung): 1 bis 5. Nach dem Umbau stehen überall 4.
- Die Spalten für kg und S1–S4 gibt es nicht mehr. Trainings speicherst du nur noch über die App.

**Neuer Trainingstag:** Ein Tagesblatt duplizieren und umbenennen. Oder ein leeres Blatt anlegen, in A1 `Trainingstag` schreiben und setupApi ausführen, dann baut es das Blatt fertig auf. Das Blatt **Trainingsplan** brauchst du nicht mehr und kannst es löschen.

**Eingeschränkt.** Bei jeder Übung gibt es in der App den Haken „Eingeschränkt (Schmerzen, Abbruch)“, auf Wunsch mit Grund. Dafür bekommt das Log die Spalte **Eingeschränkt** (Spalte N): Dort steht der Grund oder „ja“. Eine eingeschränkte Einheit zählt nicht für Ziel, Rekorde und Progression, beim Volumen aber schon. In der PC-Auswertung siehst du sie als hohlen Punkt.

**Gewicht pro Satz.** Im Blatt **Einstellungen** gibt es die Zeile **Gewicht pro Satz** (ja/nein, Standard nein). Mit „ja“ hat in der App jeder Satz sein eigenes Gewichtsfeld. Das Ziel gilt dann pro Satz: Ein Satz, der beim letzten Mal das Wdh-Maximum geschafft hat, steigt um den Gewichtssprung, die anderen bleiben gleich.

## Neu in Version 1.7.0

Ohne dieses Update funktioniert die App weiter. Für die drei Neuerungen brauchst du es aber.

**Muskelgruppen.** setupApi legt das Blatt **Muskelgruppen** an und übernimmt jede Gruppe, die bei deinen Übungen steht. Im Blatt Übungen wählst du die Gruppe danach aus einer Liste.
- Trag bei jeder Gruppe **Sätze/Woche Min** und **Max** ein. Das ist dein Zielbereich auf der Seite Volumen in der PC-Auswertung.
- Meldet setupApi **ACHTUNG Muskelgruppen**, gibt es dieselbe Gruppe in zwei Schreibweisen (z. B. „Brust“ und „brust“). Dann:
  1. Im Blatt **Übungen** alle betroffenen Zellen auf eine Schreibweise ändern.
  2. Im Blatt **Muskelgruppen** die Zeile mit der anderen Schreibweise leeren (Inhalt löschen).
  3. setupApi noch einmal ausführen. Jetzt kommt die Auswahlliste.
- Eine Gruppe benennst du ab jetzt nur noch im Blatt Muskelgruppen um. Die Übungen ziehen sofort nach. Das Log bleibt so, wie es gespeichert wurde.

**1RM-Test.** Das Log bekommt die Spalte **1RM-Test** (Spalte M). In der App gibt es bei jeder Übung den Haken „1RM-Test (Maximalversuch)“.

**PC-Auswertung.** Im Script-Editor die Funktion **showSetupLink** ausführen. Das Fenster zeigt jetzt zwei Links. Den zweiten (**PC-Auswertung**) legst du am PC als Lesezeichen an und öffnest ihn. Mit synchronisierten Lesezeichen klappt das danach auf jedem PC.
