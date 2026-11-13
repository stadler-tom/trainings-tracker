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

const API_VERSION = '1.6.0';
const APP_URL = 'https://stadler-tom.github.io/trainings-tracker/';
const KEY_PROPERTY = 'API_KEY';
const RECENT_DATES = 4;                 // trainings per day sent for the "today" hint
const CLIENT_IDS_PROPERTY = 'SAVED_CLIENT_IDS';
const WEB_APP_URL_PROPERTY = 'WEB_APP_URL';
const CLIENT_IDS_KEPT = 200;
const EXTRA_EXERCISE_COLUMNS = { note: 'Gerätenotiz', barWeight: 'Stangengewicht kg' };
const RECENT_E1RM_SESSIONS = 8;         // sessions per exercise: deload check and progress curve in the app
// sheet "Einstellungen": one setting per row, label in column A, value in column B
const SETTINGS = [
  { key: 'deloadWeeks', label: 'Deload spätestens nach (Wochen)', value: 8, min: 1, max: 52,
    help: 'Spätestens nach so vielen Wochen ohne Deload zeigt die App „Deload-Woche fällig“. ' +
      'Sinkt die Leistung vorher bei mehreren Übungen, meldet sie sich früher (frühestens nach 4 Wochen).' },
  { key: 'weightTarget', label: 'Ziel Körpergewicht pro Woche (kg)', value: -0.5, min: -2, max: 2,
    help: 'Negativ = abnehmen, positiv = zunehmen, 0 = halten. Die App vergleicht den Wochenschnitt ' +
      'mit dem von vor 2 Wochen und meldet, ob du im Plan liegst.' },
];
// sheet "Körper": A date, B weight kg, C waist cm (layout shared with the analysis files)
const BODY = { date: 0, weight: 1, waist: 2 };
const BODY_LIMITS = { weight: [30, 250], waist: [40, 250] };

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
      case 'getTraining': return getTraining_(payload);
      case 'deleteTraining': return withLock_(function () { return deleteTraining_(payload); });
      case 'saveBody': return withLock_(function () { return saveBody_(payload); });
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
  ensureSettings_(ss);
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
  return buildState_(ss, days, readExerciseRows_(ss), readLog_(ss), readExtras_(ss));
}

/** Data outside the log that the state needs: settings and body values. */
function readExtras_(ss) {
  return { settings: readSettings_(ss), body: readBody_(ss) };
}

