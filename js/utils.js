// Utilidades compartidas: HTML seguro, dinero, fechas, avisos, ventanas y errores.
import { icono } from './icons.js';

// ---------------------------------------------------------------------
// HTML seguro: todo valor interpolado se escapa salvo que sea Raw.
// ---------------------------------------------------------------------
export class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ''));

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

function renderValor(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw || v.__raw === true) return v.s;
  if (Array.isArray(v)) return v.map(renderValor).join('');
  return esc(v);
}

export function html(partes, ...valores) {
  let out = partes[0];
  for (let i = 0; i < valores.length; i++) out += renderValor(valores[i]) + partes[i + 1];
  return new Raw(out);
}

export function pintar(el, contenido) {
  el.innerHTML = renderValor(contenido);
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

// ---------------------------------------------------------------------
// Dinero (USD). Los totales se calculan en centavos para evitar errores
// de redondeo de punto flotante.
// ---------------------------------------------------------------------
const formatoUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const formatoEntero = new Intl.NumberFormat('en-US');

export const aCentavos = (v) => Math.round(Number(v || 0) * 100);
export const dinero = (v) => formatoUSD.format(Number(v || 0));
export const dineroCentavos = (c) => formatoUSD.format((c || 0) / 100);
export const entero = (n) => formatoEntero.format(Number(n || 0));

// Devuelve el monto normalizado ("1234.50") o null si no es válido.
export function parsearMonto(texto) {
  const limpio = String(texto ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  if (!(n > 0) || n > 9999999999.99) return null;
  return n.toFixed(2);
}
export function parsearMontoOCero(texto) {
  const limpio = String(texto ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  if (n < 0 || n > 9999999999.99) return null;
  return n.toFixed(2);
}

// Monto en letras (español): 1250.50 → "Mil doscientos cincuenta dólares con 50/100"
const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos',
  'setecientos', 'ochocientos', 'novecientos'];

function menorMil(n) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  let texto = CENTENAS[c];
  if (r) {
    const t = r < 30 ? UNIDADES[r] : DECENAS[Math.floor(r / 10)] + (r % 10 ? ' y ' + UNIDADES[r % 10] : '');
    texto = texto ? `${texto} ${t}` : t;
  }
  return texto;
}
function apocopar(s) {
  if (s.endsWith('veintiuno')) return s.slice(0, -9) + 'veintiún';
  if (s.endsWith('uno')) return s.slice(0, -3) + 'un';
  return s;
}
function numeroEnLetras(n) {
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? 'un millón' : `${apocopar(numeroEnLetras(millones))} millones`);
  if (miles) partes.push(miles === 1 ? 'mil' : `${apocopar(menorMil(miles))} mil`);
  if (resto) partes.push(menorMil(resto));
  return partes.join(' ');
}
export function montoEnLetras(monto) {
  const centavos = aCentavos(monto);
  const dolares = Math.floor(centavos / 100);
  const cent = String(centavos % 100).padStart(2, '0');
  let texto;
  if (dolares === 1) texto = 'un dólar';
  else {
    texto = apocopar(numeroEnLetras(dolares));
    texto += dolares >= 1e6 && dolares % 1e6 === 0 ? ' de dólares' : ' dólares';
  }
  texto = `${texto} con ${cent}/100`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ---------------------------------------------------------------------
// Fechas. Las fechas de aportación son DATE (AAAA-MM-DD) y se manejan
// como texto; las marcas de tiempo se muestran en la zona de la iglesia.
// ---------------------------------------------------------------------
let zonaHoraria = 'America/New_York';
export function establecerZonaHoraria(tz) { if (tz) zonaHoraria = tz; }
export function obtenerZonaHoraria() { return zonaHoraria; }

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

function partesEnZona(fecha, tz = zonaHoraria) {
  const p = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  for (const { type, value } of fmt.formatToParts(fecha)) p[type] = value;
  return p;
}

export function hoyISO() {
  const p = partesEnZona(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}
export const anioActual = () => Number(hoyISO().slice(0, 4));
export const inicioAnio = (anio = anioActual()) => `${anio}-01-01`;
export const finAnio = (anio = anioActual()) => `${anio}-12-31`;
export function inicioMes(iso = hoyISO()) { return iso.slice(0, 8) + '01'; }
export function finMes(iso = hoyISO()) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function sumarDias(iso, dias) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

// "2026-09-22" → "09/22/2026"
export function fecha(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
}
// "2026-09-22" → "22 de septiembre de 2026"
export function fechaLarga(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}
// Marca de tiempo → "09/22/2026, 3:05 PM" en la zona de la iglesia
export function fechaHora(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit',
  }).format(new Date(ts));
}

