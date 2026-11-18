/**
 * Training tracker – runtime script (requirements spec sections 5, 6, 9).
 *
 * onEdit handles all interaction on the input sheets:
 * - ticking "Speichern" saves the training to the log,
 * - changing or removing an exercise compacts the slots and refreshes the info rows,
 * - choosing a position in column F moves the exercise there (inputs move with it),
 * - toggling "Deload" refreshes the info rows,
 * - editing "Übungen" refreshes the dropdown list, the shown names and the info rows.
 * Day sheets are recognised by their header in row 4; the tab name is the day name.
 * Every slot keeps the exercise ID in hidden column G, so renaming an exercise is safe.
 * Muscle groups are named once, in sheet "Muskelgruppen" (hidden ID in column D); "Übungen" picks them
 * from a dropdown and follows a renamed group (see syncMuscleGroups_).
 * Info rows are computed here and written as plain text (no sheet formulas),
 * so nothing depends on the spreadsheet locale.
 *
 * Convention: identifiers and comments in English, everything the user reads in German.
 */

// ===== Configuration (shared with Setup.gs and Api.gs) =======================
const SHEET = { exercises: 'Übungen', log: 'Log', body: 'Körper', help: 'Hilfe', lists: '_lists', settings: 'Einstellungen',
  muscleGroups: 'Muskelgruppen' };

// Each slot uses three rows: exercise name + position, inputs, info.
const FIRST_ROW = 5;
const SLOT_COUNT = 10;
const ROWS_PER_SLOT = 3;
const INPUT_COLS = 6;       // input row: A kg, B–E sets 1–4, F failure
const ID_COL = 7;           // hidden column G, name row: ID of the exercise (the name in A is only shown)
const DAY_HEADER = ['kg', 'S1', 'S2', 'S3', 'S4', '✗'];   // row 4 of every day sheet
const CELL = { date: 'A1', note: 'A2', status: 'A3', deload: 'F1', save: 'F2' };
const NO_EXERCISE = '– keine –';   // dropdown entry that empties a slot
const POSITION_COL = 6;            // name row, column F: position of the exercise in the day

// column index (0-based) in sheet "Übungen" and "Log"
const EX = { id: 0, name: 1, muscleGroup: 2, type: 3, repsMin: 4, repsMax: 5, increment: 6, weightType: 7, active: 8 };
const LOG = { date: 0, day: 1, exerciseId: 2, exercise: 3, muscleGroup: 4, set: 5, kg: 6, reps: 7, failure: 8, deload: 9, savedAt: 10, note: 11, test: 12 };
const EX_HEADER = ['ID', 'Übung', 'Muskelgruppe', 'Typ', 'Wdh-Min', 'Wdh-Max', 'Gewichtssprung (kg)', 'Gewichtsart', 'Aktiv'];
const LOG_HEADER = ['Datum', 'Tag', 'Übungs-ID', 'Übung', 'Muskelgruppe', 'Satz', 'kg', 'Wdh', 'Versagen', 'Deload', 'Gespeichert am', 'Notiz',
  '1RM-Test'];   // 1RM-Test (since 1.7.0): 1 = a real one-rep max attempt, kept out of all progression
// sheet "Muskelgruppen" (since 1.7.0): name, weekly set target, hidden ID
const MG = { name: 0, setsMin: 1, setsMax: 2, id: 3 };
const MG_HEADER = ['Muskelgruppe', 'Sätze/Woche Min', 'Sätze/Woche Max', 'ID'];
const MUSCLE_GROUP_NAMES_PROPERTY = 'MUSCLE_GROUP_NAMES';   // { group ID: name at the last check }
const VALUE = { active: 'ja', warmUp: 'Aufwärmen', addedWeight: 'Zusatzgewicht' };
const DECREASE_TOLERANCE = 2;   // rule 3 only if set 1 is more than this below reps min

// script properties for following tab renames (see syncDayNames_)
const DAY_NAMES_PROPERTY = 'DAY_NAMES';       // { sheetId: tab name at the last check }
const DAY_ALIASES_PROPERTY = 'DAY_ALIASES';   // { former tab name: sheetId }

function nameRow_(slot) { return FIRST_ROW + slot * ROWS_PER_SLOT; }

