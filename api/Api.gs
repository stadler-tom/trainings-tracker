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
 * Responses: { "ok": true, "data": ... } or { "ok": false, "error": "<code>" }.
 * Error codes are English; the app shows German messages.
 */

const API_VERSION = '1.1.0';
const APP_URL = 'https://stadler-tom.github.io/trainings-tracker/';
const KEY_PROPERTY = 'API_KEY';
const CLIENT_IDS_PROPERTY = 'SAVED_CLIENT_IDS';
const WEB_APP_URL_PROPERTY = 'WEB_APP_URL';
const CLIENT_IDS_KEPT = 200;
const EXTRA_EXERCISE_COLUMNS = { note: 'Gerätenotiz', barWeight: 'Stangengewicht kg' };

// ===== Entry points ===========================================================
function doPost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, error: 'invalid_json' });
  }
  return reply_(handle_(request.action, request.key, request.payload || {}));
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
 * Safe to run again at any time; it only adds what is missing:
 * sheet "Einstellungen", sheets for the training days, the two extra exercise columns
 * and the key. Existing data is never changed.
 */
function setupApi() {
  const ss = SpreadsheetApp.getActive();
  const properties = PropertiesService.getScriptProperties();
  let key = properties.getProperty(KEY_PROPERTY);
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    properties.setProperty(KEY_PROPERTY, key);
  }
  const created = applyDays();
  ensureExerciseColumns_(ss);
  refreshExerciseList_(ss);
  Logger.log('API key created. New day sheets: ' + (created.length ? created.join(', ') : 'none'));
  SpreadsheetApp.getUi().alert('Einrichtung', 'Fertig. ' +
    (created.length ? 'Neu angelegte Trainingstage: ' + created.join(', ') + '. ' : '') +
    'Nächster Schritt laut Anleitung: Bereitstellen → Neue Bereitstellung → Web-App.',
    SpreadsheetApp.getUi().ButtonSet.OK);
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
  const tz = ss.getSpreadsheetTimeZone();
  const exercises = readExerciseRows_(ss);
  const nameToId = {};
  exercises.forEach(function (ex) { nameToId[ex.name] = ex.id; });

  const history = {};          // id -> { lastSession, bestE1rm, bestRepsAtZero }
  const lastDateByDay = {};
  const log = ss.getSheetByName(SHEET.log);
  if (log.getLastRow() > 1) {
    log.getRange(2, 1, log.getLastRow() - 1, LOG_HEADER.length).getValues().forEach(function (r) {
      const date = r[LOG.date], id = r[LOG.exerciseId], kg = r[LOG.kg], reps = r[LOG.reps];
      if (!(date instanceof Date) || !id || typeof kg !== 'number' || typeof reps !== 'number') return;
      const dateKey = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
      const day = String(r[LOG.day] || '');
      if (day && (!lastDateByDay[day] || dateKey > lastDateByDay[day])) lastDateByDay[day] = dateKey;
      if (r[LOG.deload] === true) return;

      const h = history[id] || (history[id] = { lastSession: null, bestE1rm: 0, bestRepsAtZero: 0 });
      h.bestE1rm = Math.max(h.bestE1rm, kg * (1 + reps / 30));
      if (kg === 0) h.bestRepsAtZero = Math.max(h.bestRepsAtZero, reps);
      const set = { set: Number(r[LOG.set]), kg: kg, reps: reps, failure: r[LOG.failure] === true };
      if (!h.lastSession || dateKey > h.lastSession.date) h.lastSession = { date: dateKey, sets: [set] };
      else if (dateKey === h.lastSession.date) h.lastSession.sets.push(set);
    });
  }
  Object.keys(history).forEach(function (id) {
    const s = history[id].lastSession;
    if (s) s.sets.sort(function (a, b) { return a.set - b.set; });
  });

  const days = daySheets_(ss).filter(function (name) { return ss.getSheetByName(name); }).map(function (name) {
    const sheet = ss.getSheetByName(name);
    const slots = sheet ? readSlots_(sheet).map(function (slot) { return nameToId[slot.name] || null; }) : [];
    return { name: name, lastDate: lastDateByDay[name] || null, exerciseIds: slots.filter(Boolean) };
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
  if (daySheets_(ss).indexOf(p.day) < 0 || !ss.getSheetByName(p.day)) return { ok: false, error: 'unknown_day' };
  const date = parseIsoDate_(p.date);
  if (!date) return { ok: false, error: 'invalid_date' };

  const byId = {};
  readExerciseRows_(ss).forEach(function (ex) { byId[ex.id] = ex; });
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
      rows.push([date, p.day, ex.id, ex.name, ex.muscleGroup, s.no, item.kg, s.reps,
        item.failure === true && index === sets.length - 1, p.deload === true, now, String(p.note || '')]);
    });
  }
  if (!rows.length) return { ok: false, error: 'nothing_to_save' };

  const log = ss.getSheetByName(SHEET.log);
  const lastRow = log.getLastRow();
  const dateText = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  if (lastRow > 1) {
    const exists = log.getRange(2, 1, lastRow - 1, 2).getValues().some(function (r) {
      return r[0] instanceof Date && r[1] === p.day && Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') === dateText;
    });
    if (exists) return { ok: false, error: 'already_saved' };
  }

  log.getRange(lastRow + 1, 1, rows.length, LOG_HEADER.length).setValues(rows);
  SpreadsheetApp.flush();
  rememberClientId_(p.clientId);
  refreshAllInfo_(ss);                         // keeps the info rows of the sheet input in sync
  return { ok: true, data: { savedSets: rows.length } };
}

/** Writes the exercise order of one day sheet (section 4.2). Payload: { day, exerciseIds: [...] } */
function updateDaySlots_(p) {
  const ss = SpreadsheetApp.getActive();
  if (daySheets_(ss).indexOf(p.day) < 0 || !ss.getSheetByName(p.day)) return { ok: false, error: 'unknown_day' };
  const ids = p.exerciseIds || [];
  if (ids.length > SLOT_COUNT) return { ok: false, error: 'too_many_exercises' };
  const byId = {};
  readExerciseRows_(ss).forEach(function (ex) { byId[ex.id] = ex; });
  if (ids.some(function (id) { return !byId[id]; })) return { ok: false, error: 'unknown_exercise' };

  const sheet = ss.getSheetByName(p.day);
  // keep inputs that were already typed into the sheet for exercises that stay
  const inputsByName = {};
  readSlots_(sheet).forEach(function (slot) { inputsByName[slot.name] = slot.inputs; });
  const used = ids.map(function (id) {
    const name = byId[id].name;
    return { name: name, inputs: inputsByName[name] || ['', '', '', '', '', false] };
  });
  writeSlots_(sheet, used);
  refreshInfo_(sheet, loadContext_(ss));
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

function reply_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
