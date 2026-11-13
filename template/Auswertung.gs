/**
 * Training tracker – analysis in Google Sheets (same sheets as the Excel analysis).
 *
 * Run setupAnalysis() ONCE in the converted Google Sheets copy of Trainings-Auswertung-Google.xlsx
 * (Erweiterungen → Apps Script). It writes everything the .xlsx cannot carry reliably:
 *   - the import formulas of the data sheets (IMPORTRANGE from the tracker sheet + QUERY),
 *   - the connection check in "Einstellungen",
 *   - the sparklines of "Übersicht", the exercise dropdown of "Dashboard" and all charts.
 * After that the file is pure formulas: no script runs while using it, and every formula and
 * chart can be changed by hand. Running it again rewrites exactly these parts.
 *
 * Data flow: tracker sheet → "Daten Log" / "Daten Übungen" / "Daten Körper" (IMPORTRANGE)
 *   → "Daten Einheiten" (one row per exercise and training day, like the Power Query "Sessions")
 *   → "Daten Liste" (exercises with sessions, ordered by training day)
 *   → classic formulas on "_calc", "Dashboard", "Übersicht", "Volumen", "Körper" (from the .xlsx).
 * Formulas are written with setFormula, i.e. English function names and commas in every locale.
 */

const SHEETS = {
  dashboard: 'Dashboard', overview: 'Übersicht', volume: 'Volumen', body: 'Körper', settings: 'Einstellungen',
  log: 'Daten Log', exercises: 'Daten Übungen', bodyData: 'Daten Körper', sessions: 'Daten Einheiten',
  list: 'Daten Liste', calc: '_calc'
};
const SOURCE_ROW = 13;                  // "Einstellungen": C13 = address of the tracker sheet (named "Quelle")
const OVERVIEW_ROWS = 60;               // rows of "Übersicht" (5..64), helper rows 2..61 on _calc
const SPARK_FROM = 'AQ', SPARK_TO = 'BB';   // _calc: e1RM of the last 12 sessions per overview row
const VOLUME_SHEET_LAST_ROW = 16;       // last target row on "Volumen"; its chart goes 3 rows below
const COLORS = { ink: '#1F2937', muted: '#9CA3AF', accent: '#C62828' };

function setupAnalysis() {
  const ss = SpreadsheetApp.getActive();
  const sheet = function (name) {
    const s = ss.getSheetByName(name);
    if (!s) throw new Error('Sheet "' + name + '" is missing: is this the converted Trainings-Auswertung-Google.xlsx?');
    return s;
  };
  writeImportFormulas_(sheet);
  writeSessionFormulas_(sheet(SHEETS.sessions));
  writeListFormulas_(sheet(SHEETS.list));
  writeConnectionCheck_(sheet(SHEETS.settings));
  writeSparklines_(sheet(SHEETS.overview));
  writeExerciseDropdown_(sheet(SHEETS.dashboard), sheet(SHEETS.list));
  writeCharts_(sheet);
  SpreadsheetApp.getUi().alert('Auswertung', 'Fertig. Jetzt im Blatt Einstellungen die Adresse deines Tracker-Sheets ' +
    'eintragen und neben „Verbindung“ auf „Zugriff erlauben“ klicken.', SpreadsheetApp.getUi().ButtonSet.OK);
}