// ===== Training days: the tab name is the only place a day is named ===========
/** Day sheets in tab order: every sheet with the input header in row 4. */
function daySheets_(ss) {
  const systemSheets = Object.keys(SHEET).map(function (key) { return SHEET[key]; });
  return ss.getSheets().filter(function (sheet) {
    return systemSheets.indexOf(sheet.getName()) < 0 && isDaySheet_(sheet);   // skip the known non-day sheets cheaply
  });
}

function isDaySheet_(sheet) {
  if (sheet.getMaxRows() < 4 || sheet.getMaxColumns() < INPUT_COLS) return false;
  const header = sheet.getRange(4, 1, 1, INPUT_COLS).getValues()[0];
  return DAY_HEADER.every(function (value, i) { return header[i] === value; });
}

/** Day sheet by its current tab name, or by a former name if the tab was renamed meanwhile. */
function findDaySheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (sheet && isDaySheet_(sheet)) return sheet;
  const aliases = readJsonProperty_(DAY_ALIASES_PROPERTY);
  if (!aliases[name]) return null;
  const renamed = ss.getSheets().filter(function (s) { return String(s.getSheetId()) === aliases[name]; })[0];
  return renamed && isDaySheet_(renamed) ? renamed : null;
}

/**
 * Follows renamed tabs: the sheet ID stays the same when a tab is renamed, so a changed
 * name since the last check means the day was renamed. The day name in the log is then
 * replaced (all renames in one pass, so swapping two names works). Returns changed log rows.
 * Call while holding the document lock.
 */
function syncDayNames_(ss, days) {
  const known = readJsonProperty_(DAY_NAMES_PROPERTY);
  const aliases = readJsonProperty_(DAY_ALIASES_PROPERTY);
  const current = {};
  const renamed = {};                          // old name -> new name
  (days || daySheets_(ss)).forEach(function (sheet) {
    const id = String(sheet.getSheetId());
    const name = sheet.getName();
    current[id] = name;
    if (known[id] && known[id] !== name) {
      renamed[known[id]] = name;
      aliases[known[id]] = id;
    }
  });

  let changedRows = 0;
  const log = ss.getSheetByName(SHEET.log);
  if (Object.keys(renamed).length && log.getLastRow() > 1) {
    const range = log.getRange(2, LOG.day + 1, log.getLastRow() - 1, 1);
    const values = range.getValues();
    values.forEach(function (row) {
      const newName = renamed[String(row[0])];
      if (newName !== undefined) { row[0] = newName; changedRows++; }
    });
    if (changedRows) range.setValues(values);
  }

  // an alias is dropped when its sheet is gone or a tab carries that name again
  const names = Object.keys(current).map(function (id) { return current[id]; });
  Object.keys(aliases).forEach(function (old) {
    if (!(aliases[old] in current) || names.indexOf(old) >= 0) delete aliases[old];
  });
  writeJsonProperty_(DAY_NAMES_PROPERTY, current);
  writeJsonProperty_(DAY_ALIASES_PROPERTY, aliases);
  return changedRows;
}

/** true if a day sheet was added, renamed or removed since the last syncDayNames_ (cheap, no lock). */
function dayNamesChanged_(days) {
  const current = {};
  days.forEach(function (sheet) { current[String(sheet.getSheetId())] = sheet.getName(); });
  return PropertiesService.getScriptProperties().getProperty(DAY_NAMES_PROPERTY) !== JSON.stringify(current);
}

function readJsonProperty_(name) {
  const text = PropertiesService.getScriptProperties().getProperty(name);
  return text ? JSON.parse(text) : {};
}

/** Writes only if the value changed (property writes are rate limited). */
function writeJsonProperty_(name, value) {
  const properties = PropertiesService.getScriptProperties();
  const text = JSON.stringify(value);
  if (properties.getProperty(name) !== text) properties.setProperty(name, text);
}

