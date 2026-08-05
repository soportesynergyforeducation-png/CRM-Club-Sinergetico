export const config = { runtime: 'edge' };

// Lee el mismo Sheet principal del CRM (SHEET1) que usa index.html, pero
// server-side: las API keys de Google nunca se exponen al que llama a este
// endpoint. Protegido con x-api-key propia (CLUB_SINERGETICO_API_KEY), para
// que Legendar-IA (u otro sistema) pueda preguntar si un correo/teléfono ya
// es socio del Club y si su membresía sigue vigente.

const API_KEY = 'AIzaSyAcHd53OR2vn5Wk1o3p_wwmMe3TwLfOk5Y';
const API_KEY2 = 'AIzaSyDMBEQVQ0d-EeC75-wlfIHiNLzRpg2jtxg';
const SHEET1 = '1IkFQJW8kMcwQ9hwl0ixalQFUyribvDYDahbrBOFQf_g';

// Mismos alias/índices de fallback que SCHEMA_CRM en index.html (solo los
// campos que este endpoint necesita). Si cambian encabezados del Sheet,
// buildColMap() los sigue encontrando por alias; el índice "f" es solo el
// último recurso si ningún alias matchea.
const SCHEMA = {
  correo: { a: ['correo', 'email', 'e-mail', 'correo electrónico'], f: 2 },
  telefono: { a: ['teléfono', 'telefono', 'tel', 'phone'], f: 4 },
  inscripcion: {
    a: [
      'fecha de inscripción',
      'fecha de inscripcion',
      'inscripción',
      'inscripcion',
      'fecha inscripción',
      'fecha inscripcion',
    ],
    f: 5,
  },
  finAcceso: { a: ['fin acceso', 'fin de acceso', 'finacceso'], f: 21 },
  status: { a: ['status', 'estado', 'estatus'], f: 24 },
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Réplica de buildColMap() en index.html: encuentra, para cada campo, el
// índice de columna que matchea alguno de sus alias en la fila de
// encabezados (match exacto primero, luego substring), o cae al índice
// posicional fijo si ninguno matchea.
function buildColMap(headerRow) {
  const h = (headerRow || []).map((x) => (x || '').toString().trim().toLowerCase());
  const map = {};
  for (const field in SCHEMA) {
    const def = SCHEMA[field];
    let idx = -1;
    for (const alias of def.a) {
      const fi = h.indexOf(alias.toLowerCase());
      if (fi !== -1) {
        idx = fi;
        break;
      }
    }
    if (idx === -1) {
      const sorted = [...def.a].sort((a, b) => b.length - a.length);
      for (const alias of sorted) {
        const hi = h.findIndex((col) => col && col.includes(alias.toLowerCase()));
        if (hi !== -1) {
          idx = hi;
          break;
        }
      }
    }
    map[field] = idx !== -1 ? idx : def.f;
  }
  return map;
}

function gv(row, map, field) {
  const idx = map[field];
  if (idx === undefined || idx < 0) return '';
  return (row[idx] || '').toString();
}

async function fetchSheetRows() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET1}/values/A:Y?key=${API_KEY}`;
  let res = await fetch(url);
  if (res.status === 429) {
    res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET1}/values/A:Y?key=${API_KEY2}`);
  }
  if (!res.ok) throw new Error(`Sheets API respondió ${res.status}`);
  const data = await res.json();
  return data.values || [];
}

function limpiarDigitos(valor) {
  return (valor || '').toString().replace(/\D/g, '');
}

function ultimos10(valor) {
  const digitos = limpiarDigitos(valor);
  return digitos.length >= 10 ? digitos.slice(-10) : '';
}

// Portado tal cual de la función parseDate() de index.html para leer
// exactamente los mismos formatos que usa el sheet (con hora pegada,
// año de 2 dígitos, serial de Google Sheets, DD/MM legacy, etc.)
function parseDate(s) {
  if (!s) return null;
  s = s.toString().trim();
  const serial = parseInt(s, 10);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const d = new Date(1899, 11, 30);
    d.setDate(d.getDate() + serial);
    return d;
  }
  let m;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+\d{1,2}:\d{2}/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const mo = parseInt(m[1], 10) - 1;
    const dy = parseInt(m[2], 10);
    if (parseInt(m[1], 10) <= 12 && parseInt(m[2], 10) <= 31) {
      return new Date(y, mo, dy);
    }
  }
  m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a > 12) return new Date(y, b - 1, a);
    return new Date(y, a - 1, b);
  }
  const meses = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
  m = s.toLowerCase().match(/(\d{1,2})[/\-\s]([a-z]{3})[/\-\s](\d{2,4})/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, meses[m[2]] || 0, parseInt(m[1], 10));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Igual que getFinAccesoEfectivo() en index.html: si finAcceso está vacío o
// es un valor no-fecha ("—", contiene "REF"/"ERROR"), se calcula como
// inscripción + 1 año exacto.
function finAccesoEfectivo(finAccesoStr, inscripcionStr) {
  const invalido = !finAccesoStr || finAccesoStr === '—' || /REF|ERROR/i.test(finAccesoStr);
  if (!invalido) return parseDate(finAccesoStr);
  const dIns = parseDate(inscripcionStr);
  if (!dIns) return null;
  const dFin = new Date(dIns);
  dFin.setFullYear(dFin.getFullYear() + 1);
  return dFin;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const correoBuscado = (searchParams.get('correo') || '').trim().toLowerCase();
  const telefonoBuscado = searchParams.get('telefono') || '';

  const apiKey = req.headers.get('x-api-key');
  const envKey = (process.env.CLUB_SINERGETICO_API_KEY || '').trim();
  if (!apiKey || apiKey !== envKey) {
    return json({ error: 'No autorizado' }, 401);
  }
  if (!correoBuscado && !telefonoBuscado) {
    return json({ error: 'Falta correo o telefono' }, 400);
  }

  try {
    const rows = await fetchSheetRows();
    if (rows.length === 0) return json({ existe: false });

    const map = buildColMap(rows[0]);
    const dataRows = rows.slice(1);
    const tel10 = ultimos10(telefonoBuscado);

    let fila = null;
    if (correoBuscado) {
      fila = dataRows.find((r) => gv(r, map, 'correo').trim().toLowerCase() === correoBuscado);
    }
    if (!fila && tel10) {
      fila = dataRows.find((r) => ultimos10(gv(r, map, 'telefono')) === tel10);
    }

    if (!fila) return json({ existe: false });

    const status = gv(fila, map, 'status').trim().toUpperCase();
    const fin = finAccesoEfectivo(gv(fila, map, 'finAcceso'), gv(fila, map, 'inscripcion'));
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const activo = status !== 'REVOCADO' && !!fin && fin >= hoy;

    return json({
      existe: true,
      status,
      finAcceso: fin ? fin.toISOString() : null,
      activo,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500);
  }
}
