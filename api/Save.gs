/**
 * Training tracker – sheet layout, day sheets and shared helpers (requirements spec sections 5, 6, 9).
 *
 * Since 1.8.0 trainings are saved only from the app; the day sheets are the training plan:
 *   A1 "Trainingstag" marks a day sheet (the tab name is the day name),
 *   B2/B3 weekday and optional second weekday (dropdowns),
 *   from row 6: exercise (dropdown) in A, number of sets 1–5 in B, hidden exercise ID in C.
 * The ID in column C makes renaming an exercise safe; the shown name follows sheet "Übungen".
 * Muscle groups are named once, in sheet "Muskelgruppen" (hidden ID in column D); "Übungen" picks them
 * from a dropdown and follows a renamed group (see syncMuscleGroups_).
 *
 * Convention: identifiers and comments in English, everything the user reads in German.
 */

// ===== Configuration (shared with Setup.gs and Api.gs) =======================
const SHEET = { exercises: 'Übungen', log: 'Log', body: 'Körper', help: 'Hilfe', lists: '_lists', settings: 'Einstellungen',
  muscleGroups: 'Muskelgruppen' };

// day sheet (since 1.8.0)
const DAY_MARKER = 'Trainingstag';                 // A1 of every day sheet
const DAY_ROW = { weekday: 2, weekday2: 3, header: 5, firstSlot: 6 };
const DAY_COL = { name: 1, sets: 2, superset: 3, id: 4 };   // slot rows: exercise, sets, superset with the next one (since 1.10.0), hidden ID
const DAY_HEADER = ['Übung', 'Sätze', 'Supersatz', 'ID'];
const SLOT_COUNT = 15;
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];   // ISO order, Monday = 1
const SET_LIMITS = { min: 1, max: 5, default: 4 };
const MAX_DROPS = 3;                                    // drop sets after the last set (since 1.10.0)
const NO_EXERCISE = '– keine –';   // dropdown entry that empties a slot

// day sheet before 1.8.0 (sheet input): only read once to convert it
const OLD_DAY = { header: ['kg', 'S1', 'S2', 'S3', 'S4', '✗'], headerRow: 4, firstRow: 5, slots: 10, rowsPerSlot: 3, idCol: 7 };

// column index (0-based) in sheet "Übungen" and "Log"
const EX = { id: 0, name: 1, muscleGroup: 2, type: 3, repsMin: 4, repsMax: 5, increment: 6, weightType: 7, active: 8 };
const LOG = { date: 0, day: 1, exerciseId: 2, exercise: 3, muscleGroup: 4, set: 5, kg: 6, reps: 7, failure: 8, deload: 9, savedAt: 10,
  note: 11, test: 12, limited: 13, drop: 14 };
const EX_HEADER = ['ID', 'Übung', 'Muskelgruppe', 'Typ', 'Wdh-Min', 'Wdh-Max', 'Gewichtssprung (kg)', 'Gewichtsart', 'Aktiv'];
// 1RM-Test (since 1.7.0): 1 = a real one-rep max attempt, kept out of all progression
// Eingeschränkt (since 1.8.0): reason or "ja" = done with pain or stopped early, kept out of the progression
// Drop (since 1.10.0): 1, 2, 3 = drop set after the last set ("Satz" = number of that set); empty = normal set
const LOG_HEADER = ['Datum', 'Tag', 'Übungs-ID', 'Übung', 'Muskelgruppe', 'Satz', 'kg', 'Wdh', 'Versagen', 'Deload', 'Gespeichert am', 'Notiz',
  '1RM-Test', 'Eingeschränkt', 'Drop'];
// sheet "Muskelgruppen" (since 1.7.0): name, weekly set target, hidden ID
const MG = { name: 0, setsMin: 1, setsMax: 2, id: 3 };
const MG_HEADER = ['Muskelgruppe', 'Sätze/Woche Min', 'Sätze/Woche Max', 'ID'];
const MUSCLE_GROUP_NAMES_PROPERTY = 'MUSCLE_GROUP_NAMES';   // { group ID: name at the last check }
const VALUE = { active: 'ja', warmUp: 'Aufwärmen', addedWeight: 'Zusatzgewicht', yes: 'ja' };

// script properties for following tab renames (see syncDayNames_)
const DAY_NAMES_PROPERTY = 'DAY_NAMES';       // { sheetId: tab name at the last check }
const DAY_ALIASES_PROPERTY = 'DAY_ALIASES';   // { former tab name: sheetId }