// ===== Data sheets ===============================================================
/** Log, exercises and body values imported from the tracker sheet (named cell "Quelle"). */
function writeImportFormulas_(sheet) {
  // only complete sets, sorted like the sessions: exercise, date, set
  sheet(SHEETS.log).getRange('A2').setFormula(
    '=IF(Quelle="",,IFERROR(LET(r,IMPORTRANGE(Quelle,"Log!A2:L"),' +
    'v,FILTER(r,ISNUMBER(INDEX(r,0,1)),INDEX(r,0,3)<>"",ISNUMBER(INDEX(r,0,7)),ISNUMBER(INDEX(r,0,8))),' +
    'SORT(v,3,TRUE,1,TRUE,6,TRUE)),))');
  // helper columns per set for the session query
  const log = sheet(SHEETS.log);
  log.getRange('M1:S1').setValues([['e1RM Satz', 'Volumen Satz', 'Wdh S1', 'Wdh S2', 'Wdh S3', 'Wdh S4', 'Versagen 0/1']]);
  log.getRange('M2:S2').setFormulas([[
    '=ARRAYFORMULA(IF(A2:A="",,G2:G*(1+H2:H/30)))',
    '=ARRAYFORMULA(IF(A2:A="",,G2:G*H2:H))',
    '=ARRAYFORMULA(IF(F2:F=1,H2:H,))',
    '=ARRAYFORMULA(IF(F2:F=2,H2:H,))',
    '=ARRAYFORMULA(IF(F2:F=3,H2:H,))',
    '=ARRAYFORMULA(IF(F2:F=4,H2:H,))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(I2:I=TRUE,1,0)))'
  ]]);
  sheet(SHEETS.exercises).getRange('A2').setFormula(
    '=IF(Quelle="",,IFERROR(LET(r,IMPORTRANGE(Quelle,"Übungen!A2:I"),FILTER(r,INDEX(r,0,1)<>"")),))');
  sheet(SHEETS.bodyData).getRange('A2').setFormula(
    '=IF(Quelle="",,IFERROR(LET(r,IMPORTRANGE(Quelle,"Körper!A2:C"),SORT(FILTER(r,ISNUMBER(INDEX(r,0,1))),1,TRUE)),))');
}

/**
 * One row per exercise and training day (columns A:AE, same as the Excel table "Sessions").
 * AH:AV hold the grouped query; AX:AY are helpers for the best session.
 */
function writeSessionFormulas_(s) {
  const L = "'" + SHEETS.log + "'";
  const EX = "'" + SHEETS.exercises + "'!$A$2:$I";
  s.getRange('AH1').setFormula('=IFERROR(QUERY(' + L + '!A1:S,"' +
    'select C, A, J, max(B), max(G), count(H), min(H), max(M), max(H), sum(N), max(S), max(O), max(P), max(Q), max(R) ' +
    'where C is not null group by C, A, J order by C, A ' +
    "label C 'ID', A 'Datum', J 'Deload', max(B) 'Tag', max(G) 'kg', count(H) 'Sätze', min(H) 'Wdh min', " +
    "max(M) 'e1RM', max(H) 'Wdh max', sum(N) 'Volumen', max(S) 'Versagen', max(O) 'S1', max(P) 'S2', " +
    "max(Q) 'S3', max(R) 'S4'\",1),)");
  const each = function (expression) { return '=ARRAYFORMULA(IF(AH2:AH="",,' + expression + '))'; };
  const lookup = function (column) { return each('IFERROR(VLOOKUP(AH2:AH,' + EX + ',' + column + ',FALSE),"")'); };
  const formulas = {
    A: each('AH2:AH'),                               // Übungs-ID
    B: each('AI2:AI'),                               // Datum
    C: each('AJ2:AJ'),                               // Deload
    D: each('AK2:AK'),                               // Tag
    E: lookup(2), F: lookup(3), G: lookup(4),        // Übung, Muskelgruppe, Typ (from the exercise master)
    H: each('AL2:AL'),                               // kg (one weight per exercise and session)
    I: each('AM2:AM'),                               // Sätze
    J: each('SUBSTITUTE(TRIM(AS2:AS&" "&AT2:AT&" "&AU2:AU&" "&AV2:AV)," ","/")'),   // Wdh "8/8/7"
    K: each('IF(AS2:AS<>"",AS2:AS,IF(AT2:AT<>"",AT2:AT,IF(AU2:AU<>"",AU2:AU,AV2:AV)))'),   // Wdh Satz 1
    L: each('AN2:AN'),                               // Wdh min
    M: each('AR2:AR=1'),                             // Versagen
    N: each('AO2:AO'),                               // e1RM (best set)
    O: each('AP2:AP'),                               // Wdh bester Satz (same weight: most reps)
    P: each('AQ2:AQ'),                               // Volumen
    Q: each('IF(G2:G="Aufwärmen",0,I2:I)'),          // Harte Sätze
    R: each('B2:B-WEEKDAY(B2:B,3)'),                 // Wochenbeginn (Monday)
    S: each('ISOWEEKNUM(R2:R)'),                     // KW
    T: lookup(5), U: lookup(6), V: lookup(7), W: lookup(8),   // Wdh-Min, Wdh-Max, Gewichtssprung, Gewichtsart
    X: each('IF(C2:C,,COUNTIFS(A2:A,A2:A,C2:C,FALSE,ROW(A2:A),"<="&ROW(A2:A)))'),   // Nr (regular sessions)
    Y: each('COUNTIFS(A2:A,A2:A,ROW(A2:A),"<="&ROW(A2:A))'),                       // Nr gesamt
    Z: each('IF(C2:C,FALSE,IFERROR(MATCH(AX2:AX,AY2:AY,0),0)=ROW(A2:A)-1)'),       // Bester (first best e1RM)
    AA: each('A2:A&"|"&IF(C2:C,"D"&Y2:Y,X2:X)'),     // Schlüssel
    AB: each('A2:A&"|"&Y2:Y'),                       // Schlüssel gesamt
    AC: each('IF(Z2:Z,A2:A&"|B","")'),               // Schlüssel bester
    AD: each('IFERROR(VLOOKUP(A2:A&"|1",{AA2:AA,N2:N},2,FALSE),"")'),             // e1RM Start
    AE: each('IF(AD2:AD="","",IF(AD2:AD=0,"",N2:N/AD2:AD-1))'),                   // Veränderung
    AX: each('A2:A&"|"&IFERROR(VLOOKUP(A2:A,QUERY({A2:A,N2:N,C2:C},' +
      '"select Col1, max(Col2) where Col3 = false and Col1 is not null group by Col1",0),2,FALSE),"")'),
    AY: each('IF(C2:C,"",A2:A&"|"&N2:N)')
  };
  s.getRange('AX1:AY1').setValues([['bestKey', 'regularKey']]);
  Object.keys(formulas).forEach(function (column) { s.getRange(column + '2').setFormula(formulas[column]); });
}

