/**
 * Training tracker – setup of a new tracker sheet (run from the Apps Script editor).
 *
 * create(): builds all sheets in an EMPTY spreadsheet, with one example day sheet.
 *           Used once to build the template. More days: duplicate a day sheet and rename the tab.
 *
 * Shared configuration (sheet names, columns, cells) lives in Save.gs.
 * Contains no personal data and no functions that delete logged data.
 * Convention: identifiers and comments in English, everything the user reads in German.
 */

// ===== Example master data for the template ==================================
// ID, name, muscle group, type, reps min, reps max, increment kg, weight type, active
const EXERCISES = [
  ["E01", "Kniebeuge (Langhantel)", "Quadrizeps", "Grundübung", 5, 8, 2.5, "Gesamt", "ja"],
  ["E02", "Rumänisches Kreuzheben (LH)", "Beinbeuger/Gesäß", "Grundübung", 6, 10, 2.5, "Gesamt", "ja"],
  ["E03", "Bulgarian Split Squat", "Quadrizeps", "Grundübung", 8, 12, 2.5, "pro Hand", "ja"],
  ["E04", "Beinstrecker sitzend", "Quadrizeps", "Isolation", 10, 15, 5.0, "Gesamt", "ja"],
  ["E05", "Beinbeuger sitzend", "Beinbeuger/Gesäß", "Isolation", 10, 15, 5.0, "Gesamt", "ja"],
  ["E06", "Schrägbankdrücken Multipresse", "Brust", "Grundübung", 6, 10, 2.5, "Gesamt", "ja"],
  ["E07", "Flachbankdrücken Kurzhantel", "Brust", "Grundübung", 8, 12, 2.5, "pro Hand", "ja"],
  ["E08", "Kabel-Fliegende stehend (mittig)", "Brust", "Isolation", 10, 15, 1.25, "pro Seite", "ja"],
  ["E09", "Schulterdrücken Kurzhantel sitzend", "Schulter seitlich", "Grundübung", 8, 12, 2.5, "pro Hand", "nein"],
  ["E10", "Lu Raises", "Schulter seitlich", "Isolation", 12, 20, 2.5, "pro Hand", "ja"],
  ["E11", "Trizepsdrücken Kabel", "Trizeps", "Isolation", 10, 15, 1.25, "Gesamt", "ja"],
  ["E12", "Latzug einarmig kniend", "Rücken", "Grundübung", 8, 12, 1.25, "pro Seite", "ja"],
  ["E13", "Klimmzüge", "Rücken", "Grundübung", 6, 10, 2.5, "Zusatzgewicht", "ja"],
  ["E14", "Rudern Kurzhantel brustgestützt", "Rücken", "Grundübung", 8, 12, 2.5, "pro Hand", "ja"],
  ["E15", "Reverse Fly Kabel", "Schulter hinten", "Isolation", 12, 25, 1.25, "pro Seite", "ja"],
  ["E16", "Bayesian Curls (Kabel)", "Bizeps", "Isolation", 10, 20, 1.25, "pro Seite", "ja"],
  ["E17", "Hammer Curls", "Bizeps", "Isolation", 8, 15, 2.5, "pro Hand", "ja"],
  ["E18", "Schrägbankdrücken Kurzhantel", "Brust", "Grundübung", 8, 12, 2.5, "pro Hand", "ja"],
  ["E19", "Brustpresse Maschine", "Brust", "Grundübung", 8, 12, 5.0, "Gesamt", "ja"],
  ["E20", "Latzug", "Rücken", "Grundübung", 8, 12, 5.0, "Gesamt", "ja"],
  ["E21", "Lat-Kabelrudern", "Rücken", "Grundübung", 8, 12, 5.0, "Gesamt", "ja"],
  ["E22", "Kabel-Seitheben", "Schulter seitlich", "Isolation", 12, 25, 1.25, "pro Seite", "ja"],
  ["E23", "Überkopf-Trizeps Kurzhantel (Schrägbank, eine Hantel)", "Trizeps", "Isolation", 10, 20, 2.5, "Gesamt", "ja"],
  ["E24", "Preacher Curls Kurzhantel", "Bizeps", "Isolation", 8, 15, 2.5, "pro Hand", "ja"],
  ["E25", "Pec Deck / Butterfly", "Brust", "Isolation", 10, 15, 5.0, "Gesamt", "ja"],
  ["E26", "Außenrotation Kabel", "Rotatorenmanschette", "Aufwärmen", 15, 15, "", "pro Seite", "ja"],
  ["E27", "Überkopf-Trizeps Kabel (stehend)", "Trizeps", "Isolation", 10, 15, 1.25, "Gesamt", "ja"]
];

