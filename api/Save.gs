/**
 * Training tracker – runtime script (requirements spec sections 5, 6, 9).
 *
 * onEdit handles all interaction on the input sheets:
 * - ticking "Speichern" saves the training to the log,
 * - changing or removing an exercise compacts the slots and refreshes the info rows,
 * - choosing a position in column F moves the exercise there (inputs move with it),
 * - toggling "Deload" refreshes the info rows.
 * Info rows are computed here and written as plain text (no sheet formulas),
 * so nothing depends on the spreadsheet locale.
 *
 * Convention: identifiers and comments in English, everything the user reads in German.
 */

// ===== Configuration (shared with Setup.gs) ==================================
const SHEET = { settings: 'Einstellungen', exercises: 'Übungen', log: 'Log', body: 'Körper', help: 'Hilfe', lists: '_lists' };
// Used when a sheet has no "Einstellungen" sheet yet (trackers created before version 1 of the app).
const DEFAULT_DAYS = ['Beine', 'Push', 'Pull', 'Upper'];
const MAX_DAYS = 7;

/** Training day names from sheet "Einstellungen" (A2:A8), in order. */
function daySheets_(ss) {
  const settings = ss.getSheetByName(SHEET.settings);
  if (!settings) return DEFAULT_DAYS.slice();
  const names = settings.getRange(2, 1, MAX_DAYS, 1).getValues()
    .map(function (r) { return String(r[0] || '').trim(); })
    .filter(function (name) { return name !== ''; });
  return names.length ? names : DEFAULT_DAYS.slice();
}

// Each slot uses three rows: exercise name + position, inputs, info.
const FIRST_ROW = 5;
const SLOT_COUNT = 10;
const ROWS_PER_SLOT = 3;
const INPUT_COLS = 6;       // input row: A kg, B–E sets 1–4, F failure
const CELL = { date: 'A1', note: 'A2', status: 'A3', deload: 'F1', save: 'F2' };
const NO_EXERCISE = '– keine –';   // dropdown entry that empties a slot
const POSITION_COL = 6;            // name row, column F: position of the exercise in the day

// column index (0-based) in sheet "Übungen" and "Log"
const EX = { id: 0, name: 1, muscleGroup: 2, type: 3, repsMin: 4, repsMax: 5, increment: 6, weightType: 7, active: 8 };
const LOG = { date: 0, day: 1, exerciseId: 2, exercise: 3, muscleGroup: 4, set: 5, kg: 6, reps: 7, failure: 8, deload: 9, savedAt: 10, note: 11 };
const EX_HEADER = ['ID', 'Übung', 'Muskelgruppe', 'Typ', 'Wdh-Min', 'Wdh-Max', 'Gewichtssprung (kg)', 'Gewichtsart', 'Aktiv'];
const LOG_HEADER = ['Datum', 'Tag', 'Übungs-ID', 'Übung', 'Muskelgruppe', 'Satz', 'kg', 'Wdh', 'Versagen', 'Deload', 'Gespeichert am', 'Notiz'];
const VALUE = { active: 'ja', warmUp: 'Aufwärmen', addedWeight: 'Zusatzgewicht' };
const DECREASE_TOLERANCE = 2;   // rule 3 only if set 1 is more than this below reps min

function nameRow_(slot) { return FIRST_ROW + slot * ROWS_PER_SLOT; }
function slotBlockRange_(sheet) { return sheet.getRange(FIRST_ROW, 1, SLOT_COUNT * ROWS_PER_SLOT, INPUT_COLS); }

// ===== Trigger ================================================================
/** Simple trigger: runs on every edit, also in the Google Sheets mobile app. */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const name = sheet.getName();
  const ss = sheet.getParent();

  if (name === SHEET.exercises) { refreshExerciseList_(ss); refreshAllInfo_(ss); return; }
  if (name === SHEET.log) { refreshAllInfo_(ss); return; }
  if (daySheets_(ss).indexOf(name) < 0) return;

  const a1 = range.getA1Notation();
  if (a1 === CELL.save) {
    if (range.getValue() !== true) return;
    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(10000)) {
      showStatus_(sheet, 'Nicht gespeichert: anderer Speichervorgang läuft. Bitte erneut anhaken.');
      return;
    }
    try {
      saveTraining_(sheet);
      refreshAllInfo_(ss);   // exercises can appear on several days
    } finally {
      lock.releaseLock();
    }
    return;
  }
  if (a1 === CELL.deload) { refreshInfo_(sheet, loadContext_(ss)); return; }

  const offset = range.getRow() - FIRST_ROW;
  const isNameRow = offset >= 0 && offset % ROWS_PER_SLOT === 0 && offset < SLOT_COUNT * ROWS_PER_SLOT;
  if (!isNameRow) return;
  if (range.getColumn() === 1) {                        // exercise changed, added or removed
    writeSlots_(sheet, readSlots_(sheet));
    refreshInfo_(sheet, loadContext_(ss));
  } else if (range.getColumn() === POSITION_COL) {      // position changed
    moveSlot_(sheet, offset / ROWS_PER_SLOT, Number(range.getValue()));
    refreshInfo_(sheet, loadContext_(ss));
  }
}

