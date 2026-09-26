// Miembros / donantes: lista, formulario y detalle.
import { sb } from '../supabase.js';
import {
  html, pintar, $, $$, aviso, alerta, confirmar, mensajeError, palabrasBusqueda, retrasar, entero,
  dinero, dineroCentavos, aCentavos, fecha, fechaHora, nombreCompleto, lineasDireccion, anioActual, solicitarTexto,
} from '../utils.js';
import { icono } from '../icons.js';
import {
  insigniaEstado, insigniaActivo, montarPaginacion, opciones, cargarFamilias, cargarFamilia, REGISTROS_SISTEMA,
} from '../components.js';

const NUEVA_FAMILIA = '__nueva__';

const TIPOS = ['Miembro', 'Donante', 'Visitante', 'Otro'];
const TAMANO = 50;
const filtros = { texto: '', estado: 'activos', tipo: '', pagina: 1 };

// ---------------------------------------------------------------------
// LISTA
// ---------------------------------------------------------------------
export async function lista({ cont, titulo }) {
  titulo('Miembros / Donantes');
  pintar(cont, html`
    <div class="cabecera">
      <div>
        <h2>Miembros / Donantes</h2>
        <p>Registro de miembros y donantes. Cada persona tiene un número único (EBE-000000).</p>
      </div>
      <div class="acciones"><a class="btn btn-primario" href="#/miembros/nuevo">${icono('plus')} Nuevo miembro</a></div>
    </div>
    <form class="filtros" id="filtros" role="search">
      <div class="campo ancho">
        <label for="f-texto">Buscar</label>
        <input id="f-texto" class="entrada" type="search" value="${filtros.texto}"
               placeholder="Número, nombre, apellido, teléfono o email">
      </div>
      <div class="campo">
        <label for="f-estado">Estado</label>
        <select id="f-estado" class="entrada">${opciones([
          { valor: 'activos', texto: 'Activos' }, { valor: 'inactivos', texto: 'Inactivos' }, { valor: 'todos', texto: 'Todos' },
        ], filtros.estado)}</select>
      </div>
      <div class="campo">
        <label for="f-tipo">Tipo</label>
        <select id="f-tipo" class="entrada">${opciones([{ valor: '', texto: 'Todos' }, ...TIPOS.map((t) => ({ valor: t, texto: t }))], filtros.tipo)}</select>
      </div>
    </form>
    <div id="resultado"></div>
    <div id="paginacion"></div>`);

  const recargar = () => { filtros.pagina = 1; cargar(); };
  $('#f-texto', cont).addEventListener('input', retrasar((e) => { filtros.texto = e.target.value; recargar(); }, 300));
  $('#f-estado', cont).addEventListener('change', (e) => { filtros.estado = e.target.value; recargar(); });
  $('#f-tipo', cont).addEventListener('change', (e) => { filtros.tipo = e.target.value; recargar(); });
  $('#filtros', cont).addEventListener('submit', (e) => e.preventDefault());

  let solicitud = 0;
  async function cargar() {
    const n = ++solicitud;
    const res = $('#resultado', cont);
    res.style.opacity = '.6';
    let q = sb.from('miembros')
      .select('id, numero_miembro, nombre, apellido, tipo_persona, telefono, email, ciudad, activo, registro_sistema', { count: 'exact' });
    if (filtros.estado === 'activos') q = q.eq('activo', true);
    else if (filtros.estado === 'inactivos') q = q.eq('activo', false);
    if (filtros.tipo) q = q.eq('tipo_persona', filtros.tipo);
    for (const p of palabrasBusqueda(filtros.texto)) q = q.ilike('texto_busqueda', `%${p}%`);
    const desde = (filtros.pagina - 1) * TAMANO;
    const { data, count, error } = await q.order('apellido').order('nombre').range(desde, desde + TAMANO - 1);
    if (n !== solicitud) return;
    res.style.opacity = '';
    if (error) {
      pintar(res, alerta('error', mensajeError(error)));
      return;
    }
    pintar(res, html`
      <div class="tabla-contenedor">
        <table class="tabla">
          <thead><tr><th>Número</th><th>Nombre</th><th>Tipo</th><th>Teléfono</th><th>Email</th><th>Ciudad</th><th>Estado</th></tr></thead>
          <tbody>
            ${data.length ? data.map((m) => html`
              <tr class="clic" data-id="${m.id}" tabindex="0">
                <td class="mono nowrap">${m.numero_miembro}</td>
                <td>${m.registro_sistema
                  ? html`<strong>${m.nombre}</strong> <span class="insignia">${REGISTROS_SISTEMA[m.registro_sistema]?.insignia || 'Registro del sistema'}</span>`
                  : html`<strong>${m.apellido}</strong>, ${m.nombre}`}</td>
                <td>${m.tipo_persona}</td>
                <td class="nowrap">${m.telefono || ''}</td>
                <td>${m.email || ''}</td>
                <td>${m.ciudad || ''}</td>
                <td>${insigniaActivo(m.activo)}</td>
              </tr>`) : html`<tr><td colspan="7" class="tabla-vacia">No se encontraron miembros con los filtros seleccionados.</td></tr>`}
          </tbody>
        </table>
      </div>`);
    $$('tr[data-id]', res).forEach((tr) => {
      const ir = () => { location.hash = `#/miembros/${tr.dataset.id}`; };
      tr.addEventListener('click', ir);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
    });
    montarPaginacion($('#paginacion', cont), {
      total: count || 0, pagina: filtros.pagina, tamano: TAMANO,
      alCambiar: (p) => { filtros.pagina = p; cargar(); window.scrollTo(0, 0); },
    });
  }

  await cargar();
  $('#f-texto', cont).focus();
}

