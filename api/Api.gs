/**
 * Training tracker – web API (requirements spec "Trainings-App", section 5).
 *
 * Added as a separate script file next to Save.gs and Setup.gs in the user's own sheet.
 * It reuses the sheet layout constants and slot helpers from Save.gs.
 * The API only checks the key, reads and writes data and reports its version;
 * all calculations (target, records, plates, warm-up) live in the app.
 *
 * Requests: HTTPS POST, body = JSON sent as text/plain (avoids a CORS preflight):
 *   { "key": "...", "action": "getState", "payload": { ... } }
 * Responses: { "ok": true, "data": ... } or { "ok": false, "error": "<code>" },
 * each with "ms" = time spent in the script (shown in the app to check load times).
 * Error codes are English; the app shows German messages.
 */

const API_VERSION = '1.4.0';
const APP_URL = 'https://stadler-tom.github.io/trainings-tracker/';
const KEY_PROPERTY = 'API_KEY';
const RECENT_DATES = 4;                 // trainings per day sent for the "today" hint
const CLIENT_IDS_PROPERTY = 'SAVED_CLIENT_IDS';
const WEB_APP_URL_PROPERTY = 'WEB_APP_URL';
const CLIENT_IDS_KEPT = 200;
const EXTRA_EXERCISE_COLUMNS = { note: 'Gerätenotiz', barWeight: 'Stangengewicht kg' };

// ===== Entry points ===========================================================
function doPost(e) {
  const started = Date.now();
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, error: 'invalid_json' }, started);
  }
  return reply_(handle_(request.action, request.key, request.payload || {}), started);
}

/** GET only answers "ping", so the connection can be tested in a browser: ...?action=ping&key=... */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action !== 'ping') return reply_({ ok: false, error: 'use_post' });
  return reply_(handle_('ping', params.key, {}));
}

function handle_(action, key, payload) {
  if (!isValidKey_(key)) return { ok: false, error: 'invalid_key' };
  try {
    switch (action) {
      case 'ping': return { ok: true, data: ping_() };
      case 'getState': return { ok: true, data: getState_() };
      case 'saveTraining': return withLock_(function () { return saveTrainingFromApp_(payload); });
      case 'updateDaySlots': return withLock_(function () { return updateDaySlots_(payload); });
      case 'updateExerciseNote': return withLock_(function () { return updateExerciseNote_(payload); });
      default: return { ok: false, error: 'unknown_action' };
    }
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'server_error', detail: String(err && err.message || err) };
  }
}

/**
 * Run once from the Apps Script editor (requirements spec section 7.2).
 * Safe to run again at any time; it only adds what is missing: the key, the two extra
 * exercise columns and the hidden ID column on day sheets from before version 1.2.
 * Existing data is never changed.
 */
function setupApi() {
  const ss = SpreadsheetApp.getActive();
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(KEY_PROPERTY)) {
    properties.setProperty(KEY_PROPERTY, Utilities.getUuid().replace(/-/g, ''));
  }
  ensureExerciseColumns_(ss);
  refreshExerciseList_(ss);
  const ctx = loadContext_(ss);
  const days = daySheets_(ss);
  days.forEach(function (sheet) { fillSlotIds_(sheet, ctx); });
  withLock_(function () { return syncDayNames_(ss); });
  const names = days.map(function (sheet) { return sheet.getName(); });
  Logger.log('Setup done. Day sheets: ' + (names.length ? names.join(', ') : 'none'));
  SpreadsheetApp.getUi().alert('Einrichtung', 'Fertig. ' +
    (names.length ? 'Trainingstage: ' + names.join(', ') + '. '
      : 'Es gibt noch kein Tagesblatt: ein Tagesblatt duplizieren oder die Vorlage neu kopieren. ') +
    'Nächster Schritt laut Anleitung: Bereitstellen → Neue Bereitstellung → Web-App.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Writes the exercise ID next to every slot that has none yet (day sheets from before version 1.2). */
function fillSlotIds_(sheet, ctx) {
  ensureIdColumn_(sheet);
  const values = slotValues_(sheet);
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const row = values[slot * ROWS_PER_SLOT];
    const name = String(row[0] || '');
    const id = ctx.idByName[name];
    if (!row[ID_COL - 1] && id) sheet.getRange(nameRow_(slot), ID_COL).setValue(id);
  }
}

