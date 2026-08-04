function aplicarMenusTodasLasHojas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojas = ss.getSheets();

  const filaInicio = 3;
  const colD = 4;
  const colL = 12;
  const hojaExpirada = 'MEMBRESIA EXPIRADA';

  hojas.forEach(sheet => {
    const nombreHoja = sheet.getName();
    const ultimaFila = sheet.getLastRow();
    if (ultimaFila < filaInicio) return;

    const esExpirada = (nombreHoja === hojaExpirada);
    const plantilla = sheet.getRange(esExpirada ? 'L2:O2' : 'L2:N2');

    const rangoD = sheet.getRange(filaInicio, colD, ultimaFila - filaInicio + 1, 1).getValues();
    const rangoL = sheet.getRange(filaInicio, colL, ultimaFila - filaInicio + 1, 1).getDataValidations();

    for (let i = 0; i < rangoD.length; i++) {
      const valorD = rangoD[i][0];
      const validacionL = rangoL[i][0];
      if (valorD && !validacionL) {
        const filaDestino = filaInicio + i;
        const anchoDestino = esExpirada ? 4 : 3;
        const destino = sheet.getRange(filaDestino, colL, 1, anchoDestino);
        plantilla.copyTo(destino, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      }
    }
  });
}

/***** CONFIG FECHA MIL -> FECHA *****/
const SHEETS_FECHA_OK = new Set([
  "WB MX JS", "WB MX MDL", "WB LATAM", "WB USA", "PRESENCIALES",
  "BLACKS", "BGI", "MAS", "MBA", "CLUB SINERGETICO LITE",
  "BECAS", "RENOVACIONES", "REVOCADOS",
]);

const COL_FECHA_MIL = 1;
const COL_FECHA     = 2;
const START_ROW_FECHA = 3;

function actualizarFechasMil_A_Todas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  SHEETS_FECHA_OK.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;

    const lastRow = sh.getLastRow();
    if (lastRow < START_ROW_FECHA) return;

    const numRows = lastRow - START_ROW_FECHA + 1;
    const aRange = sh.getRange(START_ROW_FECHA, COL_FECHA_MIL, numRows, 1);
    const bRange = sh.getRange(START_ROW_FECHA, COL_FECHA, numRows, 1);

    const aValues = aRange.getValues();
    const bValues = bRange.getValues();

    const newB = bValues.map(([b], i) => {
      const v = aValues[i][0];
      if (b !== "" && b !== null) return [b];
      if (v === "" || v === null) return [b];

      let ms = null;
      if (v instanceof Date) {
        ms = v.getTime();
      } else if (typeof v === "number") {
        ms = v;
      } else if (typeof v === "string") {
        const s = v.trim();
        if (/^\d+(\.\d+)?$/.test(s)) {
          ms = Number(s);
        } else {
          const parsed = Date.parse(s);
          if (isFinite(parsed)) ms = parsed;
        }
      }

      if (!isFinite(ms)) return [b];
      if (ms > 0 && ms < 1e11) ms = ms * 1000;

      const d = new Date(ms);
      return [new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))];
    });

    bRange.setValues(newB);
    bRange.setNumberFormat("dd-mmm");
  });
}

/***** RECUPERAR FECHAS B DESDE BACKUP *****/
function recuperarFechasB_desdeBackup() {
  const BACKUP_SPREADSHEET_ID = "1NFL_B-aYrcXmZ5xXxs41FoudBp0_fsqM5tI4g1rdfOw";
  const ssActual = SpreadsheetApp.getActiveSpreadsheet();
  const ssBackup = SpreadsheetApp.openById(BACKUP_SPREADSHEET_ID);

  SHEETS_FECHA_OK.forEach(name => {
    const shA = ssActual.getSheetByName(name);
    const shB = ssBackup.getSheetByName(name);
    if (!shA || !shB) return;

    const lastA = shA.getLastRow();
    const lastB = shB.getLastRow();
    const last = Math.min(lastA, lastB);
    if (last < START_ROW_FECHA) return;

    const numRows = last - START_ROW_FECHA + 1;
    const bActualRange = shA.getRange(START_ROW_FECHA, COL_FECHA, numRows, 1);
    const bBackupRange = shB.getRange(START_ROW_FECHA, COL_FECHA, numRows, 1);

    const bActual = bActualRange.getValues();
    const bBackup = bBackupRange.getValues();
    let changed = false;

    const merged = bActual.map(([cur], i) => {
      if (cur !== "" && cur !== null) return [cur];
      const old = bBackup[i][0];
      if (old !== "" && old !== null) { changed = true; return [old]; }
      return [cur];
    });

    if (changed) {
      bActualRange.setValues(merged);
      bActualRange.setNumberFormat("dd-mmm");
    }
  });
}

// ── CRM WRITER — Skool v3 ──
var SECRET_SKOOL = 'CS-crm-2026';

function doGet(e) {
  return respuesta({ ok: true, msg: 'Skool Writer v3 activo' });
}