/** Exercises with sessions, grouped by the training day of their latest session (like "ExerciseList"). */
function writeListFormulas_(s) {
  const SES = "'" + SHEETS.sessions + "'";
  const EX = "'" + SHEETS.exercises + "'!$A$2:$C";
  s.getRange('G1:I1').setValues([['IDs', 'Tag zuletzt', 'Reihenfolge']]);
  s.getRange('G2').setFormula('=IFERROR(UNIQUE(FILTER(' + SES + '!A2:A,' + SES + '!A2:A<>"")),)');
  // sessions are sorted by exercise and date: the last match is the latest session
  s.getRange('H2').setFormula('=ARRAYFORMULA(IF(G2:G="",,XLOOKUP(G2:G,' + SES + '!A2:A,' + SES + '!D2:D,"",0,-1)))');
  // days ordered by the weekday of their latest session, Monday first
  s.getRange('I2').setFormula('=ARRAYFORMULA(IF(G2:G="",,IFERROR(WEEKDAY(VLOOKUP(H2:H,QUERY(' + SES +
    '!A1:D,"select D, max(B) where A is not null group by D",1),2,FALSE),2),8)))');
  s.getRange('A2').setFormula('=IFERROR(ARRAYFORMULA(SORT(FILTER({G2:G,IFERROR(VLOOKUP(G2:G,' + EX + ',2,FALSE),G2:G),' +
    'H2:H,IFERROR(VLOOKUP(G2:G,' + EX + ',3,FALSE),""),I2:I},G2:G<>""),5,TRUE,3,TRUE,4,TRUE,2,TRUE)),)');
}

/** Shows "verbunden" once access is allowed; before that the cell offers "Zugriff erlauben". */
function writeConnectionCheck_(s) {
  s.getRange(SOURCE_ROW + 1, 3).setFormula('=IF(Quelle="","",IF(IMPORTRANGE(Quelle,"Log!A1")="Datum","verbunden",' +
    '"Adresse prüfen: kein Tracker-Sheet")))');
}

// ===== Overview, dashboard, charts ===============================================
function writeSparklines_(s) {
  const formulas = [];
  for (let i = 1; i <= OVERVIEW_ROWS; i++) {
    const range = SHEETS.calc + '!' + SPARK_FROM + (i + 1) + ':' + SPARK_TO + (i + 1);
    formulas.push(['=IFERROR(SPARKLINE(FILTER(' + range + ',ISNUMBER(' + range + ')),' +
      '{"color","' + COLORS.ink + '";"linewidth",1.5}),"")']);
  }
  s.getRange(5, 10, OVERVIEW_ROWS, 1).setFormulas(formulas);       // column J "Verlauf (12)"
}