/**
 * Run from the editor after deploying as a web app. Asks once for the web app URL
 * (ends with /exec; the editor itself only knows the /dev test URL), stores it and
 * shows the setup link to paste into the app (Einstellungen → Einrichtungslink).
 */
function showSetupLink() {
  const properties = PropertiesService.getScriptProperties();
  const key = properties.getProperty(KEY_PROPERTY);
  if (!key) throw new Error('No API key yet: run setupApi first.');
  const ui = SpreadsheetApp.getUi();
  let url = properties.getProperty(WEB_APP_URL_PROPERTY) || '';
  if (!isWebAppUrl_(url)) {
    const answer = ui.prompt('Web-App-Adresse',
      'Bitte die Web-App-URL aus "Bereitstellen → Bereitstellungen verwalten" einfügen (endet auf /exec):',
      ui.ButtonSet.OK_CANCEL);
    if (answer.getSelectedButton() !== ui.Button.OK) return;
    url = answer.getResponseText().trim();
    if (!isWebAppUrl_(url)) {
      ui.alert('Das ist keine gültige Web-App-Adresse. Sie beginnt mit https://script.google.com/ und endet auf /exec.');
      return;
    }
    properties.setProperty(WEB_APP_URL_PROPERTY, url);
  }
  const link = APP_URL + '#api=' + encodeURIComponent(url) + '&key=' + key;
  Logger.log(link);
  ui.alert('Einrichtungslink', 'Diesen Link aufs Handy schicken und in der App unter Einstellungen einfügen. ' +
    'Er enthält deinen Schlüssel, bitte nicht weitergeben.\n\n' + link, ui.ButtonSet.OK);
}

function isWebAppUrl_(url) {
  return /^https:\/\/script\.google\.com\/.+\/exec$/.test(url);
}

// ===== Actions =================================================================
function ping_() {
  return { apiVersion: API_VERSION, sheetName: SpreadsheetApp.getActive().getName() };
}

/** Everything the app needs for a training (section 5, getState). */
function getState_() {
  const ss = SpreadsheetApp.getActive();
  const days = daySheets_(ss);
  if (dayNamesChanged_(days)) withLock_(function () { return syncDayNames_(ss, days); });   // renamed tabs: log follows first
  return buildState_(ss, days, readExerciseRows_(ss), readLog_(ss));
}

/** State from data already read once in this request (getState and saveTraining share it). */
function buildState_(ss, daySheets, exercises, logRows) {
  const tz = ss.getSpreadsheetTimeZone();
  const idByName = {};
  exercises.forEach(function (ex) { idByName[ex.name] = ex.id; });

  const history = {};          // id -> { lastSession, bestE1rm, bestRepsAtZero }
  const datesByDay = {};       // day -> { 'yyyy-MM-dd': true }
  logRows.forEach(function (r) {
    const date = r[LOG.date], id = r[LOG.exerciseId], kg = r[LOG.kg], reps = r[LOG.reps];
    if (!(date instanceof Date) || !id || typeof kg !== 'number' || typeof reps !== 'number') return;
    const dateKey = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
    const day = String(r[LOG.day] || '');
    if (day) (datesByDay[day] || (datesByDay[day] = {}))[dateKey] = true;
    if (r[LOG.deload] === true) return;

    const h = history[id] || (history[id] = { lastSession: null, bestE1rm: 0, bestRepsAtZero: 0 });
    h.bestE1rm = Math.max(h.bestE1rm, kg * (1 + reps / 30));
    if (kg === 0) h.bestRepsAtZero = Math.max(h.bestRepsAtZero, reps);
    const set = { set: Number(r[LOG.set]), kg: kg, reps: reps, failure: r[LOG.failure] === true };
    if (!h.lastSession || dateKey > h.lastSession.date) h.lastSession = { date: dateKey, sets: [set] };
    else if (dateKey === h.lastSession.date) h.lastSession.sets.push(set);
  });
  Object.keys(history).forEach(function (id) {
    const s = history[id].lastSession;
    if (s) s.sets.sort(function (a, b) { return a.set - b.set; });
  });

  const days = daySheets.map(function (sheet) {
    const name = sheet.getName();
    const ids = readSlots_(sheet, { idByName: idByName }).map(function (slot) { return slot.id; });
    const dates = Object.keys(datesByDay[name] || {}).sort().reverse();
    // recentDates (since 1.3.0): the last trainings of this day, newest first; the app derives the usual weekday
    return { name: name, lastDate: dates[0] || null, recentDates: dates.slice(0, RECENT_DATES), exerciseIds: ids.filter(Boolean) };
  });

  return { apiVersion: API_VERSION, days: days, exercises: exercises, history: history };
}

