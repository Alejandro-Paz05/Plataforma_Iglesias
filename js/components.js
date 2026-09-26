// Componentes reutilizables de la interfaz.
import { sb } from './supabase.js';
import {
  html, pintar, $, $$, retrasar, palabrasBusqueda, nombreCompleto, mensajeError, entero,
} from './utils.js';

export const COLUMNAS_MIEMBRO =
  'id, numero_miembro, nombre, apellido, direccion, ciudad, estado, zip, telefono, email, tipo_persona, activo, familia_id, es_anonimo';

export const ESTADOS_APORTACION = {
  REGISTRADA: { texto: 'Registrada', clase: 'verde' },
  ANULADA: { texto: 'Anulada', clase: 'rojo' },
  CORREGIDA: { texto: 'Corregida', clase: 'ambar' },
};

export function insigniaEstado(estado) {
  const e = ESTADOS_APORTACION[estado] || { texto: estado, clase: 'gris' };
  return html`<span class="insignia ${e.clase}">${e.texto}</span>`;
}

export function insigniaActivo(activo) {
  return activo
    ? html`<span class="insignia verde">Activo</span>`
    : html`<span class="insignia gris">Inactivo</span>`;
}

// <option> a partir de una lista [{ valor, texto }]
export function opciones(items, seleccionado) {
  return items.map((i) => html`<option value="${i.valor}" ${String(i.valor) === String(seleccionado ?? '') ? 'selected' : ''}>${i.texto}</option>`);
}

