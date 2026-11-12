/**
 * Training tracker – setup of a new tracker sheet (run from the Apps Script editor).
 *
 * create():         builds all sheets in an EMPTY spreadsheet, with one example day sheet.
 *                   Used once to build the template. More days: duplicate a day sheet and rename the tab.
 * clearAllInputs(): clears entered kg, sets and failure marks on all input sheets.
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
  ["E09", "Schulterdrücken Kurzhantel sitzend", "Schulter vorne", "Grundübung", 8, 12, 2.5, "pro Hand", "nein"],
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

// bar weight in kg for the plate calculator (column "Stangengewicht kg"); others stay empty
const EXAMPLE_BAR_WEIGHTS = { E01: 20, E02: 20, E06: 0 };

const COLOR = { input: '#fff8e1', computed: '#f1f3f4', mutedText: '#6b7280', header: '#263238', accent: '#c62828', divider: '#b0b0b0', cellBorder: '#9e9e9e' };
const EXAMPLE_DAY = 'Training A';
// widths chosen so that A–F fit in portrait mode without horizontal scrolling
const COLUMN_WIDTHS = [96, 50, 50, 50, 50, 44];

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
  [SHEET.help, EXAMPLE_DAY, SHEET.body, SHEET.exercises, SHEET.log, SHEET.lists]
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
  refreshExerciseList_(ss);
  buildLogSheet_(ss);
  buildBodySheet_(ss);
  buildInputSheet_(ss, EXAMPLE_DAY);
  ss.setActiveSheet(ss.getSheetByName(SHEET.help));
}

function clearAllInputs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  daySheets_(ss).forEach(function (sheet) {
    clearInputs_(sheet);
    showStatus_(sheet, 'Eingaben zurückgesetzt.');
  });
  refreshAllInfo_(ss);
}

// ===== Sheet builders =========================================================
function buildLogSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET.log);
  sheet.getRange(1, 1, 1, LOG_HEADER.length).setValues([LOG_HEADER]);
  styleHeaderRow_(sheet, LOG_HEADER.length);
  sheet.getRange('A2:A').setNumberFormat('dd.MM.yyyy');
  sheet.getRange('K2:K').setNumberFormat('dd.MM.yyyy HH:mm');
  [90, 60, 80, 260, 130, 45, 60, 45, 75, 65, 130, 200].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
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

/**
 * Input sheet layout per slot (three rows):
 *   name row:  A–E merged exercise dropdown, F position dropdown (1..number of exercises)
 *   input row: A kg, B–E sets 1–4, F failure checkbox
 *   info row:  A = "zuletzt … · Ziel …", written by refreshInfo_()
 */
