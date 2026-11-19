# Neuer Tracker mit Daten aus der Strong-App

Diese Anleitung ist für alle, die bisher mit der App **Strong** trainiert haben und ihren bisherigen Verlauf in den Trainings-Tracker mitnehmen wollen. Am Ende hast du einen eigenen Tracker, in dem alle bisherigen Trainings stehen. Die App zeigt dann sofort „Zuletzt“, „Ziel heute“ und deine Rekorde, und die PC-Auswertung zeigt den kompletten Verlauf.

Dauer: etwa 30 Minuten, alles am PC.

Du brauchst:
- den **Kopier-Link der Vorlage** von Tom,
- die Datei **Strong-Import.xlsx**, die Tom aus deinem Strong-Export erstellt hat (siehe [Schritt 0](#0-strong-daten-exportieren)).

---

## 0. Strong-Daten exportieren

1. In den Einstellungen der Strong-App die Funktion zum **Exportieren der Daten** wählen. Es entsteht eine CSV-Datei mit allen Trainings.
2. Die CSV-Datei an Tom schicken. Er wandelt sie in `Strong-Import.xlsx` um und schickt dir diese Datei zurück.

Übernommen werden nur Datum, Übung, Gewicht und Wiederholungen. Nicht übernommen werden:
- Aufwärmsätze (in Strong mit „W“ markiert) und Drop-Sätze („D“). Sie würden sonst als normale Sätze zählen und die Gewichtssteigerung bremsen.
- Cardio- und Zeitübungen ohne Gewicht und Wiederholungen (Laufen, Radfahren, Plank …).
- Assistierte Klimmzüge. Dort steht das Unterstützungsgewicht, im Tracker wäre das falsch herum.
- Offensichtliche Tippfehler, z. B. mehrere tausend Wiederholungen.

Die Workout-Namen aus Strong (z. B. „Abend-Workout“) werden nicht gebraucht. Deine Trainingstage legst du im Tracker neu an.

---

## 1. Tracker einrichten

Folge der normalen [Anleitung](ANLEITUNG.md) bis einschließlich **Schritt 5** (Einrichtungslink erzeugen):

1. [Vorlage kopieren](ANLEITUNG.md#1-vorlage-kopieren)
2. **Schritt 2 (Trainingstage) erst einmal überspringen.** Das machst du in Schritt 4 dieser Anleitung, wenn deine Übungen im Sheet stehen.
3. [Einrichtung ausführen](ANLEITUNG.md#3-einrichtung-ausführen) (`setupApi`)
4. [Web-App bereitstellen](ANLEITUNG.md#4-web-app-bereitstellen)
5. [Einrichtungslink erzeugen](ANLEITUNG.md#5-einrichtungslink-erzeugen)

---

## 2. Sicherung anlegen

Im Sheet: **Datei → Kopie erstellen**. Falls beim Einfügen etwas schiefgeht, kannst du so neu anfangen. Das Log nimmt Einträge nur auf, eine Löschfunktion gibt es nicht. Korrekturen sind nur von Hand möglich.

---

## 3. Strong-Daten einfügen

1. Im Sheet: **Datei → Importieren → Hochladen**, die Datei `Strong-Import.xlsx` wählen.
2. Bei „Importort“ **Neue Tabellenblätter einfügen** wählen → **Daten importieren**. Es entstehen drei neue Blätter: **Übungen neu**, **Log** (mit einer Zahl im Namen, z. B. „Log 1“) und **Zuordnung**.

**Übungen einfügen**

3. Im Blatt **Übungen neu** auf Zelle **A2** klicken, dann **Strg + Umschalt + Ende** (markiert alle Übungen bis zur letzten Zeile) und **Strg + C**.
4. Ins Blatt **Übungen** wechseln, in die **erste freie Zeile** unter den Vorlage-Übungen in **Spalte A** klicken.
5. **Strg + Umschalt + V** (nur Werte einfügen). Nur so bleiben die Auswahllisten und die Formatierung des Blatts erhalten.

**Trainings einfügen**

6. Im importierten Blatt **Log 1** auf **A2** klicken, **Strg + Umschalt + Ende**, **Strg + C**.
7. Ins echte Blatt **Log** wechseln, auf **A2** klicken, **Strg + Umschalt + V**.
8. Kurz prüfen: Spalte A zeigt Daten wie `11.11.2022`, Spalte B „Strong-Import“, Spalte L „Import Strong“.

**Aufräumen**

9. Die drei Import-Blätter löschen (Rechtsklick auf den Reiter → **Löschen**). Das Blatt **Zuordnung** vorher durchsehen, wenn du willst (siehe Schritt 5).
10. **Erweiterungen → Apps Script**, Funktion **setupApi** wählen, **Ausführen**. Das aktualisiert die Auswahllisten mit deinen neuen Übungen. Schlüssel und Web-App bleiben dabei unverändert.

In der Spalte **Tag** steht bei allen importierten Trainings „Strong-Import“. Damit haben sie im Verlauf der App einen Namen. Ein Tagesblatt mit diesem Namen brauchst du nicht.

---

## 4. Trainingstage anlegen

Jetzt wie in [Schritt 2 der Anleitung](ANLEITUNG.md#2-trainingstage-anlegen):

1. Den Reiter **Training A** in deinen ersten Trainingstag umbenennen, z. B. `Beine`.
2. In **B2** den Wochentag wählen, in **B3** optional einen zweiten.
3. Ab Zeile 6 deine Übungen aus der Liste wählen und daneben die Zahl der Sätze (1 bis 5).
4. Für jeden weiteren Tag: Tagesblatt **duplizieren** und umbenennen.

Deine Strong-Übungen findest du in der Liste unter ihren deutschen Namen. Welche Strong-Übung welcher Tracker-Übung entspricht, steht im Blatt **Zuordnung** der Import-Datei.

---

## 5. Übungen nacharbeiten

Im Blatt **Übungen**:

- **Muskelgruppe ergänzen:** Übungen mit eigenem Namen aus Strong (z. B. Gerätenummern) haben keine Muskelgruppe. In der Import-Datei sind sie gelb markiert. Ohne Muskelgruppe zählen sie nicht im Volumen der Auswertung. Fehlt dir eine Gruppe, legst du sie im Blatt **Muskelgruppen** an.
- **Aktiv:** Übungen, die du in den letzten Monaten gemacht hast, stehen auf „ja“, ältere auf „nein“. Ihr Verlauf bleibt erhalten, sie tauchen nur nicht mehr in den Auswahllisten auf. Übungen der Vorlage, die du nie machst, kannst du auf „nein“ stellen.
- **Wdh-Min, Wdh-Max und Gewichtssprung** sind Startwerte. Passe sie an deine Übungen an, denn danach richten sich „Ziel heute“ und die Rekorde.
- **Namen** kannst du jederzeit ändern. App, Auswertung und Tagesblätter übernehmen den neuen Namen, der Verlauf bleibt erhalten. Die **ID** nie ändern.

---

## 6. App verbinden

Weiter mit der normalen Anleitung:
- [App auf dem iPhone installieren](ANLEITUNG.md#6-app-auf-dem-iphone-installieren)
- [App verbinden](ANLEITUNG.md#7-app-verbinden)
- [PC-Auswertung einrichten](ANLEITUNG.md#auswertung)

Beim ersten Öffnen eines Trainingstags stehen bei jeder Übung schon dein letztes Training und das Ziel für heute.

---

## Wenn etwas nicht klappt

- **Datum in Spalte A sieht aus wie Text** (linksbündig, z. B. `2022-11-11`): Das Sheet steht nicht auf Deutsch. **Datei → Einstellungen → Gebietsschema: Deutschland**. Dann die Log-Zeilen noch einmal einfügen, vorher die falschen Zeilen von Hand löschen.
- **Neue Übungen fehlen in den Auswahllisten:** `setupApi` noch einmal ausführen (Schritt 3, Punkt 10).
- **Eine Übung ist falsch zugeordnet:** Im Log die Übungs-ID (Spalte C) der betroffenen Zeilen von Hand ändern.