export function uuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const b = window.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function cargarMiembro(id) {
  const { data, error } = await sb.from('miembros').select(COLUMNAS_MIEMBRO).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Registro del sistema que recibe las aportaciones anónimas (null si falta la migración 08).
export async function cargarAnonimo() {
  const { data, error } = await sb.from('miembros').select(COLUMNAS_MIEMBRO).eq('es_anonimo', true).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------
// Familias
// ---------------------------------------------------------------------
export async function cargarFamilias() {
  const { data, error } = await sb.from('familias').select('*').order('nombre');
  if (error) throw error;
  return data;
}

export async function cargarFamilia(id) {
  const { data, error } = await sb.from('familias').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Todos los miembros de la familia (activos e inactivos), por número.
export async function miembrosDeFamilia(familiaId) {
  const { data, error } = await sb.from('miembros').select(COLUMNAS_MIEMBRO).eq('familia_id', familiaId).order('numero_miembro');
  if (error) throw error;
  return data;
}

// "José y María", "Ana, Luis e Isabel"
function unirNombres(lista) {
  if (lista.length < 2) return lista[0] || '';
  const ultimo = lista[lista.length - 1];
  const conjuncion = /^h?i(?![aeiouáéíóú])/i.test(ultimo) ? 'e' : 'y';
  return `${lista.slice(0, -1).join(', ')} ${conjuncion} ${ultimo}`;
}

// Cómo se dirige la carta: el nombre configurado o "José y María Sariñana".
export function nombreCartaFamilia(familia, miembros) {
  if (familia.nombre_carta) return familia.nombre_carta;
  if (!miembros.length) return familia.nombre;
  const mismoApellido = new Set(miembros.map((m) => m.apellido)).size === 1;
  return mismoApellido
    ? `${unirNombres(miembros.map((m) => m.nombre))} ${miembros[0].apellido}`
    : unirNombres(miembros.map(nombreCompleto));
}

// Destinatario de una carta o estado de cuenta familiar, con la misma forma
// que un miembro (nombre, dirección, número) para reutilizar los documentos.
// La dirección es la del primer miembro que tenga una registrada.
export function destinatarioFamilia(familia, miembros) {
  const conDireccion = miembros.find((m) => m.direccion) || {};
  return {
    id: familia.id,
    es_familia: true,
    familia,
    miembros,
    numero_miembro: familia.numero_familia,
    nombre: nombreCartaFamilia(familia, miembros),
    apellido: '',
    direccion: conDireccion.direccion || null,
    ciudad: conDireccion.ciudad || null,
    estado: conDireccion.estado || null,
    zip: conDireccion.zip || null,
    email: conDireccion.email || null,
  };
}

// Destinatario "Persona / Familia" (carta anual y estado de cuenta).
export function camposDestinatario(familias, familiaInicial) {
  return html`
    <div class="fila-campos">
      <div class="campo">
        <label for="tipo-destinatario">Para</label>
        <select id="tipo-destinatario" class="entrada">${opciones([
          { valor: 'persona', texto: 'Una persona' },
          { valor: 'familia', texto: 'Una familia (conjunto)' },
        ], familiaInicial ? 'familia' : 'persona')}</select>
      </div>
      <div class="campo" id="campo-familia" ${familiaInicial ? '' : 'hidden'}>
        <label class="requerido" for="familia">Familia</label>
        <select id="familia" class="entrada">${opciones([
          { valor: '', texto: familias.length ? 'Seleccione…' : 'No hay familias registradas' },
          ...familias.map((f) => ({ valor: f.id, texto: `${f.nombre} (${f.numero_familia})` })),
        ], familiaInicial?.id || '')}</select>
      </div>
    </div>
    <div class="campo" id="campo-persona" ${familiaInicial ? 'hidden' : ''}>
      <label class="requerido" for="selector-miembro">Miembro / donante</label>
      <div id="miembro"></div>
    </div>`;
}

// Devuelve una función que indica si se eligió familia y cuál.
export function enlazarDestinatario(el) {
  $('#tipo-destinatario', el).addEventListener('change', (e) => {
    const familia = e.target.value === 'familia';
    $('#campo-familia', el).hidden = !familia;
    $('#campo-persona', el).hidden = familia;
  });
  return () => ({
    esFamilia: $('#tipo-destinatario', el).value === 'familia',
    familiaId: $('#familia', el).value || null,
  });
}

// Destinatario de una familia con todos sus miembros.
export async function cargarDestinatarioFamilia(id) {
  const [familia, miembros] = await Promise.all([cargarFamilia(id), miembrosDeFamilia(id)]);
  return familia ? destinatarioFamilia(familia, miembros) : null;
}

// ---------------------------------------------------------------------
// Paginación
// ---------------------------------------------------------------------
export function montarPaginacion(contenedor, { total, pagina, tamano, alCambiar }) {
  const paginas = Math.max(1, Math.ceil(total / tamano));
  if (total <= tamano) {
    pintar(contenedor, total ? html`<div class="paginacion"><span>${entero(total)} registro(s)</span></div>` : '');
    return;
  }
  const desde = (pagina - 1) * tamano + 1;
  const hasta = Math.min(total, pagina * tamano);
  pintar(contenedor, html`
    <div class="paginacion">
      <span>Mostrando ${entero(desde)}–${entero(hasta)} de ${entero(total)}</span>
      <div class="acciones">
        <button type="button" class="btn" data-pag="-1" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>Página ${pagina} de ${paginas}</span>
        <button type="button" class="btn" data-pag="1" ${pagina >= paginas ? 'disabled' : ''}>Siguiente</button>
      </div>
    </div>`);
  $$('[data-pag]', contenedor).forEach((b) =>
    b.addEventListener('click', () => alCambiar(pagina + Number(b.dataset.pag))));
}

// ---------------------------------------------------------------------
// Selector de miembro/donante con búsqueda
// ---------------------------------------------------------------------
export function selectorMiembro(contenedor, opcionesSelector = {}) {
  const {
    inicial = null,
    soloActivos = true,
    // Cartas, estados de cuenta y familias no aplican al donante anónimo.
    excluirAnonimo = false,
    alCambiar = () => {},
    idEntrada = 'selector-miembro',
    placeholder = 'Buscar por nombre, apellido, número, teléfono o email…',
  } = opcionesSelector;

  let seleccionado = inicial;
  let resultados = [];
  let activo = -1;
  let solicitud = 0;

  function render() {
    if (seleccionado) {
      pintar(contenedor, html`
        <div class="selector-elegido">
          <div>
            <strong>${nombreCompleto(seleccionado)}</strong><span class="num">${seleccionado.numero_miembro}</span>
            ${seleccionado.activo === false ? html` <span class="insignia gris">Inactivo</span>` : ''}
          </div>
          <button type="button" class="btn btn-texto" data-cambiar>Cambiar</button>
        </div>`);
      $('[data-cambiar]', contenedor).addEventListener('click', () => {
        seleccionado = null;
        render();
        alCambiar(null);
        $('input', contenedor)?.focus();
      });
      return;
    }

    pintar(contenedor, html`
      <div class="selector">
        <input id="${idEntrada}" class="entrada" type="search" autocomplete="off" spellcheck="false"
               placeholder="${placeholder}" role="combobox" aria-expanded="false"
               aria-autocomplete="list" aria-controls="${idEntrada}-lista">
        <div class="selector-lista" id="${idEntrada}-lista" role="listbox" hidden></div>
      </div>`);

    const entrada = $('input', contenedor);
    const buscarRetrasado = retrasar(() => buscar(entrada.value), 250);
    entrada.addEventListener('input', buscarRetrasado);
    entrada.addEventListener('focus', () => buscar(entrada.value));
    entrada.addEventListener('blur', () => setTimeout(cerrarLista, 120));
    entrada.addEventListener('keydown', (e) => {
      const lista = $('.selector-lista', contenedor);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (lista.hidden) { buscar(entrada.value); return; }
        if (!resultados.length) return;
        activo = (activo + (e.key === 'ArrowDown' ? 1 : -1) + resultados.length) % resultados.length;
        pintarResultados();
      } else if (e.key === 'Enter') {
        if (!lista.hidden && resultados[activo]) {
          e.preventDefault();
          elegir(resultados[activo]);
        }
      } else if (e.key === 'Escape') {
        cerrarLista();
      }
    });
  }

  function mostrarLista(contenido) {
    const lista = $('.selector-lista', contenedor);
    const entrada = $('input', contenedor);
    if (!lista) return;
    pintar(lista, contenido);
    lista.hidden = false;
    entrada?.setAttribute('aria-expanded', 'true');
  }

  function cerrarLista() {
    const lista = $('.selector-lista', contenedor);
    if (lista) lista.hidden = true;
    $('input', contenedor)?.setAttribute('aria-expanded', 'false');
  }

  async function buscar(texto) {
    const n = ++solicitud;
    mostrarLista(html`<div class="selector-vacio">Buscando…</div>`);
    let q = sb.from('miembros').select(COLUMNAS_MIEMBRO).order('apellido').order('nombre').limit(12);
    if (soloActivos) q = q.eq('activo', true);
    if (excluirAnonimo) q = q.eq('es_anonimo', false);
    for (const p of palabrasBusqueda(texto)) q = q.ilike('texto_busqueda', `%${p}%`);
    const { data, error } = await q;
    if (n !== solicitud || seleccionado) return;
    if (error) {
      mostrarLista(html`<div class="selector-vacio">${mensajeError(error)}</div>`);
      return;
    }
    resultados = data || [];
    activo = resultados.length ? 0 : -1;
    pintarResultados();
  }

  function pintarResultados() {
    if (!resultados.length) {
      mostrarLista(html`<div class="selector-vacio">No se encontraron miembros${soloActivos ? ' activos' : ''}.
        <a href="#/miembros/nuevo">Registrar nuevo miembro</a></div>`);
      return;
    }
    mostrarLista(resultados.map((m, i) => html`
      <div class="selector-opcion ${i === activo ? 'activa' : ''}" role="option" aria-selected="${i === activo ? 'true' : 'false'}" data-i="${i}">
        <span>${nombreCompleto(m)}</span><small>${m.numero_miembro}</small>
      </div>`));
    $$('.selector-opcion', contenedor).forEach((op) => {
      op.addEventListener('mousedown', (e) => {
        e.preventDefault();
        elegir(resultados[Number(op.dataset.i)]);
      });
    });
    $('.selector-opcion.activa', contenedor)?.scrollIntoView({ block: 'nearest' });
  }

  function elegir(m) {
    seleccionado = m;
    render();
    alCambiar(m);
  }

  render();

  return {
    obtener: () => seleccionado,
    establecer(m) { seleccionado = m; render(); },
    enfocar() { ($('input', contenedor) || $('button', contenedor))?.focus(); },
  };
}
