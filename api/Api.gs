/**
 * Training tracker – web API (requirements spec section 5).
 *
 * Runs as a web app inside each user's own Google Sheet. It only checks the key,
 * reads and writes data and reports its version; all calculations live in the app.
 * Requests: HTTPS POST, body = JSON as text/plain (avoids a CORS preflight).
 */

const API_VERSION = '0.1.0';
const KEY_PROPERTY = 'API_KEY';

function doPost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, error: 'invalid_json' });
  }
  if (!isValidKey_(request.key)) return reply_({ ok: false, error: 'invalid_key' });

  switch (request.action) {
    case 'ping':
      return reply_({ ok: true, data: { apiVersion: API_VERSION, sheetName: SpreadsheetApp.getActive().getName() } });
    default:
      return reply_({ ok: false, error: 'unknown_action' });
  }
}

/** Run once from the editor: creates the key and shows it (requirements spec section 7.2). */
function setupApiKey() {
  const properties = PropertiesService.getScriptProperties();
  let key = properties.getProperty(KEY_PROPERTY);
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    properties.setProperty(KEY_PROPERTY, key);
  }
  Logger.log('API key: ' + key);
}

function isValidKey_(key) {
  const stored = PropertiesService.getScriptProperties().getProperty(KEY_PROPERTY);
  return Boolean(stored) && key === stored;
}

function reply_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