function buildInputSheet_(ss, day) {
  const sheet = ss.getSheetByName(day);
  const lastRow = FIRST_ROW + SLOT_COUNT * ROWS_PER_SLOT - 1;

  sheet.setHiddenGridlines(true);
  COLUMN_WIDTHS.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  if (sheet.getMaxColumns() > ID_COL) sheet.deleteColumns(ID_COL + 1, sheet.getMaxColumns() - ID_COL);
  ensureIdColumn_(sheet);
  sheet.hideColumns(ID_COL);
  if (sheet.getMaxRows() > lastRow) sheet.deleteRows(lastRow + 1, sheet.getMaxRows() - lastRow);
  sheet.getRange(1, 1, lastRow, INPUT_COLS).setFontFamily('Roboto').setFontSize(11).setVerticalAlignment('middle');

  // header area
  sheet.getRange(CELL.date).setFormula('=TODAY()').setNumberFormat('dd.MM.yyyy')
    .setFontWeight('bold').setBackground(COLOR.input);
  sheet.getRange(CELL.note).setBackground(COLOR.input).setFontColor(COLOR.mutedText)
    .setNote('Notiz zum Training, z. B. "Schulter links zwickt"');
  sheet.getRange('E1').setValue('Deload').setHorizontalAlignment('right').setFontColor(COLOR.mutedText);
  sheet.getRange('E2').setValue('Speichern').setHorizontalAlignment('right').setFontWeight('bold').setFontColor(COLOR.accent);
  sheet.getRange(CELL.deload).insertCheckboxes().setHorizontalAlignment('center');
  sheet.getRange(CELL.save).insertCheckboxes().setHorizontalAlignment('center');
  sheet.getRange(CELL.status).setValue('Bereit.').setFontSize(9).setFontStyle('italic').setFontColor(COLOR.mutedText);
  sheet.setRowHeights(1, 2, 32);

  sheet.getRange(4, 1, 1, INPUT_COLS).setValues([['kg', 'S1', 'S2', 'S3', 'S4', '✗']])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground(COLOR.header).setHorizontalAlignment('center');

  // validation: dropdown from the helper sheet, plausibility only as a hint (non-blocking)
  const dropdown = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName(SHEET.lists).getRange('A2:A500'), true).setAllowInvalid(true).build();
  const kgRule = SpreadsheetApp.newDataValidation().requireNumberBetween(0, 500)
    .setAllowInvalid(true).setHelpText('Gewicht 0 bis 500 kg').build();
  const repsRule = SpreadsheetApp.newDataValidation().requireNumberBetween(1, 50)
    .setAllowInvalid(true).setHelpText('Wiederholungen 1 bis 50').build();

  const protectedRanges = [sheet.getRange('E1:E2'), sheet.getRange(CELL.status), sheet.getRange(4, 1, 1, INPUT_COLS)];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const r = nameRow_(slot);
    // name row: A–E merged so the full exercise name is visible, F = position in the day
    sheet.getRange(r, 1, 1, INPUT_COLS).setFontWeight('bold').setWrap(false)
      .setBorder(true, null, null, null, null, null, COLOR.divider, SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(r, 1, 1, POSITION_COL - 1).merge();
    sheet.getRange(r, 1).setDataValidation(dropdown);
    sheet.getRange(r, POSITION_COL).setHorizontalAlignment('center');
    sheet.setRowHeight(r, 30);

    // input row: every cell framed so kg, S1–S4 and ✗ are clearly separated
    sheet.getRange(r + 1, 1).setDataValidation(kgRule);
    sheet.getRange(r + 1, 2, 1, 4).setDataValidation(repsRule);
    sheet.getRange(r + 1, 6).insertCheckboxes();
    sheet.getRange(r + 1, 1, 1, INPUT_COLS).setBackground(COLOR.input).setHorizontalAlignment('center')
      .setBorder(true, true, true, true, true, null, COLOR.cellBorder, SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeight(r + 1, 36);

    sheet.getRange(r + 2, 1, 1, INPUT_COLS).setBackground(COLOR.computed).setFontSize(9)
      .setFontColor(COLOR.mutedText).setWrap(false);
    sheet.setRowHeight(r + 2, 20);
    protectedRanges.push(sheet.getRange(r + 2, 1, 1, INPUT_COLS));
  }
  protectedRanges.forEach(function (range) {
    range.protect().setDescription('Berechnet – nicht überschreiben').setWarningOnly(true);
  });
  writeSlots_(sheet, [], { exercises: {}, idByName: {} });
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
    ['Trainingstage: jedes Tagesblatt ist ein Trainingstag, der Reitername ist der Name in der App.'],
    ['  Umbenennen: Reiter umbenennen (das Log zieht beim nächsten Öffnen der App nach). Neuer Tag: Tagesblatt duplizieren und umbenennen.'],
    ['  Reihenfolge in der App = Reihenfolge der Reiter. Löschen: Reiter löschen (das Log bleibt).'],
    ['Übungen: Übungsstamm. Neue Übung = neue Zeile mit neuer ID. Nie löschen, nur Aktiv = nein.'],
    ['Gewichtssprung: Schritt für die +/−-Knöpfe in der App. Stangengewicht: aktiviert den Scheibenrechner (0 = ohne Stange).'],
    ['Log: alle gespeicherten Sätze. Korrekturen direkt hier.'],
    ['Körper: Gewicht morgens nüchtern, Bauchumfang wöchentlich.'],
    ['Tagesblätter: Übungsauswahl je Trainingstag. Die App liest und schreibt sie; Eingabe direkt im Sheet ist ebenfalls möglich.'],
    ['  Übungsnamen nur im Blatt Übungen ändern, die Tagesblätter übernehmen ihn automatisch.'],
    [''],
    ['EXCEL-AUSWERTUNG'],
    ['Excel-Datei: template/Trainings-Auswertung.xlsx im Repository (Link oben) herunterladen.'],
    ['Datei → Freigeben → Im Web veröffentlichen → je Blatt Log, Übungen und Körper als CSV veröffentlichen'],
    ['und die drei Links in der Excel-Datei im Blatt Einstellungen eintragen.']
  ];
  sheet.getRange(1, 1, lines.length, 1).setValues(lines);
  sheet.setColumnWidth(1, 900);
  sheet.getRange('A1').setFontSize(14).setFontWeight('bold');
  [7, 18].forEach(function (row) { sheet.getRange(row, 1).setFontWeight('bold'); });
  sheet.setHiddenGridlines(true);
}

// ===== Helpers ================================================================
function styleHeaderRow_(sheet, columnCount) {
  sheet.getRange(1, 1, 1, columnCount).setFontWeight('bold').setFontColor('#ffffff').setBackground(COLOR.header);
  sheet.setFrozenRows(1);
}