// ===== Trigger ================================================================
/** Simple trigger: runs on every edit, also in the Google Sheets mobile app. */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const name = sheet.getName();
  const ss = sheet.getParent();

  if (name === SHEET.exercises) { refreshExerciseList_(ss); refreshAllInfo_(ss); return; }   // also renames
  if (name === SHEET.muscleGroups) {                     // renamed group: exercises follow
    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(10000)) return;
    try {
      if (syncMuscleGroups_(ss)) refreshExerciseList_(ss);
    } finally {
      lock.releaseLock();
    }
    return;
  }
  if (name === SHEET.log) { refreshAllInfo_(ss); return; }
  if (!isDaySheet_(sheet)) return;

  const a1 = range.getA1Notation();
  if (a1 === CELL.save) {
    if (range.getValue() !== true) return;
    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(10000)) {
      showStatus_(sheet, 'Nicht gespeichert: anderer Speichervorgang läuft. Bitte erneut anhaken.');
      return;
    }
    try {
      syncDayNames_(ss);
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
  const ctx = loadContext_(ss);
  if (range.getColumn() === 1) {                        // exercise chosen in the sheet: take its ID
    ensureIdColumn_(sheet);
    const chosen = ctx.idByName[String(range.getValue() || '')];
    sheet.getRange(range.getRow(), ID_COL).setValue(chosen || '');
    writeSlots_(sheet, readSlots_(sheet, ctx), ctx);
    refreshInfo_(sheet, ctx);
  } else if (range.getColumn() === POSITION_COL) {      // position changed
    moveSlot_(sheet, offset / ROWS_PER_SLOT, Number(range.getValue()), ctx);
    refreshInfo_(sheet, ctx);
  }
}

// ===== Slots: order, compaction and visibility ===============================
/** Adds the hidden ID column G to a day sheet created before it existed. */
function ensureIdColumn_(sheet) {
  if (sheet.getMaxColumns() < ID_COL) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), ID_COL - sheet.getMaxColumns());
    sheet.hideColumns(ID_COL);
  }
}

/** Name rows (A–G) and input rows of all slots; column G is empty if the sheet has none yet. */
function slotValues_(sheet) {
  const columns = Math.min(sheet.getMaxColumns(), ID_COL);
  return sheet.getRange(FIRST_ROW, 1, SLOT_COUNT * ROWS_PER_SLOT, columns).getValues().map(function (row) {
    while (row.length < ID_COL) row.push('');
    return row;
  });
}

/**
 * Used slots in sheet order: exercise ID, shown name and input row (kg, sets, failure).
 * The ID in column G counts; only slots without ID (old sheets) are matched by name.
 */
function readSlots_(sheet, ctx) {
  const values = slotValues_(sheet);
  const used = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const base = slot * ROWS_PER_SLOT;
    const name = String(values[base][0] || '');
    let id = String(values[base][ID_COL - 1] || '');
    if (!id && name && name !== NO_EXERCISE) id = ctx.idByName[name] || '';
    if (!id && (!name || name === NO_EXERCISE)) continue;
    used.push({ id: id, name: name, inputs: values[base + 1].slice(0, INPUT_COLS) });
  }
  return used;
}

/** Moves the exercise in the given slot to a new position (1-based); the others shift. */
function moveSlot_(sheet, fromSlot, toPosition, ctx) {
  const used = readSlots_(sheet, ctx);
  if (fromSlot < used.length && toPosition >= 1 && toPosition <= used.length) {
    const moved = used.splice(fromSlot, 1)[0];
    used.splice(toPosition - 1, 0, moved);
  }
  writeSlots_(sheet, used, ctx);   // also restores the number if the selection was invalid
}

/**
 * Writes the slots in the given order from the top, clears the rest, renumbers
 * the positions and shows only the used slots plus one empty slot for adding.
 * The shown name always comes from sheet "Übungen" via the ID.
 * Name rows are merged across A–E: only column A (name), F (position) and G (ID) are written there.
 */