function writeExerciseDropdown_(dashboard, list) {
  dashboard.getRange('C4').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(list.getRange('B2:B'), true).setAllowInvalid(false)
    .setHelpText('Übung auswählen').build());
}

function writeCharts_(sheet) {
  const calc = sheet(SHEETS.calc);
  calc.getRange('BC1:BD1').setValues([['date', 'Bauchumfang']]);
  [SHEETS.dashboard, SHEETS.volume, SHEETS.body].forEach(function (name) {
    const s = sheet(name);
    s.getCharts().forEach(function (chart) { s.removeChart(chart); });
  });
  const add = function (target, builder) { target.insertChart(builder.build()); };
  const base = function (target, type, row, column, width, height, title) {
    return target.newChart().setChartType(type).setPosition(row, column, 0, 0).setNumHeaders(1)
      .setOption('title', title).setOption('width', width).setOption('height', height)
      .setOption('titleTextStyle', { color: COLORS.ink, fontSize: 12, bold: true })
      .setOption('legend', { position: 'none' });
  };

  const dashboard = sheet(SHEETS.dashboard);
  add(dashboard, base(dashboard, Charts.ChartType.SCATTER, 11, 2, 620, 300, 'e1RM je Einheit')
    .addRange(calc.getRange('E1:F301'))
    .setOption('colors', [COLORS.ink]).setOption('lineWidth', 2).setOption('pointSize', 5)
    .setOption('hAxis', { format: 'dd.MM.' }));
  add(dashboard, base(dashboard, Charts.ChartType.COLUMN, 11, 11, 620, 300, 'Volumen je Einheit (kg × Wdh)')
    .addRange(calc.getRange('H1:I21'))
    .setOption('colors', [COLORS.muted]));

  const volume = sheet(SHEETS.volume);
  add(volume, base(volume, Charts.ChartType.COMBO, VOLUME_SHEET_LAST_ROW + 3, 2, 1000, 320,
    'Brust: harte Sätze je Woche und Ziel')
    .addRange(calc.getRange('A79:C91'))
    .setOption('seriesType', 'bars')
    .setOption('series', { 0: { color: COLORS.accent }, 1: { type: 'line', color: COLORS.ink, lineDashStyle: [6, 4] } })
    .setOption('legend', { position: 'bottom' }));

  const body = sheet(SHEETS.body);
  add(body, base(body, Charts.ChartType.LINE, 15, 2, 900, 330, 'Kraft (Grundübungen, e1RM seit Start) und Körpergewicht')
    .addRange(calc.getRange('B99:D115'))
    .setOption('series', {
      0: { color: COLORS.ink, lineWidth: 3, pointSize: 5, targetAxisIndex: 0 },
      1: { color: COLORS.muted, lineWidth: 2, lineDashStyle: [6, 4], targetAxisIndex: 1 }
    })
    .setOption('vAxes', { 0: { title: 'Kraft seit Start', format: 'percent' }, 1: { title: 'Gewicht kg' } })
    .setOption('legend', { position: 'bottom' }));
  // daily weight as points, 7-day average as line; same rows on _calc (BA/BB) and "Daten Körper" (B)
  add(body, base(body, Charts.ChartType.SCATTER, 33, 2, 900, 320, 'Körpergewicht und 7-Tage-Schnitt')
    .addRange(calc.getRange('BA1:BB1501'))
    .addRange(sheet(SHEETS.bodyData).getRange('B1:B1501'))
    .setOption('series', {
      0: { color: COLORS.ink, lineWidth: 3, pointSize: 0 },
      1: { color: COLORS.muted, lineWidth: 0, pointSize: 4 }
    })
    .setOption('hAxis', { format: 'dd.MM.' })
    .setOption('legend', { position: 'bottom' }));
  add(body, base(body, Charts.ChartType.SCATTER, 50, 2, 900, 280, 'Bauchumfang cm')
    .addRange(calc.getRange('BC1:BD1501'))
    .setOption('colors', [COLORS.ink]).setOption('lineWidth', 2).setOption('pointSize', 5)
    .setOption('hAxis', { format: 'dd.MM.' }));
}
