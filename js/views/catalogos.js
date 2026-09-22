// Catálogos: fondos y métodos de pago.
import { sb } from '../supabase.js';
import { cargarCatalogos } from '../state.js';
import { html, pintar, $, $$, aviso, alerta, abrirModal, confirmar, mensajeError, entero, fechaHora } from '../utils.js';
import { icono } from '../icons.js';
import { insigniaActivo } from '../components.js';

const DEFINICIONES = {
  fondos: {
    tabla: 'fondos',
    titulo: 'Fondos',
    singular: 'fondo',
    descripcion: 'Clasificación de las aportaciones (Diezmo, Ofrenda, Misiones…). Un fondo con aportaciones no puede eliminarse; puede desactivarse.',
    conDescripcion: true,
  },
  metodos: {
    tabla: 'metodos_pago',
    titulo: 'Métodos de pago',
    singular: 'método de pago',
    descripcion: 'Formas en que se reciben las aportaciones. No se almacenan números de tarjeta, CVV, credenciales ni datos bancarios.',
    conDescripcion: false,
  },
};

export const fondos = (ctx) => catalogo(ctx, DEFINICIONES.fondos);
export const metodos = (ctx) => catalogo(ctx, DEFINICIONES.metodos);

async function catalogo({ cont, titulo }, def) {
  titulo(def.titulo);
  const { data, error } = await sb.from(def.tabla).select('*, aportaciones(count)').order('orden').order('nombre');
  if (error) throw error;

  pintar(cont, html`
    <div class="cabecera">
      <div><h2>${def.titulo}</h2><p>${def.descripcion}</p></div>
      <div class="acciones"><button type="button" class="btn btn-primario" id="nuevo">${icono('plus')} Nuevo ${def.singular}</button></div>
    </div>
    <div class="tabla-contenedor">
      <table class="tabla">
        <thead><tr><th>Orden</th><th>Nombre</th>${def.conDescripcion ? html`<th>Descripción</th>` : ''}<th class="num">Aportaciones</th><th>Estado</th><th>Actualizado</th><th></th></tr></thead>
        <tbody>
          ${data.length ? data.map((x, i) => {
            const usos = x.aportaciones?.[0]?.count ?? 0;
            return html`
              <tr>
                <td class="num" style="width:70px">${x.orden}</td>
                <td><strong>${x.nombre}</strong></td>
                ${def.conDescripcion ? html`<td>${x.descripcion || ''}</td>` : ''}
                <td class="num">${entero(usos)}</td>
                <td>${insigniaActivo(x.activo)}</td>
                <td class="nowrap texto-tenue">${fechaHora(x.updated_at)}</td>
                <td class="nowrap">
                  <button type="button" class="btn btn-texto" data-editar="${i}">${icono('edit')} Editar</button>
                  <button type="button" class="btn btn-texto" data-alternar="${i}">${x.activo ? 'Desactivar' : 'Activar'}</button>
                  ${usos === 0 ? html`<button type="button" class="btn btn-texto" data-eliminar="${i}" style="color:var(--rojo)">${icono('trash')} Eliminar</button>` : ''}
                </td>
              </tr>`;
          }) : html`<tr><td colspan="7" class="tabla-vacia">No hay registros.</td></tr>`}
        </tbody>
      </table>
    </div>`);

  const recargar = async () => {
    await cargarCatalogos();
    await catalogo({ cont, titulo }, def);
  };

  $('#nuevo', cont).addEventListener('click', () => formulario(def, null, recargar));
  $$('[data-editar]', cont).forEach((b) => b.addEventListener('click', () => formulario(def, data[Number(b.dataset.editar)], recargar)));
  $$('[data-alternar]', cont).forEach((b) => b.addEventListener('click', async () => {
    const x = data[Number(b.dataset.alternar)];
    const ok = await confirmar({
      titulo: x.activo ? `Desactivar ${def.singular}` : `Activar ${def.singular}`,
      mensaje: x.activo
        ? html`<p>¿Desactivar <strong>${x.nombre}</strong>? No podrá usarse en nuevas aportaciones, pero el historial se conserva.</p>`
        : html`<p>¿Activar <strong>${x.nombre}</strong>?</p>`,
      textoConfirmar: x.activo ? 'Desactivar' : 'Activar',
    });
    if (!ok) return;
    const { error: err } = await sb.from(def.tabla).update({ activo: !x.activo }).eq('id', x.id);
    if (err) return aviso(mensajeError(err), 'error');
    aviso('Cambio guardado.');
    recargar();
  }));
  $$('[data-eliminar]', cont).forEach((b) => b.addEventListener('click', async () => {
    const x = data[Number(b.dataset.eliminar)];
    const ok = await confirmar({
      titulo: `Eliminar ${def.singular}`,
      mensaje: html`<p>¿Eliminar <strong>${x.nombre}</strong>? Solo es posible porque no tiene aportaciones registradas.</p>`,
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    const { error: err } = await sb.from(def.tabla).delete().eq('id', x.id);
    if (err) return aviso(mensajeError(err), 'error');
    aviso('Registro eliminado.');
    recargar();
  }));
}

function formulario(def, x, alGuardar) {
  const m = abrirModal({
    titulo: x ? `Editar ${def.singular}` : `Nuevo ${def.singular}`,
    contenido: html`
      <form class="formulario" id="form-catalogo" novalidate>
        <div id="c-msg"></div>
        <div class="campo"><label for="c-nombre" class="requerido">Nombre</label>
          <input id="c-nombre" class="entrada" maxlength="80" value="${x?.nombre || ''}" required></div>
        ${def.conDescripcion ? html`<div class="campo"><label for="c-desc">Descripción</label>
          <input id="c-desc" class="entrada" maxlength="200" value="${x?.descripcion || ''}"></div>` : ''}
        <div class="campo"><label for="c-orden">Orden de aparición</label>
          <input id="c-orden" class="entrada" type="number" min="0" max="999" value="${x?.orden ?? 100}" style="max-width:140px">
          <div class="ayuda">Número menor = aparece primero en las listas.</div></div>
        ${x ? '' : html`<label class="casilla"><input type="checkbox" id="c-activo" checked> Activo</label>`}
      </form>`,
    pie: html`<button type="button" class="btn" data-cerrar>Cancelar</button>
              <button type="button" class="btn btn-primario" id="c-guardar">Guardar</button>`,
  });

  const guardar = async () => {
    const nombre = $('#c-nombre', m.el).value.trim();
    const orden = Number($('#c-orden', m.el).value);
    if (!nombre) {
      $('#c-nombre', m.el).setAttribute('aria-invalid', 'true');
      pintar($('#c-msg', m.el), alerta('error', 'El nombre es obligatorio.'));
      return;
    }
    if (!Number.isInteger(orden) || orden < 0 || orden > 999) {
      pintar($('#c-msg', m.el), alerta('error', 'El orden debe ser un número entero entre 0 y 999.'));
      return;
    }
    const datos = { nombre, orden };
    if (def.conDescripcion) datos.descripcion = $('#c-desc', m.el).value.trim() || null;
    if (!x) datos.activo = $('#c-activo', m.el).checked;
    const boton = $('#c-guardar', m.el);
    boton.disabled = true;
    const { error } = x
      ? await sb.from(def.tabla).update(datos).eq('id', x.id)
      : await sb.from(def.tabla).insert(datos);
    if (error) {
      boton.disabled = false;
      pintar($('#c-msg', m.el), alerta('error', mensajeError(error)));
      return;
    }
    m.cerrar();
    aviso('Guardado correctamente.');
    alGuardar();
  };
  $('#c-guardar', m.el).addEventListener('click', guardar);
  $('#form-catalogo', m.el).addEventListener('submit', (e) => { e.preventDefault(); guardar(); });
}