// ===== Training days: the tab name is the only place a day is named ===========
/** Day sheets in tab order: every sheet with "Trainingstag" in A1. */
function daySheets_(ss) {
  const systemSheets = Object.keys(SHEET).map(function (key) { return SHEET[key]; });
  return ss.getSheets().filter(function (sheet) {
    return systemSheets.indexOf(sheet.getName()) < 0 && isDaySheet_(sheet);   // skip the known non-day sheets cheaply
  });
}

function isDaySheet_(sheet) {
  return String(sheet.getRange(1, 1).getValue()).trim() === DAY_MARKER;
}

/** Day sheet from before 1.8.0: the input header in row 4. */
function isOldDaySheet_(sheet) {
  if (sheet.getMaxColumns() < OLD_DAY.header.length) return false;
  const header = sheet.getRange(OLD_DAY.headerRow, 1, 1, OLD_DAY.header.length).getValues()[0];
  return OLD_DAY.header.every(function (value, i) { return header[i] === value; });
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
/** Simple trigger: keeps IDs and shown names in sync while the plan is edited in the sheet. */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const name = sheet.getName();
  const ss = sheet.getParent();

  if (name === SHEET.exercises) {                        // renamed exercise: day sheets show the new name
    refreshExerciseList_(ss);
    const ctx = loadContext_(ss);
    daySheets_(ss).forEach(function (day) { writeDaySlots_(day, readDaySlots_(day, ctx), ctx); });
    return;
  }
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
  if (!isDaySheet_(sheet) || !hasSupersetColumn_(sheet)) return;   // old layout: setupApi converts it first
  const lastSlotRow = DAY_ROW.firstSlot + SLOT_COUNT - 1;
  if (range.getLastRow() < DAY_ROW.firstSlot || range.getRow() > lastSlotRow || range.getColumn() > DAY_COL.superset) return;
  // exercise chosen, removed or moved by hand: take the IDs from the names, compact the list
  const ctx = loadContext_(ss);
  const values = sheet.getRange(DAY_ROW.firstSlot, 1, SLOT_COUNT, DAY_COL.id).getValues();
  const firstEdited = Math.max(range.getRow(), DAY_ROW.firstSlot) - DAY_ROW.firstSlot;
  const lastEdited = Math.min(range.getLastRow(), lastSlotRow) - DAY_ROW.firstSlot;
  for (let i = firstEdited; i <= lastEdited; i++) {
    const shown = String(values[i][DAY_COL.name - 1] || '');
    values[i][DAY_COL.id - 1] = shown && shown !== NO_EXERCISE ? ctx.idByName[shown] || '' : '';
  }
  sheet.getRange(DAY_ROW.firstSlot, DAY_COL.id, SLOT_COUNT, 1).setValues(values.map(function (r) { return [r[DAY_COL.id - 1]]; }));
  writeDaySlots_(sheet, readDaySlots_(sheet, ctx), ctx);
}

// ===== Day sheet: weekdays and slots ==========================================
/** Number of sets of a slot: 1–5, anything else the default. */
function setCount_(value) {
  const n = Number(value);
  return n >= SET_LIMITS.min && n <= SET_LIMITS.max && Math.floor(n) === n ? n : SET_LIMITS.default;
}

/** Weekdays chosen in B2/B3 as ISO numbers (Monday = 1), without duplicates, in the order given. */
function readWeekdays_(sheet) {
  const values = sheet.getRange(DAY_ROW.weekday, 2, 2, 1).getValues();
  const result = [];
  values.forEach(function (row) {
    const index = WEEKDAYS.indexOf(String(row[0]).trim());
    if (index >= 0 && result.indexOf(index + 1) < 0) result.push(index + 1);
  });
  return result;
}

/**
 * Used slots in sheet order: { id, name, sets, superset }. The hidden ID counts; a slot without
 * ID (typed by hand) is matched by its name. Empty slots and unknown names are skipped.
 * superset (since 1.10.0): this exercise and the next one form a superset; never true on the last slot.
 * Reads sheets from before 1.10.0 (ID in column C, no superset column) too, until setupApi converts them.
 */
function readDaySlots_(sheet, ctx) {
  const current = hasSupersetColumn_(sheet);
  const idColumn = current ? DAY_COL.id : 3;
  const values = sheet.getRange(DAY_ROW.firstSlot, 1, SLOT_COUNT, idColumn).getValues();
  const used = [];
  values.forEach(function (row) {
    const name = String(row[DAY_COL.name - 1] || '');
    let id = String(row[idColumn - 1] || '');
    if (!id && name && name !== NO_EXERCISE) id = ctx.idByName[name] || '';
    if (!id) return;
    used.push({ id: id, name: name, sets: setCount_(row[DAY_COL.sets - 1]), superset: current && row[DAY_COL.superset - 1] === true });
  });
  if (used.length) used[used.length - 1].superset = false;
  return used;
}