/** State from data already read once in this request (getState and the writing actions share it). */
function buildState_(ss, daySheets, exercises, logRows, extras) {
  const tz = ss.getSpreadsheetTimeZone();
  const idByName = {};
  const weightTypeById = {};
  exercises.forEach(function (ex) { idByName[ex.name] = ex.id; weightTypeById[ex.id] = ex.weightType; });
  const bodyWeightAt = bodyWeightLookup_(extras.body);

  const history = {};          // id -> { lastSession, bestE1rm, bestRepsAtZero, recentE1rm }
  const datesByDay = {};       // day -> { 'yyyy-MM-dd': true }
  const deloadByDate = {};     // 'yyyy-MM-dd' -> true if that training was a deload
  const e1rmByDate = {};       // id -> { 'yyyy-MM-dd': best e1RM of that session }
  const trainings = {};        // 'yyyy-MM-dd|day' -> overview of one training
  logRows.forEach(function (r) {
    const date = r[LOG.date], id = r[LOG.exerciseId], kg = r[LOG.kg], reps = r[LOG.reps];
    if (!(date instanceof Date) || !id || typeof kg !== 'number' || typeof reps !== 'number') return;
    const dateKey = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
    const day = String(r[LOG.day] || '');
    const deload = r[LOG.deload] === true;
    if (day) {
      (datesByDay[day] || (datesByDay[day] = {}))[dateKey] = true;
      const key = dateKey + '|' + day;
      const t = trainings[key] || (trainings[key] = { date: dateKey, day: day, deload: false, sets: 0, volume: 0, ids: {} });
      t.deload = t.deload || deload;
      t.sets++;
      t.volume += kg * reps;
      t.ids[id] = true;
    }
    deloadByDate[dateKey] = deloadByDate[dateKey] === true || deload;
    if (deload) return;

    const value = e1rmOf_(kg, reps, weightTypeById[id] === VALUE.addedWeight ? bodyWeightAt(dateKey) : null);
    const byDate = e1rmByDate[id] || (e1rmByDate[id] = {});
    byDate[dateKey] = Math.max(byDate[dateKey] || 0, value);
    const h = history[id] || (history[id] = { lastSession: null, bestE1rm: 0, bestRepsAtZero: 0 });
    h.bestE1rm = Math.max(h.bestE1rm, value);
    if (kg === 0) h.bestRepsAtZero = Math.max(h.bestRepsAtZero, reps);
    const set = { set: Number(r[LOG.set]), kg: kg, reps: reps, failure: r[LOG.failure] === true };
    if (!h.lastSession || dateKey > h.lastSession.date) h.lastSession = { date: dateKey, sets: [set] };
    else if (dateKey === h.lastSession.date) h.lastSession.sets.push(set);
  });
  Object.keys(history).forEach(function (id) {
    const s = history[id].lastSession;
    if (s) s.sets.sort(function (a, b) { return a.set - b.set; });
    // recentE1rm (since 1.5.0): best e1RM of the last sessions without deload, oldest first
    const byDate = e1rmByDate[id] || {};
    history[id].recentE1rm = Object.keys(byDate).sort().slice(-RECENT_E1RM_SESSIONS)
      .map(function (date) { return { date: date, e1rm: Math.round(byDate[date] * 100) / 100 }; });
  });
  // sessions (since 1.5.0): every training date, oldest first, for the deload check in the app
  const sessions = Object.keys(deloadByDate).sort()
    .map(function (date) { return { date: date, deload: deloadByDate[date] }; });
  // trainings (since 1.6.0): overview of every training, newest first, for the history in the app
  const trainingList = Object.keys(trainings).sort().reverse().map(function (key) {
    const t = trainings[key];
    return { date: t.date, day: t.day, deload: t.deload, sets: t.sets,
      volume: Math.round(t.volume), exercises: Object.keys(t.ids).length };
  });

  const days = daySheets.map(function (sheet) {
    const name = sheet.getName();
    const ids = readSlots_(sheet, { idByName: idByName }).map(function (slot) { return slot.id; });
    const dates = Object.keys(datesByDay[name] || {}).sort().reverse();
    // recentDates (since 1.3.0): the last trainings of this day, newest first; the app derives the usual weekday
    return { name: name, lastDate: dates[0] || null, recentDates: dates.slice(0, RECENT_DATES), exerciseIds: ids.filter(Boolean) };
  });

  return {
    apiVersion: API_VERSION, days: days, exercises: exercises, history: history,
    sessions: sessions, deloadWeeks: extras.settings.deloadWeeks,
    trainings: trainingList,                               // since 1.6.0
    body: extras.body,                                     // since 1.6.0, oldest first
    weightTarget: extras.settings.weightTarget,            // since 1.6.0
  };
}

/**
 * e1RM after Epley. For exercises with added weight (pull-ups) the body weight counts too,
 * if one is known (since 1.6.0); without it only the added weight counts, as before.
 */
function e1rmOf_(kg, reps, bodyWeight) {
  return (kg + (bodyWeight || 0)) * (1 + reps / 30);
}

/** Body weight on a date: the last weighing on or before it, else the first weighing at all. */
function bodyWeightLookup_(body) {
  const weighings = body.filter(function (b) { return b.weight !== null; });
  return function (dateKey) {
    if (!weighings.length) return null;
    let weight = weighings[0].weight;
    for (let i = 0; i < weighings.length && weighings[i].date <= dateKey; i++) weight = weighings[i].weight;
    return weight;
  };
}