function doPost(e) {
  try {
    var secret = e.parameter.secret || '';
    if (secret !== SECRET_SKOOL) return respuesta({ ok: false, error: 'No autorizado' });

    var registros = [];
    try { registros = JSON.parse(e.parameter.registros || '[]'); } catch(ex) {}
    if (!registros.length) return respuesta({ ok: false, error: 'Sin registros' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var agregados = 0;
    var errores = [];

    registros.forEach(function(r) {
      try {
        var nombreHoja = r.pestana || _getHojaNombre(r.evento || '');
        var hoja = ss.getSheetByName(nombreHoja);
        if (!hoja) {
          hoja = ss.getSheetByName('PRESENCIALES');
          if (!hoja) { errores.push(r.correo + ' (hoja no encontrada: ' + nombreHoja + ')'); return; }
        }

        // Buscar primera fila vacía desde fila 3 (columna D) y verificar duplicado
        var lastRow = hoja.getLastRow();
        var primeraVacia = lastRow + 1;
        if (lastRow >= 3) {
          var correosCol = hoja.getRange(3, 4, lastRow - 2, 1).getValues();
          var duplicado = false;
          var encontradoVacia = false;
          for (var i = 0; i < correosCol.length; i++) {
            var val = (correosCol[i][0] || '').toString().toLowerCase().trim();
            if (val === r.correo.toLowerCase().trim()) { duplicado = true; break; }
            if (!encontradoVacia && val === '') {
              primeraVacia = 3 + i;
              encontradoVacia = true;
            }
          }
          if (duplicado) { errores.push(r.correo + ' (ya existe)'); return; }
          if (!encontradoVacia) primeraVacia = lastRow + 1;
        }

        var fi = new Date(r.fechaInscripcion);
        var tipoMem = r.tipoMemFinal || _calcTipoMem(r.membresia, r.evento, nombreHoja);

        hoja.getRange(primeraVacia, 2).setValue(fi).setNumberFormat('dd-mmm');    // B = Fecha
        hoja.getRange(primeraVacia, 3).setValue(r.nombre);                         // C = Nombre
        hoja.getRange(primeraVacia, 4).setValue(r.correo);                         // D = Correo
        hoja.getRange(primeraVacia, 6).setValue(r.telefono);                       // F = Teléfono
        if (tipoMem) hoja.getRange(primeraVacia, 9).setValue(tipoMem);            // I = Tipo membresía
        // K = No se escribe — la fórmula ARRAYFORMULA lo calcula automáticamente
        hoja.getRange(primeraVacia, 15).setValue(r.evento);                        // O = Evento

        agregados++;
      } catch(ex) {
        errores.push(r.correo + ': ' + ex.message);
      }
    });

    return respuesta({ ok: true, agregados: agregados, errores: errores });

  } catch(err) {
    return respuesta({ ok: false, error: err.message });
  }
}

function _getHojaNombre(evento) {
  var ev = (evento || '').toUpperCase().trim();
  if (ev.indexOf('EP') === 0) return 'PRESENCIALES';
  if (ev === 'USA-WJS' || ev.indexOf('USA') === 0) return 'WB USA';
  if (ev.indexOf('WJS-MX') === 0) return 'WB MX JS';
  if (ev.indexOf('WMDL-MX') === 0 || ev.indexOf('WB MDL') === 0) return 'WB MX MDL';
  if (ev.indexOf('LATAM') === 0) return 'WB LATAM';
  if (ev.indexOf('BLACK') === 0) return 'BLACKS';
  if (ev === 'MBA') return 'MBA';
  if (ev.indexOf('MAS') === 0 || ev.indexOf('MÁS') === 0) return 'MAS';
  return 'PRESENCIALES';
}

function _calcTipoMem(membresia, evento, hoja) {
  var mem = (membresia || '').toString().toUpperCase().trim();
  var h = (hoja || '').toUpperCase();
  var ev = (evento || '').toUpperCase();

  var metodo;
  if (h === 'WB USA') metodo = 'KAJABI';
  else if (h === 'WB MX JS' || h === 'WB MX MDL' || h === 'WB LATAM') metodo = 'HOTMART';
  else metodo = (ev.indexOf('EPUS') === 0 || ev.indexOf('EPCA') === 0) ? 'STRIPE' : 'MP';

  if (mem.indexOf('1A') >= 0 || mem === '12') return '1A | ' + metodo;
  if (mem.indexOf('6M') >= 0 || mem === '6') return '6M | ' + metodo;
  if (mem.indexOf('3M') >= 0 || mem === '3') return '3M | ' + metodo;
  if (mem.indexOf('|') >= 0) return mem;
  return mem;
}

// ContentService.TextOutput no soporta addHeader() (eso es de HtmlService).
// Los endpoints /exec ya son legibles cross-origin por defecto en deploys
// "Cualquier usuario", así que basta con fijar el MIME type.
function respuesta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
