// Bitácora de operaciones (solo lectura).
import { sb } from '../supabase.js';
import {
  html, pintar, $, $$, alerta, abrirModal, mensajeError, retrasar, fechaHora, hoyISO, sumarDias, inicioDiaUTC,
  dinero, fecha,
} from '../utils.js';
import { icono } from '../icons.js';
import { montarPaginacion, opciones } from '../components.js';

const TAMANO = 50;
const filtros = { desde: sumarDias(hoyISO(), -30), hasta: hoyISO(), accion: '', tabla: '', texto: '', pagina: 1 };

const ACCIONES = [
  'CREAR', 'MODIFICAR', 'ELIMINAR', 'ACTIVAR', 'DESACTIVAR', 'ANULAR', 'VINCULAR_CORRECCION',
  'INICIAR_SESION', 'CERRAR_SESION', 'GENERAR_RECIBO', 'GENERAR_ESTADO_CUENTA', 'GENERAR_CARTA_ANUAL',
  'GENERAR_REPORTE', 'EXPORTAR_DATOS', 'ARCHIVAR_DOCUMENTO', 'ACTUALIZAR_LOGO',
];
const TABLAS = [
  { valor: 'aportaciones', texto: 'Aportaciones' },
  { valor: 'miembros', texto: 'Miembros' },
  { valor: 'fondos', texto: 'Fondos' },
  { valor: 'metodos_pago', texto: 'Métodos de pago' },
  { valor: 'configuracion_iglesia', texto: 'Configuración' },
  { valor: 'administradores', texto: 'Administradores' },
];
const NOMBRE_TABLA = Object.fromEntries(TABLAS.map((t) => [t.valor, t.texto]));

const CLASE_ACCION = {
  CREAR: 'verde', ACTIVAR: 'verde', MODIFICAR: '', ELIMINAR: 'rojo', ANULAR: 'rojo', DESACTIVAR: 'gris',
  VINCULAR_CORRECCION: 'ambar', INICIAR_SESION: 'gris', CERRAR_SESION: 'gris',
};

const ETIQUETAS_CAMPO = {
  numero_miembro: 'Número de miembro', nombre: 'Nombre', apellido: 'Apellido', direccion: 'Dirección', ciudad: 'Ciudad',
  estado: 'Estado', zip: 'ZIP', telefono: 'Teléfono', email: 'Email', fecha_ingreso: 'Fecha de ingreso',
  tipo_persona: 'Tipo de persona', activo: 'Activo', notas: 'Notas', numero_recibo: 'Número de recibo',
  miembro_id: 'Miembro (id)', fecha_aportacion: 'Fecha de aportación', fondo_id: 'Fondo (id)', monto: 'Monto',
  metodo_pago_id: 'Método de pago (id)', referencia_pago: 'Referencia', bienes_servicios: 'Bienes o servicios',
  valor_bienes_servicios: 'Valor de bienes/servicios', descripcion_bienes_servicios: 'Descripción de bienes/servicios',
  descripcion: 'Descripción', motivo_anulacion: 'Motivo de anulación', anulada_at: 'Anulada el', anulada_by: 'Anulada por (id)',
  corrige_aportacion_id: 'Corrige a (id)', corregida_por_id: 'Corregida por (id)', created_at: 'Creado', created_by: 'Creado por (id)',
  updated_at: 'Actualizado', updated_by: 'Actualizado por (id)', orden: 'Orden', nombre_iglesia: 'Nombre de la iglesia',
  lema: 'Lema', ein: 'EIN', logo_url: 'Logo', sitio_web: 'Sitio web', nombre_responsable: 'Responsable',
  cargo_responsable: 'Cargo', zona_horaria: 'Zona horaria', texto_carta_sin_bienes: 'Carta (sin bienes)',
  texto_carta_con_bienes: 'Carta (con bienes)', texto_carta_cierre: 'Cierre de carta', texto_pie_recibo: 'Pie de recibo',
};