/**
 * Saves one training from the app (section 4.3). Payload:
 * { clientId, day, date: 'yyyy-MM-dd', deload, note,
 *   exercises: [{ id, kg, reps: [n|null, n|null, n|null, n|null], failure }] }
 */
function saveTrainingFromApp_(p) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  if (!p.clientId) return { ok: false, error: 'missing_client_id' };
  if (wasClientIdSaved_(p.clientId)) return { ok: true, data: { duplicate: true } };
  const daySheets = daySheets_(ss);
  syncDayNames_(ss, daySheets);
  const daySheet = findDaySheet_(ss, p.day);            // also finds a day renamed since the app loaded
  if (!daySheet) return { ok: false, error: 'unknown_day' };
  const day = daySheet.getName();
  const date = parseIsoDate_(p.date);
  if (!date) return { ok: false, error: 'invalid_date' };

  const exercises = readExerciseRows_(ss);
  const byId = {};
  exercises.forEach(function (ex) { byId[ex.id] = ex; });
  const now = new Date();
  const rows = [];
  for (let i = 0; i < (p.exercises || []).length; i++) {
    const item = p.exercises[i];
    const ex = byId[item.id];
    if (!ex) return { ok: false, error: 'unknown_exercise', detail: String(item.id) };
    const sets = [];
    (item.reps || []).slice(0, 4).forEach(function (reps, index) {
      if (reps !== null && reps !== undefined && reps !== '') sets.push({ no: index + 1, reps: Number(reps) });
    });
    if (!sets.length) continue;                                   // no sets = exercise not done
    if (typeof item.kg !== 'number' || !(item.kg >= 0)) return { ok: false, error: 'missing_weight', detail: ex.name };
    if (sets.some(function (s) { return !(s.reps > 0); })) return { ok: false, error: 'invalid_reps', detail: ex.name };
    sets.forEach(function (s, index) {
      rows.push([date, day, ex.id, ex.name, ex.muscleGroup, s.no, item.kg, s.reps,
        item.failure === true && index === sets.length - 1, p.deload === true, now, String(p.note || '')]);
    });
  }
  if (!rows.length) return { ok: false, error: 'nothing_to_save' };

  // the log is read once and reused for the duplicate check, the info rows and the new state
  const logRows = readLog_(ss);
  const dateText = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  const exists = logRows.some(function (r) {
    return r[LOG.date] instanceof Date && r[LOG.day] === day && Utilities.formatDate(r[LOG.date], tz, 'yyyy-MM-dd') === dateText;
  });
  if (exists) return { ok: false, error: 'already_saved' };

  const log = ss.getSheetByName(SHEET.log);
  log.getRange(logRows.length + 2, 1, rows.length, LOG_HEADER.length).setValues(rows);
  rememberClientId_(p.clientId);
  const allRows = logRows.concat(rows);
  refreshAllInfo_(ss, loadContext_(ss, allRows), daySheets);   // keeps the info rows of the sheet input in sync
  // state (since 1.4.0): the app needs no second request to show the new "zuletzt" and targets
  return { ok: true, data: { savedSets: rows.length, state: buildState_(ss, daySheets, exercises, allRows) } };
}