// ===== Slots: order, compaction and visibility ===============================
/** Returns the used slots in sheet order: exercise name and its input row (kg, sets, failure). */
function readSlots_(sheet) {
  const values = slotBlockRange_(sheet).getValues();
  const used = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const base = slot * ROWS_PER_SLOT;
    const exName = String(values[base][0] || '');
    if (exName && exName !== NO_EXERCISE) used.push({ name: exName, inputs: values[base + 1] });
  }
  return used;
}

/** Moves the exercise in the given slot to a new position (1-based); the others shift. */
function moveSlot_(sheet, fromSlot, toPosition) {
  const used = readSlots_(sheet);
  if (fromSlot < used.length && toPosition >= 1 && toPosition <= used.length) {
    const moved = used.splice(fromSlot, 1)[0];
    used.splice(toPosition - 1, 0, moved);
  }
  writeSlots_(sheet, used);   // also restores the number if the selection was invalid
}

/**
 * Writes the slots in the given order from the top, clears the rest, renumbers
 * the positions and shows only the used slots plus one empty slot for adding.
 * Name rows are merged across A–E: only column A (name) and F (position) are written there.
 */
function writeSlots_(sheet, used) {
  const columnA = [];
  const columnF = [];
  const emptyInputs = ['', '', '', '', '', false];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const entry = used[slot];
    const inputs = entry ? entry.inputs.map(function (v, i) { return i === 5 ? v === true : v; }) : emptyInputs;
    columnA.push([entry ? entry.name : ''], [inputs[0]], ['']);      // name, kg, info (rewritten by refreshInfo_())
    columnF.push([entry ? slot + 1 : ''], [inputs[5]], ['']);       // position, failure, info
    sheet.getRange(nameRow_(slot) + 1, 2, 1, 4).setValues([inputs.slice(1, 5)]);
  }
  sheet.getRange(FIRST_ROW, 1, columnA.length, 1).setValues(columnA);
  sheet.getRange(FIRST_ROW, POSITION_COL, columnF.length, 1).setValues(columnF);
  updatePositionDropdowns_(sheet, used.length);
  updateSlotVisibility_(sheet, used.length);
}

/** Position dropdown 1..n on every used slot; no dropdown on empty slots. */
function updatePositionDropdowns_(sheet, usedCount) {
  const options = [];
  for (let i = 1; i <= usedCount; i++) options.push(String(i));
  const rule = usedCount ? SpreadsheetApp.newDataValidation().requireValueInList(options, true)
    .setAllowInvalid(true).build() : null;
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    sheet.getRange(nameRow_(slot), POSITION_COL).setDataValidation(slot < usedCount ? rule : null);
  }
}

/** Shows used slots and one empty slot; hides the remaining empty slots. */
function updateSlotVisibility_(sheet, usedCount) {
  sheet.showRows(FIRST_ROW, SLOT_COUNT * ROWS_PER_SLOT);
  const firstHiddenSlot = usedCount + 1;
  if (firstHiddenSlot < SLOT_COUNT) {
    sheet.hideRows(nameRow_(firstHiddenSlot), (SLOT_COUNT - firstHiddenSlot) * ROWS_PER_SLOT);
  }
}

