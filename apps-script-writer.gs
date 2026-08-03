// ============================================================
//  CRM WRITER v2.1 — TextFinder + todos los campos editables
// ============================================================

var SHEET_NAME = 'Registro de atención';
var SHEET_ID   = '1IkFQJW8kMcwQ9hwl0ixalQFUyribvDYDahbrBOFQf_g';
var SECRET     = 'CS-crm-2026';

var FIELD_MAP = {
  // ── Contacto ──
  nombre:      ['nombre', 'name', 'nombres'],
  correo:      ['correo', 'email', 'e-mail', 'correo electrónico'],
  pais:        ['país', 'pais', 'country'],
  telefono:    ['teléfono', 'telefono', 'tel', 'phone'],
  inscripcion: ['fecha de inscripción', 'fecha de inscripcion', 'inscripción', 'inscripcion', 'fecha inscripción', 'fecha inscripcion'],
  evento:      ['evento', 'event'],
  contactoWa:  ['contacto en whats', 'contacto whats', 'contacto wa', 'contactowa'],

  // ── Membresía Club ──
  acceso:      ['acceso', 'plataforma', 'acceso a plataforma'],
  renovar:     ['renovar', 'renovación', 'renovacion'],
  finAcceso:   ['fin acceso', 'fin de acceso', 'finacceso'],
  status:      ['status', 'estado', 'estatus'],

  // ── Seguimiento ──
  llamada:     ['llamada'],

  // ── Notas ──
  notas:       ['notas', 'nota', 'notes'],
  ciudad:      ['ciudad', 'otras notas', 'city'],
  soporte:     ['soporte', 'notas soporte', 'notas de soporte'],

  // ── Membresía Skool (Sheet 1) ──
  memTipo:     ['tipo de membresia', 'tipo membresia', 'tipo de membresía', 'tipo membresía', 'membresia', 'membresía'],
  memVence:    ['fecha de vencimiento skool', 'vencimiento skool', 'fecha vencimiento skool', 'vence skool'],
  memInvit:    ['invitacion de skool', 'invitación de skool', 'invitacion skool', 'invitación skool', 'invitacion'],

  // ── Boletos ──
  boletoTipo:  ['tipo de boleto synergy unlimited', 'tipo de boleto', 'boleto synergy unlimited']
};

// ── CORS ──────────────────────────────────────────────────
// ContentService.TextOutput no soporta addHeader() (eso es de HtmlService).
// Los endpoints /exec de Apps Script ya son legibles cross-origin por
// defecto cuando el deploy es "Cualquier usuario", así que basta con
// fijar el MIME type.
function setCORSHeaders(output) {
  return output.setMimeType(ContentService.MimeType.JSON);
}

// ── GET — health check ────────────────────────────────────
function doGet(e) {
  return setCORSHeaders(
    ContentService.createTextOutput(JSON.stringify({ ok: true, msg: 'CRM Writer v2.1 activo' }))
  );
}

// ── POST ──────────────────────────────────────────────────
function doPost(e) {
  try {
    var secret = e.parameter.secret || '';
    var correo  = (e.parameter.correo || '').toLowerCase().trim(); // correo ORIGINAL para buscar
    var action  = e.parameter.action || 'update';
    var campos  = {};
    try { campos = JSON.parse(e.parameter.campos || '{}'); } catch(ex) {}

    if (!secret || secret !== SECRET) {
      return respond({ ok: false, error: 'No autorizado' });
    }

    var ss   = SpreadsheetApp.openById(SHEET_ID);
    var hoja = ss.getSheetByName(SHEET_NAME);
    if (!hoja) return respond({ ok: false, error: 'Pestaña no encontrada: ' + SHEET_NAME });

    if (action === 'add') return handleAdd(hoja, campos);

    if (!correo) return respond({ ok: false, error: 'Correo requerido' });
    return handleUpdate(hoja, correo, campos);

  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}

// ── UPDATE ────────────────────────────────────────────────
function handleUpdate(hoja, correo, campos) {
  var lastCol   = hoja.getLastColumn();
  var headerRow = hoja.getRange(1, 1, 1, lastCol).getValues()[0];
  var headers   = headerRow.map(function(h) {
    return (h || '').toString().toLowerCase().trim();
  });

  function getColIdx(field) {
    var aliases = FIELD_MAP[field] || [];
    for (var i = 0; i < aliases.length; i++) {
      var idx = headers.indexOf(aliases[i].toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  }

  // Encontrar columna de correo
  var correoIdx = getColIdx('correo');
  if (correoIdx < 0) return respond({ ok: false, error: 'Columna correo no encontrada en el Sheet' });

  // TextFinder — busca sin cargar todo el sheet
  var correoRange = hoja.getRange(2, correoIdx + 1, hoja.getLastRow() - 1, 1);
  var finder      = correoRange.createTextFinder(correo).matchEntireCell(true).matchCase(false);
  var found       = finder.findNext();
  if (!found) return respond({ ok: false, error: 'Contacto no encontrado: ' + correo });

  var filaNum      = found.getRow();
  var actualizados = [];
  var errores      = [];

  Object.keys(campos).forEach(function(field) {
    var colIdx = getColIdx(field);
    if (colIdx < 0) {
      errores.push(field + ' (columna no encontrada)');
      return;
    }
    var val  = campos[field];
    var cell = hoja.getRange(filaNum, colIdx + 1);

    // ── ESCRIBIR SIEMPRE COMO TEXTO PLANO ──────────────────────────────────────
    // El index ya envía la fecha en formato MM/DD/YY (igual que Sheets la guarda).
    // No convertimos a Date para evitar que Sheets reformatee la celda.
    // Es exactamente como si el usuario hiciera clic en la celda y escribiera los números.
    cell.setValue(val);
    actualizados.push(field);

  });

  SpreadsheetApp.flush();

  return respond({ ok: true, actualizados: actualizados, errores: errores, fila: filaNum });
}

// ── ADD ───────────────────────────────────────────────────
function handleAdd(hoja, campos) {
  var lastCol   = hoja.getLastColumn();
  var headerRow = hoja.getRange(1, 1, 1, lastCol).getValues()[0];
  var headers   = headerRow.map(function(h) {
    return (h || '').toString().toLowerCase().trim();
  });

  function getColIdx(field) {
    var aliases = FIELD_MAP[field] || [];
    for (var i = 0; i < aliases.length; i++) {
      var idx = headers.indexOf(aliases[i].toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  }

  var newRow = new Array(lastCol).fill('');

  Object.keys(campos).forEach(function(field) {
    var colIdx = getColIdx(field);
    if (colIdx >= 0) newRow[colIdx] = campos[field];
  });

  // Número correlativo en columna A si el header es "#"
  if (headers[0] === '#') {
    newRow[0] = hoja.getLastRow();
  }

  hoja.appendRow(newRow);
  SpreadsheetApp.flush();

  return respond({ ok: true, action: 'added', correo: campos.correo || '' });
}

// ── Helper ────────────────────────────────────────────────
function respond(obj) {
  return setCORSHeaders(
    ContentService.createTextOutput(JSON.stringify(obj))
  );
}