function writeSlots_(sheet, used, ctx) {
  ensureIdColumn_(sheet);
  const columnA = [];
  const columnF = [];
  const columnG = [];
  const emptyInputs = ['', '', '', '', '', false];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const entry = used[slot];
    const inputs = entry ? entry.inputs.map(function (v, i) { return i === 5 ? v === true : v; }) : emptyInputs;
    const exercise = entry && ctx.exercises[entry.id];
    columnA.push([entry ? (exercise ? exercise.name : entry.name || entry.id) : ''], [inputs[0]], ['']);
    columnF.push([entry ? slot + 1 : ''], [inputs[5]], ['']);       // position, failure, info
    columnG.push([entry ? entry.id : ''], [''], ['']);
    sheet.getRange(nameRow_(slot) + 1, 2, 1, 4).setValues([inputs.slice(1, 5)]);
  }
  sheet.getRange(FIRST_ROW, 1, columnA.length, 1).setValues(columnA);
  sheet.getRange(FIRST_ROW, POSITION_COL, columnF.length, 1).setValues(columnF);
  sheet.getRange(FIRST_ROW, ID_COL, columnG.length, 1).setValues(columnG);
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
    const ctx = loadContext_(ss);
    const now = new Date();
    const rows = [];
    const errors = [];
    let exerciseCount = 0;

    readSlots_(sheet, ctx).forEach(function (slot) {
      const kg = slot.inputs[0];
      const failure = slot.inputs[5] === true;
      const sets = [];
      slot.inputs.slice(1, 5).forEach(function (reps, i) { if (reps !== '') sets.push({ no: i + 1, reps: reps }); });
      if (!sets.length) return;                         // no sets = exercise not done

      const ex = ctx.exercises[slot.id];
      if (!ex) { errors.push((slot.name || slot.id) + ': nicht im Übungsstamm'); return; }
      if (typeof kg !== 'number') { errors.push(ex.name + ': Gewicht fehlt'); return; }
      if (sets.some(function (s) { return typeof s.reps !== 'number'; })) {
        errors.push(ex.name + ': Wiederholungen keine Zahl'); return;
      }
      exerciseCount++;
      sets.forEach(function (s, i) {
        const isLastSet = i === sets.length - 1;
        rows.push([date, day, slot.id, ex.name, ex.muscleGroup, s.no, kg, s.reps,
          failure && isLastSet, isDeload, now, note]);      // column M (1RM-Test) stays empty: tests only from the app
      });
    });

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
    log.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
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
/** Exercises from sheet "Übungen" by ID. */
function loadExercises_(ss) {
  const byId = {};
  ss.getSheetByName(SHEET.exercises).getDataRange().getValues().slice(1).forEach(function (r) {
    if (!r[EX.id] || !r[EX.name]) return;
    byId[String(r[EX.id])] = {
      id: String(r[EX.id]), name: String(r[EX.name]), muscleGroup: r[EX.muscleGroup], type: r[EX.type],
      repsMin: Number(r[EX.repsMin]), repsMax: Number(r[EX.repsMax]),
      increment: Number(r[EX.increment]) || 0, weightType: r[EX.weightType]
    };
  });
  return byId;
}

/**
 * All log rows below the header (one read; callers pass them on instead of reading again).
 * Rows always have LOG_HEADER.length entries, also in a log sheet that has fewer columns.
 */
function readLog_(ss) {
  const log = ss.getSheetByName(SHEET.log);
  if (log.getLastRow() < 2) return [];
  const columns = Math.min(LOG_HEADER.length, log.getMaxColumns());
  return log.getRange(2, 1, log.getLastRow() - 1, columns).getValues().map(function (row) {
    while (row.length < LOG_HEADER.length) row.push('');
    return row;
  });
}

/** true for a 1RM test row (since 1.7.0); also accepts a ticked box or "1" typed by hand. */
function isTestRow_(r) {
  const value = r[LOG.test];
  return value === 1 || value === true || String(value).trim() === '1';
}

/** Adds the header "1RM-Test" to the log if it is missing; never touches logged rows. */
function ensureLogTestColumn_(ss) {
  const log = ss.getSheetByName(SHEET.log);
  const column = LOG.test + 1;
  if (log.getMaxColumns() < column) log.insertColumnsAfter(log.getMaxColumns(), column - log.getMaxColumns());
  const header = String(log.getRange(1, column).getValue() || '');
  if (header === LOG_HEADER[LOG.test]) return;
  if (header !== '') {
    throw new Error('Im Blatt Log steht in Spalte M schon "' + header + '". Bitte die Spalte frei machen und die Einrichtung erneut ausführen.');
  }
  log.getRange(1, column).setValue(LOG_HEADER[LOG.test]).setFontWeight('bold');
}