/** Writes the exercise order of one day sheet (section 4.2). Payload: { day, exerciseIds: [...] } */
function updateDaySlots_(p) {
  const ss = SpreadsheetApp.getActive();
  syncDayNames_(ss);
  const sheet = findDaySheet_(ss, p.day);
  if (!sheet) return { ok: false, error: 'unknown_day' };
  const ids = p.exerciseIds || [];
  if (ids.length > SLOT_COUNT) return { ok: false, error: 'too_many_exercises' };
  const ctx = loadContext_(ss);
  if (ids.some(function (id) { return !ctx.exercises[id]; })) return { ok: false, error: 'unknown_exercise' };

  // keep inputs that were already typed into the sheet for exercises that stay
  const inputsById = {};
  readSlots_(sheet, ctx).forEach(function (slot) { inputsById[slot.id] = slot.inputs; });
  const used = ids.map(function (id) {
    return { id: id, name: ctx.exercises[id].name, inputs: inputsById[id] || ['', '', '', '', '', false] };
  });
  writeSlots_(sheet, used, ctx);
  refreshInfo_(sheet, ctx);
  return { ok: true, data: { exerciseIds: ids } };
}

/** Saves the equipment note of one exercise (section 4.6). Payload: { id, note } */
function updateExerciseNote_(p) {
  const ss = SpreadsheetApp.getActive();
  const columns = ensureExerciseColumns_(ss);
  const sheet = ss.getSheetByName(SHEET.exercises);
  const ids = sheet.getRange(2, EX.id + 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === p.id) {
      sheet.getRange(i + 2, columns.note).setValue(String(p.note || ''));
      return { ok: true, data: { id: p.id } };
    }
  }
  return { ok: false, error: 'unknown_exercise' };
}

// ===== Helpers =================================================================
function readExerciseRows_(ss) {
  const sheet = ss.getSheetByName(SHEET.exercises);
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(String);
  const noteCol = header.indexOf(EXTRA_EXERCISE_COLUMNS.note);
  const barCol = header.indexOf(EXTRA_EXERCISE_COLUMNS.barWeight);
  return values.slice(1).filter(function (r) { return r[EX.id] && r[EX.name]; }).map(function (r) {
    const bar = barCol >= 0 ? r[barCol] : '';
    return {
      id: String(r[EX.id]), name: String(r[EX.name]), muscleGroup: String(r[EX.muscleGroup]),
      type: String(r[EX.type]), repsMin: Number(r[EX.repsMin]) || 0, repsMax: Number(r[EX.repsMax]) || 0,
      increment: Number(r[EX.increment]) || 0, weightType: String(r[EX.weightType]),
      active: r[EX.active] === VALUE.active,
      note: noteCol >= 0 ? String(r[noteCol] || '') : '',
      barWeight: bar === '' || bar === null ? null : Number(bar),
    };
  });
}

/** Adds the two extra columns at the end of "Übungen" if they are missing; never touches existing data. */
function ensureExerciseColumns_(ss) {
  const sheet = ss.getSheetByName(SHEET.exercises);
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const result = {};
  ['note', 'barWeight'].forEach(function (key) {
    let index = header.indexOf(EXTRA_EXERCISE_COLUMNS[key]);
    if (index < 0) {
      index = header.length;
      sheet.getRange(1, index + 1).setValue(EXTRA_EXERCISE_COLUMNS[key]);
      header.push(EXTRA_EXERCISE_COLUMNS[key]);
    }
    result[key] = index + 1;
  });
  return result;
}

function wasClientIdSaved_(clientId) {
  const stored = PropertiesService.getScriptProperties().getProperty(CLIENT_IDS_PROPERTY);
  return (stored ? JSON.parse(stored) : []).indexOf(clientId) >= 0;
}

function rememberClientId_(clientId) {
  const properties = PropertiesService.getScriptProperties();
  const stored = properties.getProperty(CLIENT_IDS_PROPERTY);
  const ids = (stored ? JSON.parse(stored) : []).concat([clientId]).slice(-CLIENT_IDS_KEPT);
  properties.setProperty(CLIENT_IDS_PROPERTY, JSON.stringify(ids));
}

function parseIsoDate_(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function isValidKey_(key) {
  const stored = PropertiesService.getScriptProperties().getProperty(KEY_PROPERTY);
  return Boolean(stored) && typeof key === 'string' && key === stored;
}

function withLock_(fn) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function reply_(body, started) {
  if (started) body.ms = Date.now() - started;
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