// sheet "Muskelgruppen" of the template: name, weekly working sets min/max as a starting point (null = no target).
// Front delts have no group of their own: pressing trains them; overhead pressing counts for the side delts.
const TEMPLATE_MUSCLE_GROUPS = [
  ['Brust', 10, 16], ['Rücken', 12, 20], ['Schulter seitlich', 8, 16], ['Schulter hinten', 6, 12],
  ['Bizeps', 8, 14], ['Trizeps', 8, 14], ['Quadrizeps', 10, 16], ['Beinbeuger/Gesäß', 8, 14],
  ['Waden', 8, 16], ['Bauch', 6, 12], ['Rotatorenmanschette', null, null]
];

// bar weight in kg for the plate calculator (column "Stangengewicht kg"); others stay empty
const EXAMPLE_BAR_WEIGHTS = { E01: 20, E02: 20, E06: 0 };

const COLOR = { input: '#fff8e1', mutedText: '#6b7280', header: '#263238' };
const EXAMPLE_DAY = 'Training A';
// example plan of the template day: weekday Monday, three exercises with their number of sets
const EXAMPLE_SLOTS = [{ id: 'E06', sets: 4 }, { id: 'E12', sets: 3 }, { id: 'E01', sets: 4 }];

// ===== Public entry points ====================================================
function create() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(SHEET.log)) {
    throw new Error('Es gibt schon ein Blatt "Log". Einrichtung abgebrochen, damit keine Daten verloren gehen.');
  }
  ss.setSpreadsheetLocale('de_DE');
  ss.setSpreadsheetTimeZone('Europe/Berlin');
  ss.rename('Trainings-Tracker');
  const oldSheets = ss.getSheets();
  [SHEET.help, EXAMPLE_DAY, SHEET.body, SHEET.exercises, SHEET.muscleGroups, SHEET.log, SHEET.lists]
    .forEach(function (name) { ss.insertSheet(name); });
  oldSheets.forEach(function (s) { ss.deleteSheet(s); });

  buildHelpSheet_(ss);
  buildExerciseSheet_(ss);
  const extra = ensureExerciseColumns_(ss);
  const exerciseSheet = ss.getSheetByName(SHEET.exercises);
  EXERCISES.forEach(function (row, i) {
    if (row[EX.id] in EXAMPLE_BAR_WEIGHTS) exerciseSheet.getRange(i + 2, extra.barWeight).setValue(EXAMPLE_BAR_WEIGHTS[row[EX.id]]);
  });
  ss.getSheetByName(SHEET.lists).hideSheet();
  buildMuscleGroupSheet_(ss);                 // since 1.7.0
  ensureMuscleGroups_(ss);                    // adds any example group missing above and the hidden IDs
  applyMuscleGroupDropdown_(ss);
  refreshExerciseList_(ss);
  buildLogSheet_(ss);
  buildBodySheet_(ss);
  const ctx = loadContext_(ss);
  buildDaySheet_(ss, ss.getSheetByName(EXAMPLE_DAY), EXAMPLE_SLOTS.map(function (slot) {
    return { id: slot.id, name: ctx.exercises[slot.id].name, sets: slot.sets, superset: false };
  }), [1], ctx);
  ss.setActiveSheet(ss.getSheetByName(SHEET.help));
}

// ===== Sheet builders =========================================================
function buildLogSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET.log);
  sheet.getRange(1, 1, 1, LOG_HEADER.length).setValues([LOG_HEADER]);
  styleHeaderRow_(sheet, LOG_HEADER.length);
  sheet.getRange('A2:A').setNumberFormat('dd.MM.yyyy');
  sheet.getRange('K2:K').setNumberFormat('dd.MM.yyyy HH:mm');
  [90, 60, 80, 260, 130, 45, 60, 45, 75, 65, 130, 200, 75, 160, 50].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
}

// ===== Sheet builders =========================================================
function buildExerciseSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET.exercises);
  sheet.getRange(1, 1, 1, EX_HEADER.length).setValues([EX_HEADER]);
  sheet.getRange(2, 1, EXERCISES.length, EX_HEADER.length).setValues(EXERCISES);
  styleHeaderRow_(sheet, EX_HEADER.length);
  [60, 300, 150, 100, 70, 70, 140, 110, 60].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  const list = function (values) {
    return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  };
  sheet.getRange('D2:D500').setDataValidation(list(['Grundübung', 'Isolation', VALUE.warmUp]));
  sheet.getRange('H2:H500').setDataValidation(list(['Gesamt', 'pro Hand', 'pro Seite', VALUE.addedWeight]));
  sheet.getRange('I2:I500').setDataValidation(list([VALUE.active, 'nein']));
}

function buildMuscleGroupSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET.muscleGroups);
  sheet.getRange(1, 1, 1, MG_HEADER.length).setValues([MG_HEADER]);
  styleHeaderRow_(sheet, MG_HEADER.length);
  sheet.getRange(2, 1, TEMPLATE_MUSCLE_GROUPS.length, 3).setValues(TEMPLATE_MUSCLE_GROUPS.map(function (g) {
    return [g[0], g[1] === null ? '' : g[1], g[2] === null ? '' : g[2]];
  }));
  [180, 130, 130, 60].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.hideColumns(MG.id + 1);
}

function buildBodySheet_(ss) {
  const sheet = ss.getSheetByName(SHEET.body);
  sheet.getRange('A1:C1').setValues([['Datum', 'Gewicht kg', 'Bauchumfang cm']]);
  styleHeaderRow_(sheet, 3);
  sheet.getRange('A2:A').setNumberFormat('dd.MM.yyyy')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build());
  sheet.getRange('B2:C').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(30, 250).setAllowInvalid(true).setHelpText('Zahl zwischen 30 und 250').build());
  sheet.getRange('A2:C').setBackground(COLOR.input);
  [100, 100, 120].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.getRange('E1').setValue('Gewicht täglich morgens nüchtern · Bauchumfang wöchentlich auf Nabelhöhe')
    .setFontColor(COLOR.mutedText).setFontStyle('italic');
}

function buildHelpSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET.help);
  const lines = [
    ['Trainings-Tracker'],
    [''],
    ['Die Eingabe im Gym läuft über die App: https://stadler-tom.github.io/trainings-tracker/'],
    ['Dieses Sheet ist die Datenbank. Die vollständige Einrichtungsanleitung steht unter:'],
    ['https://github.com/stadler-tom/trainings-tracker/blob/main/template/ANLEITUNG.md'],
    [''],
    ['BLÄTTER'],
    ['Trainingstage: jedes Blatt mit „Trainingstag“ in A1 ist ein Trainingstag, der Reitername ist der Name in der App.'],
    ['  Darin: Wochentag und optional ein 2. Wochentag, darunter die Übungen mit ihrer Satzzahl (1–5).'],
    ['  Supersatz: Haken bei einer Übung = sie bildet mit der nächsten Übung einen Supersatz.'],
    ['  Umbenennen: Reiter umbenennen (das Log zieht beim nächsten Öffnen der App nach). Neuer Tag: Tagesblatt duplizieren und umbenennen.'],
    ['  Reihenfolge in der App: nach Wochentag, Montag zuerst; Tage ohne Wochentag am Ende. Löschen: Reiter löschen (das Log bleibt).'],
    ['Übungen: Übungsstamm. Neue Übung = neue Zeile mit neuer ID. Nie löschen, nur Aktiv = nein.'],
    ['Gewichtssprung: Schritt für die +/−-Knöpfe in der App. Stangengewicht: aktiviert den Scheibenrechner (0 = ohne Stange).'],
    ['Muskelgruppen: jede Gruppe genau einmal, mit Ziel-Sätzen pro Woche. Im Blatt Übungen wird die Gruppe per Auswahl gewählt.'],
    ['  Umbenennen hier: die Übungen ziehen automatisch nach. Neue Gruppe: neue Zeile (Spalte ID bleibt leer).'],
    ['Log: alle gespeicherten Sätze. Korrekturen direkt hier. Spalte 1RM-Test: 1 = echter Maximalversuch. Spalte Eingeschränkt: Grund oder „ja“. Spalte Drop: 1, 2, 3 = Drop-Satz nach dem letzten Satz.'],
    ['Einstellungen: Deload-Abstand, Gewichtsziel und „Gewicht pro Satz“ (ja = jeder Satz hat ein eigenes Gewicht).'],
    ['Körper: Gewicht morgens nüchtern, Bauchumfang wöchentlich.'],
    ['Trainings werden nur über die App gespeichert. Übungsnamen nur im Blatt Übungen ändern, die Tagesblätter übernehmen sie automatisch.'],
    [''],
    ['PC-AUSWERTUNG'],
    ['https://stadler-tom.github.io/trainings-tracker/auswertung/ – den Link dafür zeigt die Funktion showSetupLink im Script-Editor.'],
    ['Als Lesezeichen anlegen; mit synchronisierten Lesezeichen geht sie auf jedem PC.']
  ];
  sheet.getRange(1, 1, lines.length, 1).setValues(lines);
  sheet.setColumnWidth(1, 900);
  sheet.getRange('A1').setFontSize(14).setFontWeight('bold');
  [7, 22].forEach(function (row) { sheet.getRange(row, 1).setFontWeight('bold'); });
  sheet.setHiddenGridlines(true);
}

// ===== Helpers ================================================================
function styleHeaderRow_(sheet, columnCount) {
  sheet.getRange(1, 1, 1, columnCount).setFontWeight('bold').setFontColor('#ffffff').setBackground(COLOR.header);
  sheet.setFrozenRows(1);
}