// ---------------------------------------------------------------------
// FORMULARIO (nuevo / editar)
// ---------------------------------------------------------------------
export async function formulario({ cont, params, query, titulo }) {
  const id = params[0] || null;
  let m = { tipo_persona: 'Miembro', activo: true, familia_id: query?.get('familia') || null };
  if (id) {
    const { data, error } = await sb.from('miembros').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) {
      pintar(cont, alerta('error', 'El miembro solicitado no existe.'));
      return;
    }
    m = data;
  }
  const familias = await cargarFamilias();
  let nombreFamiliaNueva = null;
  titulo(id ? 'Editar miembro' : 'Nuevo miembro');

  const campo = (clave, etiqueta, { tipo = 'text', requerido = false, max = 120, ayuda = '', extra = '' } = {}) => html`
    <div class="campo">
      <label for="c-${clave}" class="${requerido ? 'requerido' : ''}">${etiqueta}</label>
      <input id="c-${clave}" name="${clave}" class="entrada" type="${tipo}" maxlength="${max}" value="${m[clave] ?? ''}"
             ${requerido ? 'required' : ''} ${extra}>
      ${ayuda ? html`<div class="ayuda">${ayuda}</div>` : ''}
    </div>`;

  pintar(cont, html`
    <a class="volver" href="${id ? `#/miembros/${id}` : '#/miembros'}">${icono('arrow-left')} Volver</a>
    <div class="cabecera">
      <div>
        <h2>${id ? `Editar: ${nombreCompleto(m)}` : 'Nuevo miembro / donante'}</h2>
        <p>${id ? html`Número de miembro <strong>${m.numero_miembro}</strong> (no modificable).` : 'El número de miembro se asignará automáticamente al guardar.'}</p>
      </div>
    </div>
    <form id="form-miembro" class="formulario" novalidate style="max-width:900px">
      <div id="mensaje"></div>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h3>Datos personales</h3></div>
        <div class="formulario">
          ${m.registro_sistema ? alerta('info', html`Registro del sistema para ${REGISTROS_SISTEMA[m.registro_sistema]?.descripcion}:
            siempre aparece como <strong>${m.nombre}</strong> y su nombre no se puede cambiar.`) : html`
          <div class="fila-campos">
            ${campo('nombre', 'Nombre', { requerido: true, max: 80, extra: 'autocomplete="off"' })}
            ${campo('apellido', 'Apellido', { requerido: true, max: 80, extra: 'autocomplete="off"' })}
          </div>`}
          <div class="fila-campos">
            <div class="campo">
              <label for="c-tipo_persona">Tipo de persona</label>
              <select id="c-tipo_persona" name="tipo_persona" class="entrada">${opciones(TIPOS.map((t) => ({ valor: t, texto: t })), m.tipo_persona)}</select>
            </div>
            ${campo('fecha_ingreso', 'Fecha de ingreso', { tipo: 'date' })}
          </div>
          ${m.registro_sistema ? '' : html`
          <div class="campo">
            <label for="c-familia_id">Familia</label>
            <select id="c-familia_id" name="familia_id" class="entrada">${opcionesFamilia(familias, m.familia_id)}</select>
            <div class="ayuda">Opcional. Los miembros de una familia pueden recibir una sola carta anual conjunta.</div>
          </div>`}
        </div>
      </section>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h3>Contacto y dirección</h3></div>
        <div class="formulario">
          <div class="fila-campos">
            ${campo('telefono', 'Teléfono', { tipo: 'tel', max: 30 })}
            ${campo('email', 'Correo electrónico', { tipo: 'email', max: 120 })}
          </div>
          ${campo('direccion', 'Dirección', { max: 200 })}
          <div class="fila-campos">
            ${campo('ciudad', 'Ciudad', { max: 80 })}
            ${campo('estado', 'Estado', { max: 40, ayuda: 'Ej.: FL, TX, NY' })}
            ${campo('zip', 'ZIP', { max: 15 })}
          </div>
        </div>
      </section>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h3>Otros</h3></div>
        <div class="formulario">
          <div class="campo">
            <label for="c-notas">Notas</label>
            <textarea id="c-notas" name="notas" class="entrada" rows="3" maxlength="1000">${m.notas || ''}</textarea>
          </div>
          ${id && !m.registro_sistema ? html`<label class="casilla"><input type="checkbox" id="c-activo" ${m.activo ? 'checked' : ''}> Miembro activo</label>` : ''}
        </div>
      </section>
      <div class="acciones">
        <button type="submit" class="btn btn-primario btn-grande" id="guardar">${icono('check')} Guardar</button>
        <a class="btn btn-grande" href="${id ? `#/miembros/${id}` : '#/miembros'}">Cancelar</a>
      </div>
    </form>`);

  $('#c-nombre', cont)?.focus();
  const form = $('#form-miembro', cont);

  // "Crear familia nueva…": se pide el nombre y se crea al guardar el miembro.
  let familiaAnterior = m.familia_id || '';
  const selFamilia = $('#c-familia_id', cont);
  selFamilia?.addEventListener('change', async () => {
    if (selFamilia.value !== NUEVA_FAMILIA) {
      familiaAnterior = selFamilia.value;
      return;
    }
    const pendiente = solicitarTexto({
      titulo: 'Nueva familia',
      mensaje: html`<p>Se creará al guardar este miembro. Después podrá agregar a los demás integrantes desde <strong>Familias</strong>.</p>`,
      etiqueta: 'Nombre de la familia',
      minimo: 2,
      textoConfirmar: 'Usar este nombre',
    });
    const apellido = $('#c-apellido', cont).value.trim();
    const area = $('#texto-solicitado');
    if (area && apellido) area.value = `Familia ${apellido}`;
    const nombre = await pendiente;
    if (!nombre) {
      selFamilia.value = familiaAnterior;
      return;
    }
    nombreFamiliaNueva = nombre;
    selFamilia.querySelector(`option[value="${NUEVA_FAMILIA}"]`).textContent = `Nueva: ${nombre}`;
    familiaAnterior = NUEVA_FAMILIA;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const valor = (k) => {
      const v = (form.elements[k]?.value || '').trim();
      return v === '' ? null : v;
    };
    const datos = {
      nombre: valor('nombre'),
      apellido: valor('apellido'),
      tipo_persona: valor('tipo_persona') || 'Miembro',
      fecha_ingreso: valor('fecha_ingreso'),
      telefono: valor('telefono'),
      email: valor('email'),
      direccion: valor('direccion'),
      ciudad: valor('ciudad'),
      estado: valor('estado'),
      zip: valor('zip'),
      notas: valor('notas'),
      familia_id: valor('familia_id'),
    };
    if (m.registro_sistema) {
      // Nombre fijo ("Anónimo", "Grupos Familiares"), siempre activo y sin familia: lo garantiza el servidor.
      delete datos.nombre;
      delete datos.apellido;
      delete datos.familia_id;
    } else if (id) datos.activo = $('#c-activo', cont).checked;

    // Validación
    const errores = [];
    $$('[aria-invalid]', form).forEach((x) => x.removeAttribute('aria-invalid'));
    const marcar = (k, msg) => { form.elements[k]?.setAttribute('aria-invalid', 'true'); errores.push(msg); };
    if (!m.registro_sistema && !datos.nombre) marcar('nombre', 'El nombre es obligatorio.');
    if (!m.registro_sistema && !datos.apellido) marcar('apellido', 'El apellido es obligatorio.');
    if (datos.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.email)) marcar('email', 'El correo electrónico no es válido.');
    if (datos.fecha_ingreso && datos.fecha_ingreso < '1900-01-01') marcar('fecha_ingreso', 'La fecha de ingreso no es válida.');
    if (errores.length) {
      pintar($('#mensaje', cont), alerta('error', html`${errores.map((x) => html`<p>${x}</p>`)}`));
      $('[aria-invalid="true"]', form)?.focus();
      return;
    }

    // Posible duplicado (solo al crear)
    if (!id) {
      const { data: dup } = await sb.from('miembros').select('numero_miembro, nombre, apellido')
        .ilike('nombre', datos.nombre).ilike('apellido', datos.apellido).limit(3);
      if (dup?.length) {
        const ok = await confirmar({
          titulo: 'Posible registro duplicado',
          mensaje: html`<p>Ya existe un registro con el mismo nombre:</p>
            <ul>${dup.map((d) => html`<li><strong>${d.numero_miembro}</strong> — ${d.nombre} ${d.apellido}</li>`)}</ul>
            <p>¿Desea registrar a esta persona de todas formas?</p>`,
          textoConfirmar: 'Sí, registrar',
        });
        if (!ok) return;
      }
    }

    const boton = $('#guardar', cont);
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    if (datos.familia_id === NUEVA_FAMILIA) {
      const { data: fam, error: errFam } = await sb.from('familias').insert({ nombre: nombreFamiliaNueva }).select('id').single();
      if (errFam) {
        boton.disabled = false;
        pintar(boton, html`${icono('check')} Guardar`);
        pintar($('#mensaje', cont), alerta('error', mensajeError(errFam)));
        return;
      }
      datos.familia_id = fam.id;
      selFamilia.replaceChildren(new Option(nombreFamiliaNueva, fam.id, true, true));
    }
    const consulta = id
      ? sb.from('miembros').update(datos).eq('id', id).select('id, numero_miembro').single()
      : sb.from('miembros').insert(datos).select('id, numero_miembro').single();
    const { data, error } = await consulta;
    if (error) {
      boton.disabled = false;
      pintar(boton, html`${icono('check')} Guardar`);
      pintar($('#mensaje', cont), alerta('error', mensajeError(error)));
      window.scrollTo(0, 0);
      return;
    }
    aviso(id ? 'Miembro actualizado correctamente.' : `Miembro registrado correctamente con el número ${data.numero_miembro}.`);
    location.hash = `#/miembros/${data.id}`;
  });
}