export async function render({ cont, titulo }) {
  titulo('Bitácora');
  pintar(cont, html`
    <div class="cabecera">
      <div><h2>Bitácora de operaciones</h2>
        <p>Registro inmutable de las operaciones realizadas en el sistema. No puede modificarse ni eliminarse.</p></div>
    </div>
    <form class="filtros" id="filtros" role="search">
      <div class="campo"><label for="b-desde">Desde</label><input id="b-desde" type="date" class="entrada" value="${filtros.desde}"></div>
      <div class="campo"><label for="b-hasta">Hasta</label><input id="b-hasta" type="date" class="entrada" value="${filtros.hasta}"></div>
      <div class="campo"><label for="b-accion">Acción</label>
        <select id="b-accion" class="entrada">${opciones([{ valor: '', texto: 'Todas' }, ...ACCIONES.map((a) => ({ valor: a, texto: a.replace(/_/g, ' ') }))], filtros.accion)}</select></div>
      <div class="campo"><label for="b-tabla">Módulo</label>
        <select id="b-tabla" class="entrada">${opciones([{ valor: '', texto: 'Todos' }, ...TABLAS], filtros.tabla)}</select></div>
      <div class="campo ancho"><label for="b-texto">Buscar en la descripción</label>
        <input id="b-texto" type="search" class="entrada" value="${filtros.texto}" placeholder="Recibo, nombre, motivo…"></div>
    </form>
    <div id="resultado"></div>
    <div id="paginacion"></div>`);

  const recargar = () => { filtros.pagina = 1; cargar(); };
  const enlazar = (sel, clave) => $(sel, cont).addEventListener('change', (e) => { filtros[clave] = e.target.value; recargar(); });
  enlazar('#b-desde', 'desde');
  enlazar('#b-hasta', 'hasta');
  enlazar('#b-accion', 'accion');
  enlazar('#b-tabla', 'tabla');
  $('#b-texto', cont).addEventListener('input', retrasar((e) => { filtros.texto = e.target.value; recargar(); }, 350));
  $('#filtros', cont).addEventListener('submit', (e) => e.preventDefault());

  let filas = [];
  let solicitud = 0;
  async function cargar() {
    const n = ++solicitud;
    const res = $('#resultado', cont);
    res.style.opacity = '.6';
    let q = sb.from('bitacora').select('*', { count: 'exact' });
    if (filtros.desde) q = q.gte('fecha_hora', inicioDiaUTC(filtros.desde));
    if (filtros.hasta) q = q.lt('fecha_hora', inicioDiaUTC(sumarDias(filtros.hasta, 1)));
    if (filtros.accion) q = q.eq('accion', filtros.accion);
    if (filtros.tabla) q = q.eq('tabla_afectada', filtros.tabla);
    const texto = filtros.texto.trim().replace(/[%_\\]/g, '');
    if (texto) q = q.ilike('descripcion', `%${texto}%`);
    const desde = (filtros.pagina - 1) * TAMANO;
    const { data, count, error } = await q.order('fecha_hora', { ascending: false }).range(desde, desde + TAMANO - 1);
    if (n !== solicitud) return;
    res.style.opacity = '';
    if (error) {
      pintar(res, alerta('error', mensajeError(error)));
      return;
    }
    filas = data;
    pintar(res, html`
      <div class="tabla-contenedor">
        <table class="tabla tabla-compacta">
          <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Descripción</th><th></th></tr></thead>
          <tbody>
            ${filas.length ? filas.map((b, i) => html`
              <tr>
                <td class="nowrap">${fechaHora(b.fecha_hora)}</td>
                <td>${b.usuario_email || 'sistema'}</td>
                <td><span class="insignia ${CLASE_ACCION[b.accion] ?? ''}">${b.accion.replace(/_/g, ' ')}</span></td>
                <td>${NOMBRE_TABLA[b.tabla_afectada] || b.tabla_afectada || '—'}</td>
                <td>${b.descripcion || ''}</td>
                <td>${b.datos_anteriores || b.datos_nuevos ? html`<button type="button" class="btn btn-texto" data-ver="${i}">${icono('eye')} Detalle</button>` : ''}</td>
              </tr>`) : html`<tr><td colspan="6" class="tabla-vacia">No hay eventos con los filtros seleccionados.</td></tr>`}
          </tbody>
        </table>
      </div>`);
    $$('[data-ver]', res).forEach((b) => b.addEventListener('click', () => verDetalle(filas[Number(b.dataset.ver)])));
    montarPaginacion($('#paginacion', cont), {
      total: count || 0, pagina: filtros.pagina, tamano: TAMANO,
      alCambiar: (p) => { filtros.pagina = p; cargar(); window.scrollTo(0, 0); },
    });
  }
  await cargar();
}

function formatearValor(clave, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (/^(monto|valor_bienes_servicios)$/.test(clave)) return dinero(v);
  if (/_at$/.test(clave)) return fechaHora(v);
  if (/^fecha_/.test(clave)) return fecha(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function verDetalle(b) {
  const antes = b.datos_anteriores || {};
  const despues = b.datos_nuevos || {};
  let claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((k) => k !== 'id');
  if (b.datos_anteriores && b.datos_nuevos) {
    claves = claves.filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]));
  }
  const ambos = b.datos_anteriores && b.datos_nuevos;
  abrirModal({
    titulo: `${b.accion.replace(/_/g, ' ')} · ${fechaHora(b.fecha_hora)}`,
    ancho: true,
    contenido: html`
      <p><strong>${b.descripcion || ''}</strong></p>
      <p class="texto-tenue texto-pequeno">Usuario: ${b.usuario_email || 'sistema'} · Registro: <span class="mono">${b.registro_id || '—'}</span></p>
      ${claves.length ? html`
        <div class="tabla-contenedor mt-2">
          <table class="tabla tabla-compacta diferencias">
            <thead><tr><th>Campo</th>${ambos ? html`<th>Antes</th><th>Después</th>` : html`<th>Valor</th>`}</tr></thead>
            <tbody>${claves.map((k) => html`
              <tr><td class="nowrap"><strong>${ETIQUETAS_CAMPO[k] || k}</strong></td>
                ${ambos
                  ? html`<td class="antes">${formatearValor(k, antes[k])}</td><td class="despues">${formatearValor(k, despues[k])}</td>`
                  : html`<td>${formatearValor(k, (b.datos_nuevos || b.datos_anteriores)[k])}</td>`}
              </tr>`)}
            </tbody>
          </table>
        </div>` : html`<p class="texto-tenue">Sin datos adicionales.</p>`}`,
    pie: html`<button type="button" class="btn" data-cerrar>Cerrar</button>`,
  });
}