/** Exercises and last regular session per exercise; logRows optional (read if missing). */
function loadContext_(ss, logRows) {
  const tz = ss.getSpreadsheetTimeZone();
  const lastSession = {};
  (logRows || readLog_(ss)).forEach(function (r) {
    const date = r[LOG.date], id = r[LOG.exerciseId], kg = r[LOG.kg], reps = r[LOG.reps];
    if (!(date instanceof Date) || !id || r[LOG.deload] === true || isTestRow_(r)) return;
    if (typeof kg !== 'number' || typeof reps !== 'number') return;
    const key = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
    const set = { no: r[LOG.set], kg: kg, reps: reps };
    const s = lastSession[id];
    if (!s || key > s.key) lastSession[id] = { key: key, date: date, sets: [set] };
    else if (key === s.key) s.sets.push(set);
  });
  const exercises = loadExercises_(ss);
  const idByName = {};
  Object.keys(exercises).forEach(function (id) { idByName[exercises[id].name] = id; });
  return { exercises: exercises, idByName: idByName, lastSession: lastSession, tz: tz };
}

/** ctx and days are optional; the web API passes what it has already read. */
function refreshAllInfo_(ss, ctx, days) {
  ctx = ctx || loadContext_(ss);
  (days || daySheets_(ss)).forEach(function (sheet) { refreshInfo_(sheet, ctx); });
}

/**
 * Writes the info rows of one input sheet and shows the current name from "Übungen"
 * for every slot (follows renamed exercises); only changed cells are written.
 */
function refreshInfo_(sheet, ctx) {
  const values = slotValues_(sheet);
  const isDeload = sheet.getRange(CELL.deload).getValue() === true;
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const base = slot * ROWS_PER_SLOT;
    const name = String(values[base][0] || '');
    let id = String(values[base][ID_COL - 1] || '');
    if (!id && name && name !== NO_EXERCISE) id = ctx.idByName[name] || '';
    const ex = ctx.exercises[id];
    if (ex && ex.name !== name) sheet.getRange(FIRST_ROW + base, 1).setValue(ex.name);
    const isUsed = id || (name && name !== NO_EXERCISE);
    const text = isUsed ? buildInfoText_(id, ctx, isDeload) : '';
    if (text !== values[base + 2][0]) sheet.getRange(FIRST_ROW + base + 2, 1).setValue(text);
  }
}