// ---------------------------------------------------------------------
// DETALLE
// ---------------------------------------------------------------------
export async function detalle({ cont, params, titulo }) {
  const id = params[0];
  const [{ data: m, error }, historial] = await Promise.all([
    sb.from('miembros').select('*').eq('id', id).maybeSingle(),
    sb.rpc('buscar_aportaciones', { p_filtros: { miembro_id: id }, p_limite: 50000, p_desplazamiento: 0, p_orden: 'fecha_desc' }),
  ]);
  if (error) throw error;
  if (historial.error) throw historial.error;
  if (!m) {
    pintar(cont, alerta('error', 'El miembro solicitado no existe.'));
    return;
  }
  titulo(nombreCompleto(m));
  const familia = m.familia_id ? await cargarFamilia(m.familia_id) : null;

  const filas = historial.data.filas;
  const anio = anioActual();
  const validas = filas.filter((f) => f.estado === 'REGISTRADA');
  const totalAnio = (a) => validas.filter((f) => f.fecha_aportacion.startsWith(String(a))).reduce((s, f) => s + aCentavos(f.monto), 0);
  const totalHistorico = validas.reduce((s, f) => s + aCentavos(f.monto), 0);
  const tieneHistorial = filas.length > 0;
  const direccion = lineasDireccion(m);

  pintar(cont, html`
    <a class="volver" href="#/miembros">${icono('arrow-left')} Miembros</a>
    <div class="cabecera">
      <div>
        <h2>${nombreCompleto(m)}</h2>
        <p><span class="mono">${m.numero_miembro}</span> · ${m.registro_sistema ? REGISTROS_SISTEMA[m.registro_sistema]?.insignia : m.tipo_persona} · ${insigniaActivo(m.activo)}</p>
      </div>
      <div class="acciones">
        ${m.activo ? html`<a class="btn btn-primario" href="#/aportaciones/nueva?miembro=${m.id}">${icono('plus-circle')} Nueva aportación</a>` : ''}
        <a class="btn" href="#/estados-cuenta?miembro=${m.id}">${icono('file-text')} Estado de cuenta</a>
        ${m.es_anonimo ? '' : html`<a class="btn" href="#/cartas?miembro=${m.id}">${icono('mail')} Carta anual</a>`}
        <a class="btn" href="#/miembros/${m.id}/editar">${icono('edit')} Editar</a>
      </div>
    </div>
    ${m.es_anonimo ? alerta('info', html`Registro del sistema para las <strong>aportaciones anónimas</strong>. Aparece como
      “Anónimo” en reportes, historial y estados de cuenta, y sus aportaciones cuentan en todos los totales. No recibe carta anual
      y no puede eliminarse ni desactivarse.`) : ''}
    ${m.registro_sistema && !m.es_anonimo ? alerta('info', html`Registro del sistema para ${REGISTROS_SISTEMA[m.registro_sistema]?.descripcion}.
      Funciona como un miembro (recibos, reportes, estado de cuenta y carta anual), pero su nombre es fijo y no puede
      eliminarse, desactivarse ni pertenecer a una familia.`) : ''}

    <div class="rejilla rejilla-4">
      ${tarjetaDato(`Total ${anio}`, dineroCentavos(totalAnio(anio)))}
      ${tarjetaDato(`Total ${anio - 1}`, dineroCentavos(totalAnio(anio - 1)))}
      ${tarjetaDato('Total histórico', dineroCentavos(totalHistorico))}
      ${tarjetaDato('Aportaciones válidas', entero(validas.length))}
    </div>

    <section class="tarjeta mt-2">
      <div class="tarjeta-titulo"><h3>Información</h3></div>
      <dl class="datos">
        <div><dt>Teléfono</dt><dd>${m.telefono || '—'}</dd></div>
        <div><dt>Correo electrónico</dt><dd>${m.email || '—'}</dd></div>
        ${m.registro_sistema ? '' : html`<div><dt>Familia</dt><dd>${familia
          ? html`<a href="#/familias/${familia.id}">${familia.nombre}</a> <span class="mono texto-tenue">${familia.numero_familia}</span>`
          : html`— <a class="texto-pequeno" href="#/miembros/${m.id}/editar">Asignar</a>`}</dd></div>`}
        <div><dt>Dirección</dt><dd>${direccion.length ? direccion.map((l) => html`${l}<br>`) : '—'}</dd></div>
        <div><dt>Fecha de ingreso</dt><dd>${fecha(m.fecha_ingreso) || '—'}</dd></div>
        <div><dt>Registrado</dt><dd>${fechaHora(m.created_at)}</dd></div>
        <div><dt>Última modificación</dt><dd>${fechaHora(m.updated_at)}</dd></div>
        ${m.notas ? html`<div style="grid-column:1/-1"><dt>Notas</dt><dd style="white-space:pre-wrap">${m.notas}</dd></div>` : ''}
      </dl>
    </section>

    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h3>Historial de aportaciones <span class="sub">· ${entero(filas.length)} registro(s)</span></h3>
        ${filas.length ? html`<a class="btn btn-texto" href="#/aportaciones?miembro=${m.id}">Ver en historial</a>` : ''}
      </div>
      ${filas.length ? html`
        <div class="tabla-contenedor">
          <table class="tabla tabla-compacta">
            <thead><tr><th>Fecha</th><th>Recibo</th><th>Fondo</th><th>Método</th><th class="dinero">Monto</th><th>Estado</th></tr></thead>
            <tbody>${filas.slice(0, 100).map((f) => html`
              <tr class="clic" data-id="${f.id}" tabindex="0">
                <td class="nowrap">${fecha(f.fecha_aportacion)}</td>
                <td class="mono nowrap">${f.numero_recibo}</td>
                <td>${f.fondo_nombre}</td>
                <td>${f.metodo_pago_nombre}</td>
                <td class="dinero ${f.estado !== 'REGISTRADA' ? 'tachado' : ''}">${dinero(f.monto)}</td>
                <td>${insigniaEstado(f.estado)}</td>
              </tr>`)}
            </tbody>
          </table>
        </div>
        ${filas.length > 100 ? html`<p class="texto-tenue texto-pequeno mt-1">Se muestran las 100 más recientes.</p>` : ''}`
      : html`<div class="vacio">Este miembro aún no tiene aportaciones registradas.</div>`}
    </section>

    ${m.registro_sistema ? '' : html`<section class="tarjeta">
      <div class="tarjeta-titulo"><h3>Administración del registro</h3></div>
      <div class="acciones">
        <button type="button" class="btn" id="alternar-activo">
          ${m.activo ? html`${icono('user-x')} Desactivar miembro` : html`${icono('user-check')} Activar miembro`}
        </button>
        ${tieneHistorial ? '' : html`<button type="button" class="btn btn-peligro-suave" id="eliminar">${icono('trash')} Eliminar registro</button>`}
      </div>
      <p class="texto-tenue texto-pequeno mt-1">
        ${tieneHistorial
          ? 'Este miembro tiene historial de aportaciones: no puede eliminarse, pero puede desactivarse.'
          : 'Solo se pueden eliminar registros sin aportaciones.'}
      </p>
    </section>`}`);

  $$('tr[data-id]', cont).forEach((tr) => {
    const ir = () => { location.hash = `#/aportaciones/${tr.dataset.id}`; };
    tr.addEventListener('click', ir);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
  });

  $('#alternar-activo', cont)?.addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: m.activo ? 'Desactivar miembro' : 'Activar miembro',
      mensaje: m.activo
        ? html`<p>¿Desactivar a <strong>${nombreCompleto(m)}</strong>? Su historial se conserva y podrá reactivarlo en cualquier momento.</p>`
        : html`<p>¿Activar nuevamente a <strong>${nombreCompleto(m)}</strong>?</p>`,
      textoConfirmar: m.activo ? 'Desactivar' : 'Activar',
    });
    if (!ok) return;
    const { error: err } = await sb.from('miembros').update({ activo: !m.activo }).eq('id', m.id);
    if (err) return aviso(mensajeError(err), 'error');
    aviso(m.activo ? 'Miembro desactivado.' : 'Miembro activado.');
    detalle({ cont, params, titulo });
  });

  $('#eliminar', cont)?.addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Eliminar registro',
      mensaje: html`<p>¿Eliminar definitivamente a <strong>${nombreCompleto(m)}</strong> (${m.numero_miembro})?</p>
        <p>Esta acción quedará registrada en la bitácora y no se puede deshacer.</p>`,
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    const { error: err } = await sb.from('miembros').delete().eq('id', m.id);
    if (err) return aviso(mensajeError(err), 'error');
    aviso('Registro eliminado.');
    location.hash = '#/miembros';
  });
}

function opcionesFamilia(familias, seleccionada) {
  return opciones([
    { valor: '', texto: 'Sin familia' },
    ...familias.map((f) => ({ valor: f.id, texto: `${f.nombre} (${f.numero_familia})` })),
    { valor: NUEVA_FAMILIA, texto: '+ Crear familia nueva…' },
  ], seleccionada || '');
}

function tarjetaDato(etiqueta, valor) {
  return html`<div class="tarjeta indicador"><div class="etiqueta">${etiqueta}</div><div class="valor" style="font-size:22px">${valor}</div></div>`;
}