// ===== Save (section 6) =======================================================
function saveTraining_(sheet) {
  const ss = sheet.getParent();
  const tz = ss.getSpreadsheetTimeZone();
  const day = sheet.getName();
  try {
    const rawDate = sheet.getRange(CELL.date).getValue();
    if (!(rawDate instanceof Date)) return abort_(sheet, 'Datum in A1 ist ungültig.');
    const date = new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate());
    const dateText = Utilities.formatDate(date, tz, 'dd.MM.yyyy');
    const isDeload = sheet.getRange(CELL.deload).getValue() === true;
    const note = String(sheet.getRange(CELL.note).getValue() || '');
    const exercises = loadExercises_(ss);

    const values = slotBlockRange_(sheet).getValues();
    const now = new Date();
    const rows = [];
    const errors = [];
    let exerciseCount = 0;

    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const exName = String(values[slot * ROWS_PER_SLOT][0] || '');
      const inputs = values[slot * ROWS_PER_SLOT + 1];
      const kg = inputs[0];
      const failure = inputs[5] === true;
      if (!exName || exName === NO_EXERCISE) continue;
      const sets = [];
      inputs.slice(1, 5).forEach(function (reps, i) { if (reps !== '') sets.push({ no: i + 1, reps: reps }); });
      if (!sets.length) continue;                       // no sets = exercise not done

      const ex = exercises[exName];
      if (!ex) { errors.push(exName + ': nicht im Übungsstamm'); continue; }
      if (typeof kg !== 'number') { errors.push(exName + ': Gewicht fehlt'); continue; }
      if (sets.some(function (s) { return typeof s.reps !== 'number'; })) {
        errors.push(exName + ': Wiederholungen keine Zahl'); continue;
      }
      exerciseCount++;
      sets.forEach(function (s, i) {
        const isLastSet = i === sets.length - 1;
        rows.push([date, day, ex.id, exName, ex.muscleGroup, s.no, kg, s.reps,
          failure && isLastSet, isDeload, now, note]);
      });
    }

    if (errors.length) return abort_(sheet, 'Nicht gespeichert – ' + errors.join('; '));
    if (!rows.length) return abort_(sheet, 'Nicht gespeichert: keine Übung mit Gewicht und Satz eingetragen.');

    // reject a second save of the same day sheet on the same date
    const log = ss.getSheetByName(SHEET.log);
    const lastRow = log.getLastRow();
    if (lastRow > 1) {
      const exists = log.getRange(2, 1, lastRow - 1, 2).getValues().some(function (r) {
        return r[0] instanceof Date && r[1] === day && Utilities.formatDate(r[0], tz, 'dd.MM.yyyy') === dateText;
      });
      if (exists) {
        return abort_(sheet, 'Nicht gespeichert: ' + day + ' am ' + dateText +
          ' ist schon im Log. Korrekturen bitte direkt im Blatt Log.');
      }
    }

    // write in one step; if this throws, the inputs stay untouched
    log.getRange(lastRow + 1, 1, rows.length, LOG_HEADER.length).setValues(rows);
    SpreadsheetApp.flush();

    clearInputs_(sheet);
    showStatus_(sheet, 'Gespeichert: ' + day + (isDeload ? ' (Deload)' : '') + ', ' +
      exerciseCount + (exerciseCount === 1 ? ' Übung, ' : ' Übungen, ') +
      rows.length + (rows.length === 1 ? ' Satz, ' : ' Sätze, ') + dateText);
  } catch (err) {
    abort_(sheet, 'Fehler beim Speichern: ' + err.message + ' – Eingaben sind erhalten.');
  }
}

/** Clears kg, sets, failure, note and header boxes; keeps the exercise selection. */
function clearInputs_(sheet) {
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const r = nameRow_(slot) + 1;
    sheet.getRange(r, 1, 1, 5).clearContent();
    sheet.getRange(r, 6).setValue(false);
  }
  sheet.getRange(CELL.note).clearContent();
  sheet.getRange(CELL.date).setFormula('=TODAY()');
  sheet.getRange(CELL.deload).setValue(false);
  sheet.getRange(CELL.save).setValue(false);
}

function abort_(sheet, message) {
  sheet.getRange(CELL.save).setValue(false);
  showStatus_(sheet, message);
}

function showStatus_(sheet, message) {
  const time = Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), 'HH:mm');
  sheet.getRange(CELL.status).setValue(time + '  ' + message);
}

// ===== Exercise list for the dropdowns (section 4) ===========================
/** "– keine –" first, then active exercises sorted by muscle group and name. */
function refreshExerciseList_(ss) {
  const data = ss.getSheetByName(SHEET.exercises).getDataRange().getValues().slice(1);
  const active = data
    .filter(function (r) { return r[EX.name] && r[EX.active] === VALUE.active; })
    .map(function (r) { return [String(r[EX.name]), String(r[EX.muscleGroup])]; })
    .sort(function (a, b) { return a[1].localeCompare(b[1], 'de') || a[0].localeCompare(b[0], 'de'); });
  const list = [[NO_EXERCISE, '']].concat(active);

  const lists = ss.getSheetByName(SHEET.lists);
  lists.getRange('A2:B').clearContent();
  lists.getRange('A1:B1').setValues([['Übung (aktiv)', 'Muskelgruppe']]);
  lists.getRange(2, 1, list.length, 2).setValues(list);
}