/** true if the day sheet has the superset column (layout since 1.10.0). */
function hasSupersetColumn_(sheet) {
  return sheet.getMaxColumns() >= DAY_COL.id && String(sheet.getRange(DAY_ROW.header, DAY_COL.superset).getValue()) === DAY_HEADER[2];
}

/** Writes the slots from the top and clears the rest; the shown name always comes from "Übungen" via the ID. */
function writeDaySlots_(sheet, used, ctx) {
  const rows = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slot = used[i];
    const exercise = slot && ctx.exercises[slot.id];
    const shown = exercise ? exercise.name : slot && (slot.name || slot.id);
    rows.push(slot ? [shown, slot.sets, i < used.length - 1 && slot.superset === true, slot.id] : ['', '', false, '']);
  }
  if (!hasSupersetColumn_(sheet)) {                       // layout before 1.10.0 (until setupApi): exercise, sets, ID
    const oldRange = sheet.getRange(DAY_ROW.firstSlot, 1, SLOT_COUNT, 3);
    const oldRows = rows.map(function (r) { return [r[0], r[1], r[3]]; });
    if (JSON.stringify(oldRange.getValues()) !== JSON.stringify(oldRows)) oldRange.setValues(oldRows);
    return;
  }
  const range = sheet.getRange(DAY_ROW.firstSlot, 1, SLOT_COUNT, DAY_COL.id);
  if (JSON.stringify(range.getValues()) !== JSON.stringify(rows)) range.setValues(rows);
}

/** Slots of a day sheet from before 1.8.0 (exercise ID in hidden column G, name in A). */
function readOldDaySlots_(sheet, ctx) {
  const columns = Math.min(sheet.getMaxColumns(), OLD_DAY.idCol);
  const values = sheet.getRange(OLD_DAY.firstRow, 1, OLD_DAY.slots * OLD_DAY.rowsPerSlot, columns).getValues();
  const used = [];
  for (let slot = 0; slot < OLD_DAY.slots; slot++) {
    const row = values[slot * OLD_DAY.rowsPerSlot];
    const name = String(row[0] || '');
    let id = columns >= OLD_DAY.idCol ? String(row[OLD_DAY.idCol - 1] || '') : '';
    if (!id && name && name !== NO_EXERCISE) id = ctx.idByName[name] || '';
    if (id) used.push({ id: id, name: name, sets: SET_LIMITS.default, superset: false });
  }
  return used;
}

/**
 * Builds the day sheet layout (since 1.8.0) on a sheet, keeping the given weekdays and slots.
 * Clears everything else on the sheet first (old input rows, merges, protections, validations).
 */
function buildDaySheet_(ss, sheet, slots, weekdays, ctx) {
  const maxRows = sheet.getMaxRows();
  const maxColumns = sheet.getMaxColumns();
  const all = sheet.getRange(1, 1, maxRows, maxColumns);
  all.breakApart();
  all.clearDataValidations();
  sheet.clear();
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
  sheet.showRows(1, maxRows);
  sheet.showColumns(1, maxColumns);
  sheet.setRowHeights(1, maxRows, 24);
  if (maxColumns > DAY_COL.id) sheet.deleteColumns(DAY_COL.id + 1, maxColumns - DAY_COL.id);
  if (maxColumns < DAY_COL.id) sheet.insertColumnsAfter(maxColumns, DAY_COL.id - maxColumns);   // 1.8/1.9 sheets had 3 columns
  sheet.setHiddenGridlines(false);

  sheet.getRange(1, 1, 1, 2).setValues([[DAY_MARKER, 'Name des Trainings = Name des Reiters']]);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(12);
  sheet.getRange(1, 2).setFontColor('#6b7280').setFontStyle('italic');
  sheet.getRange(DAY_ROW.weekday, 1, 2, 2).setValues([
    ['Wochentag', weekdays[0] ? WEEKDAYS[weekdays[0] - 1] : ''],
    ['2. Wochentag (optional)', weekdays[1] ? WEEKDAYS[weekdays[1] - 1] : ''],
  ]);
  const weekdayRule = SpreadsheetApp.newDataValidation().requireValueInList(WEEKDAYS, true).setAllowInvalid(false).build();
  sheet.getRange(DAY_ROW.weekday, 2, 2, 1).setDataValidation(weekdayRule).setBackground('#fff8e1');

  sheet.getRange(DAY_ROW.header, 1, 1, DAY_COL.id).setValues([DAY_HEADER])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#263238');
  const exerciseRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName(SHEET.lists).getRange('A2:A500'), true).setAllowInvalid(true).build();
  const setOptions = [];
  for (let n = SET_LIMITS.min; n <= SET_LIMITS.max; n++) setOptions.push(String(n));
  const setRule = SpreadsheetApp.newDataValidation().requireValueInList(setOptions, true).setAllowInvalid(false).build();
  sheet.getRange(DAY_ROW.firstSlot, DAY_COL.name, SLOT_COUNT, 1).setDataValidation(exerciseRule).setBackground('#fff8e1');
  sheet.getRange(DAY_ROW.firstSlot, DAY_COL.sets, SLOT_COUNT, 1).setDataValidation(setRule).setBackground('#fff8e1')
    .setHorizontalAlignment('center');
  sheet.getRange(DAY_ROW.firstSlot, DAY_COL.superset, SLOT_COUNT, 1).insertCheckboxes().setHorizontalAlignment('center');
  sheet.getRange(DAY_ROW.header, DAY_COL.superset).setNote('Haken = diese Übung und die nächste bilden einen Supersatz.');
  sheet.setColumnWidth(DAY_COL.name, 340);
  sheet.setColumnWidth(DAY_COL.sets, 170);
  sheet.setColumnWidth(DAY_COL.superset, 110);
  sheet.hideColumns(DAY_COL.id);
  sheet.setFrozenRows(DAY_ROW.header);
  writeDaySlots_(sheet, slots, ctx);
}