// Inicio del día (00:00 en la zona de la iglesia) expresado en UTC ISO.
export function inicioDiaUTC(iso, tz = zonaHoraria) {
  const [y, m, d] = iso.split('-').map(Number);
  const objetivo = Date.UTC(y, m - 1, d, 0, 0, 0);
  let utc = objetivo;
  for (let i = 0; i < 3; i++) {
    const p = partesEnZona(new Date(utc), tz);
    const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    utc -= comoUTC - objetivo;
  }
  return new Date(utc).toISOString();
}

export function fechaValida(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// ---------------------------------------------------------------------
// Búsqueda: texto normalizado (minúsculas, sin acentos) igual que en la BD.
// ---------------------------------------------------------------------
export function normalizarBusqueda(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export const palabrasBusqueda = (s) => normalizarBusqueda(s).split(' ').filter(Boolean).slice(0, 6);

// ---------------------------------------------------------------------
// Varios
// ---------------------------------------------------------------------
export function retrasar(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const nombreCompleto = (m) => [m?.nombre, m?.apellido].filter(Boolean).join(' ');

export function lineasDireccion(m) {
  const lineas = [];
  if (m?.direccion) lineas.push(m.direccion);
  const ciudad = [m?.ciudad, [m?.estado, m?.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (ciudad) lineas.push(ciudad);
  return lineas;
}

export function cargando(texto = 'Cargando…') {
  return html`<div class="cargando"><div class="spinner sm" aria-hidden="true"></div><span>${texto}</span></div>`;
}

export function alerta(tipo, contenido) {
  const iconos = { info: 'info', exito: 'check-circle', error: 'alert-triangle', advertencia: 'alert-triangle' };
  return html`<div class="alerta ${tipo}" role="${tipo === 'error' ? 'alert' : 'status'}">${icono(iconos[tipo] || 'info')}<div>${contenido}</div></div>`;
}

// Recupera todas las filas de una consulta paginando de 1000 en 1000.
export async function obtenerTodos(construirConsulta, tamano = 1000) {
  const filas = [];
  for (let desde = 0; ; desde += tamano) {
    const { data, error } = await construirConsulta().range(desde, desde + tamano - 1);
    if (error) throw error;
    filas.push(...data);
    if (data.length < tamano) break;
  }
  return filas;
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// CSV compatible con Excel (UTF-8 con BOM) y protegido contra inyección de fórmulas.
export function descargarCSV(nombre, encabezados, filas) {
  const celda = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const contenido = [encabezados, ...filas].map((f) => f.map(celda).join(',')).join('\r\n');
  descargarBlob(new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8' }), nombre);
}

export function marcaArchivo() {
  const p = partesEnZona(new Date());
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

// ---------------------------------------------------------------------
// Mensajes de error comprensibles
// ---------------------------------------------------------------------
export function mensajeError(err) {
  if (!err) return 'Ocurrió un error inesperado.';
  const codigo = err.code || '';
  const msg = err.message || String(err);
  if (codigo === 'P0001') return msg;
  if (codigo === '23505') {
    if (msg.includes('fondos_')) return 'Ya existe un fondo con ese nombre.';
    if (msg.includes('metodos_pago_')) return 'Ya existe un método de pago con ese nombre.';
    if (msg.includes('aportaciones_corrige')) return 'Esta aportación ya fue corregida anteriormente.';
    if (msg.includes('numero_recibo')) return 'El número de recibo ya existe. Intente nuevamente.';
    return 'Ya existe un registro con esos datos (valor duplicado).';
  }
  if (codigo === '23503') return 'No se puede completar la operación porque existen registros relacionados.';
  if (codigo === '23514') {
    if (msg.includes('email')) return 'El correo electrónico no tiene un formato válido.';
    if (msg.includes('ein')) return 'El EIN debe tener el formato 12-3456789.';
    if (msg.includes('monto')) return 'El monto debe ser mayor que $0.00.';
    return 'Los datos no cumplen las reglas de validación del sistema.';
  }
  if (codigo === '23502') return 'Falta un dato obligatorio.';
  if (codigo === '22P02' || codigo === '22007' || codigo === '22008') return 'Uno de los datos tiene un formato no válido.';
  if (codigo === '42501' || /row-level security|permission denied|No autorizado/i.test(msg)) {
    return 'No tiene autorización para realizar esta operación.';
  }
  if (codigo === 'PGRST301' || codigo === 'PGRST303' || /JWT|token/i.test(msg)) {
    return 'Su sesión expiró. Inicie sesión nuevamente.';
  }
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) {
    return 'No se pudo conectar con el servidor. Verifique su conexión a Internet.';
  }
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(msg)) return 'El correo electrónico aún no ha sido confirmado.';
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
  return msg;
}

// ---------------------------------------------------------------------
// Avisos flotantes
// ---------------------------------------------------------------------
export function aviso(mensaje, tipo = 'exito', ms = 4500) {
  const cont = document.getElementById('avisos');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  const ic = tipo === 'error' ? 'alert-triangle' : tipo === 'info' ? 'info' : 'check-circle';
  pintar(el, html`${icono(ic)}<div>${mensaje}</div>`);
  cont.appendChild(el);
  setTimeout(() => el.remove(), tipo === 'error' ? Math.max(ms, 7000) : ms);
}

// ---------------------------------------------------------------------
// Ventanas modales
// ---------------------------------------------------------------------
const modalesAbiertos = new Set();

export function cerrarModales() {
  for (const m of [...modalesAbiertos]) m.cerrar();
}

export function abrirModal({ titulo, contenido, pie = null, ancho = false, alCerrar = null }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  const idTitulo = 'modal-titulo-' + Math.random().toString(36).slice(2, 8);
  pintar(fondo, html`
    <div class="modal ${ancho ? 'ancho' : ''}" role="dialog" aria-modal="true" aria-labelledby="${idTitulo}">
      <div class="modal-cabecera">
        <h2 id="${idTitulo}">${titulo}</h2>
        <button type="button" class="btn btn-texto btn-icono" data-cerrar aria-label="Cerrar">${icono('x')}</button>
      </div>
      <div class="modal-cuerpo">${contenido}</div>
      ${pie ? html`<div class="modal-pie">${pie}</div>` : ''}
    </div>`);
  document.body.appendChild(fondo);
  const anterior = document.activeElement;
  let ocupado = false;

  const api = {
    el: fondo,
    cuerpo: $('.modal-cuerpo', fondo),
    pie: $('.modal-pie', fondo),
    set ocupado(v) { ocupado = v; },
    cerrar() {
      if (!modalesAbiertos.has(api)) return;
      modalesAbiertos.delete(api);
      document.removeEventListener('keydown', teclas);
      fondo.remove();
      if (alCerrar) alCerrar();
      if (anterior && anterior.focus) anterior.focus();
    },
  };
  function teclas(e) {
    if (e.key === 'Escape' && !ocupado) api.cerrar();
  }
  document.addEventListener('keydown', teclas);
  fondo.addEventListener('mousedown', (e) => {
    if (e.target === fondo && !ocupado) api.cerrar();
  });
  $$('[data-cerrar]', fondo).forEach((b) => b.addEventListener('click', () => { if (!ocupado) api.cerrar(); }));
  modalesAbiertos.add(api);
  const enfocable = fondo.querySelector('.modal-cuerpo input, .modal-cuerpo textarea, .modal-cuerpo select, .modal-pie .btn-primario, .modal-pie .btn-peligro');
  (enfocable || $('[data-cerrar]', fondo)).focus();
  return api;
}

export function confirmar({ titulo, mensaje, textoConfirmar = 'Confirmar', peligro = false }) {
  return new Promise((resolver) => {
    let resultado = false;
    const m = abrirModal({
      titulo,
      contenido: html`<div>${mensaje}</div>`,
      pie: html`<button type="button" class="btn" data-cerrar>Cancelar</button>
                <button type="button" class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" data-ok>${textoConfirmar}</button>`,
      alCerrar: () => resolver(resultado),
    });
    $('[data-ok]', m.el).addEventListener('click', () => { resultado = true; m.cerrar(); });
  });
}

// Solicita un texto obligatorio (p. ej. motivo de anulación).
export function solicitarTexto({ titulo, mensaje, etiqueta, minimo = 5, textoConfirmar = 'Aceptar', peligro = false }) {
  return new Promise((resolver) => {
    let resultado = null;
    const m = abrirModal({
      titulo,
      contenido: html`
        <div class="formulario">
          ${mensaje ? html`<div>${mensaje}</div>` : ''}
          <div class="campo">
            <label for="texto-solicitado" class="requerido">${etiqueta}</label>
            <textarea id="texto-solicitado" class="entrada" maxlength="500" rows="3"></textarea>
            <div class="ayuda">Mínimo ${minimo} caracteres.</div>
          </div>
        </div>`,
      pie: html`<button type="button" class="btn" data-cerrar>Cancelar</button>
                <button type="button" class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" data-ok>${textoConfirmar}</button>`,
      alCerrar: () => resolver(resultado),
    });
    const area = $('#texto-solicitado', m.el);
    $('[data-ok]', m.el).addEventListener('click', () => {
      const v = area.value.trim();
      if (v.length < minimo) {
        area.setAttribute('aria-invalid', 'true');
        area.focus();
        return;
      }
      resultado = v;
      m.cerrar();
    });
  });
}