/** Progression rules, first match wins (requirements spec section 9). */
function buildInfoText_(id, ctx, isDeload) {
  const ex = ctx.exercises[id];
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

// ===== Muscle groups (since 1.7.0) ===============================================
/** Rows of sheet "Muskelgruppen" below the header: [name, sets min, sets max, ID]. */
function muscleGroupValues_(sheet) {
  const last = sheet.getLastRow();
  return last > 1 ? sheet.getRange(2, 1, last - 1, MG_HEADER.length).getValues() : [];
}

/** Muscle groups for the app and the analysis: [{ name, setsMin, setsMax }] in sheet order. */
function readMuscleGroups_(ss) {
  const sheet = ss.getSheetByName(SHEET.muscleGroups);
  if (!sheet) return [];
  const number = function (value) { return typeof value === 'number' && value >= 0 ? value : null; };
  return muscleGroupValues_(sheet).filter(function (r) { return String(r[MG.name]).trim() !== ''; }).map(function (r) {
    return { name: String(r[MG.name]), setsMin: number(r[MG.setsMin]), setsMax: number(r[MG.setsMax]) };
  });
}

/**
 * Follows renamed muscle groups, like syncDayNames_ for days: every row keeps a hidden ID,
 * so a changed name since the last check means the group was renamed. The column
 * "Muskelgruppe" in "Übungen" is then replaced (all renames in one pass, so swapping works).
 * Rows without ID (new groups) and copied rows with a duplicate ID get a new ID.
 * The log keeps the group as it was saved (append-only); the analysis maps via the exercise ID.
 * Returns the number of changed exercise rows. Call while holding the document lock.
 */
function syncMuscleGroups_(ss) {
  const sheet = ss.getSheetByName(SHEET.muscleGroups);
  if (!sheet) return 0;
  const values = muscleGroupValues_(sheet);
  const known = readJsonProperty_(MUSCLE_GROUP_NAMES_PROPERTY);
  const current = {};
  const renamed = {};                                   // old name -> new name
  let nextNumber = 1;
  values.forEach(function (r) {
    const m = /^M(\d+)$/.exec(String(r[MG.id]));
    if (m) nextNumber = Math.max(nextNumber, Number(m[1]) + 1);
  });
  let idsChanged = false;
  values.forEach(function (r) {
    const name = String(r[MG.name]);
    if (name.trim() === '') return;
    let id = String(r[MG.id] || '');
    if (!id || id in current) {                         // new row, or a copied row with the ID of another group
      id = 'M' + ('0' + nextNumber++).slice(-2);
      r[MG.id] = id;
      idsChanged = true;
    }
    current[id] = name;
    if (known[id] !== undefined && known[id] !== name) renamed[known[id]] = name;
  });
  if (idsChanged) sheet.getRange(2, MG.id + 1, values.length, 1).setValues(values.map(function (r) { return [r[MG.id]]; }));

  let changedRows = 0;
  const exercises = ss.getSheetByName(SHEET.exercises);
  if (Object.keys(renamed).length && exercises.getLastRow() > 1) {
    const range = exercises.getRange(2, EX.muscleGroup + 1, exercises.getLastRow() - 1, 1);
    const groups = range.getValues();
    groups.forEach(function (row) {
      const newName = renamed[String(row[0])];
      if (newName !== undefined) { row[0] = newName; changedRows++; }
    });
    if (changedRows) range.setValues(groups);
  }
  writeJsonProperty_(MUSCLE_GROUP_NAMES_PROPERTY, current);
  return changedRows;
}

/**
 * Creates sheet "Muskelgruppen" if needed and adds every group that is used in "Übungen"
 * but not listed yet (targets stay empty for the user to fill in). Never removes a row.
 * Returns the added names and groups of spellings that differ only in case or spaces.
 */
function ensureMuscleGroups_(ss) {
  let sheet = ss.getSheetByName(SHEET.muscleGroups);
  if (!sheet) sheet = ss.insertSheet(SHEET.muscleGroups);
  if (sheet.getRange(1, 1).getValue() !== MG_HEADER[0]) {
    sheet.getRange(1, 1, 1, MG_HEADER.length).setValues([MG_HEADER]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    [180, 130, 130, 60].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
    sheet.hideColumns(MG.id + 1);
  }
  syncMuscleGroups_(ss);                                // IDs for rows typed in by hand
  const listed = muscleGroupValues_(sheet).map(function (r) { return String(r[MG.name]); })
    .filter(function (name) { return name.trim() !== ''; });
  const used = [];
  ss.getSheetByName(SHEET.exercises).getDataRange().getValues().slice(1).forEach(function (r) {
    const group = String(r[EX.muscleGroup]);
    if (r[EX.id] && group.trim() !== '' && used.indexOf(group) < 0) used.push(group);
  });
  const added = used.filter(function (group) { return listed.indexOf(group) < 0; })
    .sort(function (a, b) { return a.localeCompare(b, 'de'); });
  if (added.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, added.length, 1).setValues(added.map(function (name) { return [name]; }));
    syncMuscleGroups_(ss);
  }
  const byKey = {};
  listed.concat(added).forEach(function (name) {
    const key = name.trim().replace(/\s+/g, ' ').toLowerCase();
    (byKey[key] || (byKey[key] = [])).push(name);
  });
  const variants = Object.keys(byKey).filter(function (key) { return byKey[key].length > 1; })
    .map(function (key) { return byKey[key]; });
  return { added: added, variants: variants };
}

/** Dropdown in column "Muskelgruppe" of "Übungen": only names from sheet "Muskelgruppen". */
function applyMuscleGroupDropdown_(ss) {
  const groups = ss.getSheetByName(SHEET.muscleGroups);
  const exercises = ss.getSheetByName(SHEET.exercises);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(groups.getRange(2, 1, groups.getMaxRows() - 1, 1), true)
    .setAllowInvalid(false)
    .setHelpText('Muskelgruppe aus dem Blatt „Muskelgruppen“ wählen. Neue Gruppen dort anlegen.')
    .build();
  exercises.getRange(2, EX.muscleGroup + 1, exercises.getMaxRows() - 1, 1).setDataValidation(rule);
}