// ===== Info row: "zuletzt" and "Ziel heute" (section 9) ======================
function loadExercises_(ss) {
  const byName = {};
  ss.getSheetByName(SHEET.exercises).getDataRange().getValues().slice(1).forEach(function (r) {
    if (!r[EX.name]) return;
    byName[String(r[EX.name])] = {
      id: r[EX.id], muscleGroup: r[EX.muscleGroup], type: r[EX.type],
      repsMin: Number(r[EX.repsMin]), repsMax: Number(r[EX.repsMax]),
      increment: Number(r[EX.increment]) || 0, weightType: r[EX.weightType]
    };
  });
  return byName;
}

/** Reads exercises and log once; keeps the latest non-deload session per exercise ID. */
function loadContext_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const lastSession = {};
  const log = ss.getSheetByName(SHEET.log);
  if (log.getLastRow() > 1) {
    log.getRange(2, 1, log.getLastRow() - 1, LOG_HEADER.length).getValues().forEach(function (r) {
      const date = r[LOG.date], id = r[LOG.exerciseId], kg = r[LOG.kg], reps = r[LOG.reps];
      if (!(date instanceof Date) || !id || r[LOG.deload] === true) return;
      if (typeof kg !== 'number' || typeof reps !== 'number') return;
      const key = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
      const set = { no: r[LOG.set], kg: kg, reps: reps };
      const s = lastSession[id];
      if (!s || key > s.key) lastSession[id] = { key: key, date: date, sets: [set] };
      else if (key === s.key) s.sets.push(set);
    });
  }
  return { exercises: loadExercises_(ss), lastSession: lastSession, tz: tz };
}

function refreshAllInfo_(ss) {
  const ctx = loadContext_(ss);
  daySheets_(ss).forEach(function (day) {
    const sheet = ss.getSheetByName(day);
    if (sheet) refreshInfo_(sheet, ctx);
  });
}

/** Writes the info rows of one input sheet; only changed cells are written. */
function refreshInfo_(sheet, ctx) {
  const values = sheet.getRange(FIRST_ROW, 1, SLOT_COUNT * ROWS_PER_SLOT, 1).getValues();
  const isDeload = sheet.getRange(CELL.deload).getValue() === true;
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const base = slot * ROWS_PER_SLOT;
    const exName = String(values[base][0] || '');
    const text = exName && exName !== NO_EXERCISE ? buildInfoText_(exName, ctx, isDeload) : '';
    if (text !== values[base + 2][0]) sheet.getRange(FIRST_ROW + base + 2, 1).setValue(text);
  }
}

/** Progression rules, first match wins (requirements spec section 9). */
function buildInfoText_(exName, ctx, isDeload) {
  const ex = ctx.exercises[exName];
  if (!ex) return 'nicht im Übungsstamm';
  const session = ctx.lastSession[ex.id];
  if (!session) return 'neu · ' + ex.repsMin + '–' + ex.repsMax + ' Wdh';            // rule 1

  const sets = session.sets.slice().sort(function (a, b) { return a.no - b.no; });
  const kg = sets[0].kg;
  const reps = sets.map(function (s) { return s.reps; });
  const firstSet = reps[0];
  const bestE1rm = Math.max.apply(null, reps.map(function (r) { return kg * (1 + r / 30); }));
  const last = 'zuletzt ' + Utilities.formatDate(session.date, ctx.tz, 'd.M.') + ' ' +
    formatNumber_(kg) + ' × ' + reps.join('/');

  let target;
  if (isDeload) {
    target = 'Deload ' + formatNumber_(kg) + ' kg · ' + Math.ceil(sets.length / 2) + ' Sätze';
  } else if (ex.type === VALUE.warmUp) {
    return last;
  } else if (firstSet >= ex.repsMax && Math.min.apply(null, reps) >= ex.repsMin) {   // rule 2
    target = '↑ ' + formatNumber_(kg + ex.increment) + ' kg · ' + ex.repsMin + '+';
  } else if (firstSet < ex.repsMin - DECREASE_TOLERANCE && ex.increment > 0 &&
             !(ex.weightType === VALUE.addedWeight && kg === 0)) {                  // rule 3
    const lower = Math.floor(bestE1rm / (1 + ex.repsMin / 30) / ex.increment + 1e-9) * ex.increment;
    target = '↓ ' + formatNumber_(Math.max(ex.increment, lower)) + ' kg · ' + ex.repsMin + '+';
  } else {                                                                            // rule 4
    target = '= ' + formatNumber_(kg) + ' kg · ' + Math.min(firstSet + 1, ex.repsMax) + '+';
  }
  return last + ' · Ziel ' + target;
}

/** 26.25 -> "26,25" */
function formatNumber_(x) {
  return String(Math.round(x * 1000) / 1000).replace('.', ',');
}