/**
 * Saves one training from the app (section 4.3). Payload:
 * { clientId, day, date: 'yyyy-MM-dd', deload, note,
 *   exercises: [{ id, kg, reps: [n|null, n|null, n|null, n|null], failure }],
 *   replaces: { date, day } }   // optional since 1.6.0: a corrected training replaces this one
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
  let logRows = readLog_(ss);
  const replacing = Boolean(p.replaces && p.replaces.date && p.replaces.day);
  if (replacing) {
    const kept = logRows.filter(function (r) { return !isTrainingRow_(r, p.replaces.date, p.replaces.day, tz); });
    if (kept.length === logRows.length) return { ok: false, error: 'unknown_training' };
    logRows = kept;
  }
  const dateText = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  if (logRows.some(function (r) { return isTrainingRow_(r, dateText, day, tz); })) return { ok: false, error: 'already_saved' };

  const allRows = logRows.concat(rows);
  if (replacing) {
    writeLog_(ss, allRows);
  } else {
    ss.getSheetByName(SHEET.log).getRange(logRows.length + 2, 1, rows.length, LOG_HEADER.length).setValues(rows);
  }
  rememberClientId_(p.clientId);
  refreshAllInfo_(ss, loadContext_(ss, allRows), daySheets);   // keeps the info rows of the sheet input in sync
  // state (since 1.4.0): the app needs no second request to show the new "zuletzt" and targets
  const state = buildState_(ss, daySheets, exercises, allRows, readExtras_(ss));
  return { ok: true, data: { savedSets: rows.length, state: state } };
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

/**
 * One training with all sets, for the summary in the history (since 1.6.0). Payload: { date, day }
 * A set is marked as record if it is the best set of its exercise and beats all earlier trainings.
 */
function getTraining_(p) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const exercises = readExerciseRows_(ss);
  const byId = {};
  exercises.forEach(function (ex) { byId[ex.id] = ex; });
  const bodyWeightAt = bodyWeightLookup_(readBody_(ss));
  const best = {};           // id -> { e1rm, repsAtZero } of trainings before this one
  const result = { date: String(p.date), day: String(p.day), deload: false, note: '', exercises: [] };
  const exerciseById = {};
  readLog_(ss).forEach(function (r) {
    const date = r[LOG.date], id = r[LOG.exerciseId], kg = r[LOG.kg], reps = r[LOG.reps];
    if (!(date instanceof Date) || !id || typeof kg !== 'number' || typeof reps !== 'number') return;
    const dateKey = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
    const addedWeight = byId[id] && byId[id].weightType === VALUE.addedWeight;
    const value = e1rmOf_(kg, reps, addedWeight ? bodyWeightAt(dateKey) : null);
    if (dateKey === result.date && String(r[LOG.day]) === result.day) {
      result.deload = result.deload || r[LOG.deload] === true;
      if (r[LOG.note]) result.note = String(r[LOG.note]);
      let ex = exerciseById[id];
      if (!ex) {
        ex = exerciseById[id] = { id: String(id), name: byId[id] ? byId[id].name : String(r[LOG.exercise]), sets: [] };
        result.exercises.push(ex);
      }
      ex.sets.push({ set: Number(r[LOG.set]), kg: kg, reps: reps, failure: r[LOG.failure] === true,
        e1rm: Math.round(value * 10) / 10, isPr: false });
    } else if (dateKey < result.date && r[LOG.deload] !== true) {
      const b = best[id] || (best[id] = { e1rm: 0, repsAtZero: 0 });
      b.e1rm = Math.max(b.e1rm, value);
      if (kg === 0) b.repsAtZero = Math.max(b.repsAtZero, reps);
    }
  });
  if (!result.exercises.length) return { ok: false, error: 'unknown_training' };
  if (!result.deload) {
    result.exercises.forEach(function (ex) {
      ex.sets.sort(function (a, b) { return a.set - b.set; });
      const b = best[ex.id];
      if (!b) return;                                       // first training of this exercise: no record
      const top = ex.sets.reduce(function (x, y) { return y.e1rm > x.e1rm || (y.e1rm === x.e1rm && y.reps > x.reps) ? y : x; });
      const beatsE1rm = top.e1rm > Math.round(b.e1rm * 10) / 10;
      const beatsReps = top.kg === 0 && top.e1rm === 0 && top.reps > b.repsAtZero;
      top.isPr = beatsE1rm || beatsReps;
    });
  }
  return { ok: true, data: result };
}

/** Deletes one training from the log (since 1.6.0). Payload: { date, day } */
function deleteTraining_(p) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const logRows = readLog_(ss);
  const kept = logRows.filter(function (r) { return !isTrainingRow_(r, p.date, p.day, tz); });
  if (kept.length === logRows.length) return { ok: false, error: 'unknown_training' };
  writeLog_(ss, kept);
  const daySheets = daySheets_(ss);
  refreshAllInfo_(ss, loadContext_(ss, kept), daySheets);
  return { ok: true, data: { deletedSets: logRows.length - kept.length,
    state: buildState_(ss, daySheets, readExerciseRows_(ss), kept, readExtras_(ss)) } };
}