/**
 * Brings every day sheet to the current layout (setupApi): sheets from before 1.8.0 keep their
 * exercises and order (4 sets each); sheets from 1.8/1.9 keep weekdays, exercises and sets and get the
 * superset column (1.10.0); a sheet with only "Trainingstag" in A1 gets the full layout.
 * Returns the names of the converted sheets. The log is never touched.
 */
function upgradeDaySheets_(ss) {
  const ctx = loadContext_(ss);
  const systemSheets = Object.keys(SHEET).map(function (key) { return SHEET[key]; });
  const converted = [];
  ss.getSheets().forEach(function (sheet) {
    if (systemSheets.indexOf(sheet.getName()) >= 0) return;
    if (isOldDaySheet_(sheet)) {
      buildDaySheet_(ss, sheet, readOldDaySlots_(sheet, ctx), [], ctx);
      converted.push(sheet.getName());
    } else if (isDaySheet_(sheet) && (String(sheet.getRange(DAY_ROW.header, 1).getValue()) !== 'Übung' || !hasSupersetColumn_(sheet))) {
      buildDaySheet_(ss, sheet, readDaySlots_(sheet, ctx), readWeekdays_(sheet), ctx);
      converted.push(sheet.getName());
    }
  });
  return converted;
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

/** Exercises from sheet "Übungen" by ID, and IDs by name. */
function loadContext_(ss) {
  const exercises = {};
  const idByName = {};
  ss.getSheetByName(SHEET.exercises).getDataRange().getValues().slice(1).forEach(function (r) {
    if (!r[EX.id] || !r[EX.name]) return;
    const id = String(r[EX.id]);
    exercises[id] = { id: id, name: String(r[EX.name]) };
    idByName[String(r[EX.name])] = id;
  });
  return { exercises: exercises, idByName: idByName };
}

// ===== Log ====================================================================
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

/** true for a row marked "Eingeschränkt" (since 1.8.0): any text, or a ticked box. */
function isLimitedRow_(r) {
  const value = r[LOG.limited];
  return value === true || (typeof value === 'string' && value.trim() !== '');
}

/** true for a drop set row (since 1.10.0): only weight volume, never progression, records or set counts. */
function isDropRow_(r) {
  return Number(r[LOG.drop]) > 0;
}

/** Reason of a limited row, '' if none was given. */
function limitedReason_(r) {
  const value = String(r[LOG.limited] === true ? '' : r[LOG.limited] || '').trim();
  return value === VALUE.yes ? '' : value;
}

/** Adds the headers "1RM-Test", "Eingeschränkt" and "Drop" to the log if missing; never touches logged rows. */
function ensureLogColumns_(ss) {
  const log = ss.getSheetByName(SHEET.log);
  if (log.getMaxColumns() < LOG_HEADER.length) log.insertColumnsAfter(log.getMaxColumns(), LOG_HEADER.length - log.getMaxColumns());
  [LOG.test, LOG.limited, LOG.drop].forEach(function (index) {
    const header = String(log.getRange(1, index + 1).getValue() || '');
    if (header === LOG_HEADER[index]) return;
    if (header !== '') {
      const column = String.fromCharCode(65 + index);
      throw new Error('Im Blatt Log steht in Spalte ' + column + ' schon "' + header + '". Bitte die Spalte frei machen und die Einrichtung erneut ausführen.');
    }
    log.getRange(1, index + 1).setValue(LOG_HEADER[index]).setFontWeight('bold');
  });
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