/**
 * Saves body values of one day into sheet "Körper" (since 1.6.0). Payload: { date, weight, waist }
 * A value that is null stays as it is; a day that already has a row gets it updated.
 */
function saveBody_(p) {
  const ss = SpreadsheetApp.getActive();
  const date = parseIsoDate_(p.date);
  if (!date) return { ok: false, error: 'invalid_date' };
  const values = {};
  for (const key of ['weight', 'waist']) {
    if (p[key] === null || p[key] === undefined || p[key] === '') continue;
    const value = Number(p[key]);
    if (!(value >= BODY_LIMITS[key][0] && value <= BODY_LIMITS[key][1])) return { ok: false, error: 'invalid_body', detail: key };
    values[key] = value;
  }
  if (!Object.keys(values).length) return { ok: false, error: 'invalid_body' };

  const sheet = ss.getSheetByName(SHEET.body);
  const tz = ss.getSpreadsheetTimeZone();
  const dateKey = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  const last = sheet.getLastRow();
  const dates = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getValues() : [];
  let row = -1;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i][0] instanceof Date && Utilities.formatDate(dates[i][0], tz, 'yyyy-MM-dd') === dateKey) row = i + 2;
  }
  if (row < 0) {
    row = last + 1;
    sheet.getRange(row, BODY.date + 1).setValue(date);
  }
  Object.keys(values).forEach(function (key) { sheet.getRange(row, BODY[key] + 1).setValue(values[key]); });
  return { ok: true, data: { body: readBody_(ss) } };
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

/** Creates sheet "Einstellungen" and adds every missing setting with its default; never changes existing values. */
function ensureSettings_(ss) {
  let sheet = ss.getSheetByName(SHEET.settings);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.settings);
    sheet.getRange(1, 1, 1, 3).setValues([['Einstellung', 'Wert', 'Erklärung']]).setFontWeight('bold');
    sheet.setColumnWidth(1, 260);
    sheet.setColumnWidth(3, 520);
  }
  const labels = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues()
    .map(function (r) { return String(r[0]).trim(); });
  SETTINGS.forEach(function (setting) {
    if (labels.indexOf(setting.label) >= 0) return;
    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, 3).setValues([[setting.label, setting.value, setting.help]]);
    sheet.getRange(row, 3).setWrap(true);
  });
}

/** Settings from sheet "Einstellungen"; a missing or invalid value falls back to its default. */
function readSettings_(ss) {
  const result = {};
  SETTINGS.forEach(function (setting) { result[setting.key] = setting.value; });
  const sheet = ss.getSheetByName(SHEET.settings);
  if (!sheet || sheet.getLastRow() < 1) return result;
  sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues().forEach(function (row) {
    const setting = SETTINGS.filter(function (s) { return s.label === String(row[0]).trim(); })[0];
    if (!setting || row[1] === '' || row[1] === null) return;
    const value = Number(row[1]);
    if (value >= setting.min && value <= setting.max) result[setting.key] = value;
  });
  return result;
}

/** Body values from sheet "Körper", oldest first: [{ date, weight, waist }], empty values as null. */
function readBody_(ss) {
  const sheet = ss.getSheetByName(SHEET.body);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const number = function (value) { return typeof value === 'number' && value > 0 ? value : null; };
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
    .filter(function (r) { return r[BODY.date] instanceof Date && (number(r[BODY.weight]) || number(r[BODY.waist])); })
    .map(function (r) {
      return { date: Utilities.formatDate(r[BODY.date], tz, 'yyyy-MM-dd'),
        weight: number(r[BODY.weight]), waist: number(r[BODY.waist]) };
    })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}

/** true if a log row belongs to the training of this date (yyyy-MM-dd) and day. */
function isTrainingRow_(r, dateKey, day, tz) {
  return r[LOG.date] instanceof Date && String(r[LOG.day]) === String(day) &&
    Utilities.formatDate(r[LOG.date], tz, 'yyyy-MM-dd') === String(dateKey);
}

/** Writes the whole log again (after a correction or a deletion); formats of the sheet stay. */
function writeLog_(ss, rows) {
  const log = ss.getSheetByName(SHEET.log);
  if (log.getLastRow() > 1) log.getRange(2, 1, log.getLastRow() - 1, LOG_HEADER.length).clearContent();
  if (rows.length) log.getRange(2, 1, rows.length, LOG_HEADER.length).setValues(rows);
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
