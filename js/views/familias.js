// Familias: agrupan miembros/donantes para la carta anual y el estado de cuenta conjuntos.
import { sb } from '../supabase.js';
import {
  html, pintar, $, $$, aviso, alerta, confirmar, mensajeError, retrasar, entero, dineroCentavos, aCentavos,
  fechaHora, nombreCompleto, lineasDireccion, anioActual, normalizarBusqueda, palabrasBusqueda, obtenerTodos,
} from '../utils.js';
import { icono } from '../icons.js';
import {
  COLUMNAS_MIEMBRO, insigniaActivo, selectorMiembro, cargarFamilia, miembrosDeFamilia, nombreCartaFamilia,
} from '../components.js';

let textoFiltro = '';

function insigniaCarta(familia) {
  return familia.carta_conjunta
    ? html`<span class="insignia verde">Carta conjunta</span>`
    : html`<span class="insignia gris">Cartas individuales</span>`;
}

// ---------------------------------------------------------------------
// LISTA
// ---------------------------------------------------------------------
export async function lista({ cont, titulo }) {
  titulo('Familias');
  const [{ data: familias, error }, miembros] = await Promise.all([
    sb.from('familias').select('*').order('nombre'),
    obtenerTodos(() => sb.from('miembros').select(COLUMNAS_MIEMBRO).order('numero_miembro')),
  ]);
  if (error) throw error;
  const porFamilia = new Map();
  for (const m of miembros) {
    if (!m.familia_id) continue;
    if (!porFamilia.has(m.familia_id)) porFamilia.set(m.familia_id, []);
    porFamilia.get(m.familia_id).push(m);
  }

  pintar(cont, html`
    <div class="cabecera">
      <div>
        <h2>Familias</h2>
        <p>Agrupe a los miembros de una misma familia (por ejemplo, un matrimonio) para emitir una sola carta anual
           y un estado de cuenta conjunto. Cada aportación sigue registrada a nombre de quien la dio.</p>
      </div>
      <div class="acciones"><a class="btn btn-primario" href="#/familias/nueva">${icono('plus')} Nueva familia</a></div>
    </div>
    <form class="filtros" id="filtros" role="search">
      <div class="campo ancho">
        <label for="f-texto">Buscar</label>
        <input id="f-texto" class="entrada" type="search" value="${textoFiltro}" placeholder="Nombre o número de la familia, o nombre de un miembro">
      </div>
    </form>
    <div id="resultado"></div>`);

  const pintarLista = () => {
    const palabras = palabrasBusqueda(textoFiltro);
    const visibles = familias.filter((f) => {
      const texto = normalizarBusqueda([f.numero_familia, f.nombre, f.nombre_carta,
        ...(porFamilia.get(f.id) || []).map((m) => `${m.numero_miembro} ${nombreCompleto(m)}`)].join(' '));
      return palabras.every((p) => texto.includes(p));
    });
    pintar($('#resultado', cont), html`
      <div class="tabla-contenedor">
        <table class="tabla">
          <thead><tr><th>Número</th><th>Familia</th><th>Miembros</th><th>Carta anual</th></tr></thead>
          <tbody>
            ${visibles.length ? visibles.map((f) => {
              const ms = porFamilia.get(f.id) || [];
              return html`
                <tr class="clic" data-id="${f.id}" tabindex="0">
                  <td class="mono nowrap">${f.numero_familia}</td>
                  <td><strong>${f.nombre}</strong><br><span class="texto-tenue texto-pequeno">${nombreCartaFamilia(f, ms)}</span></td>
                  <td>${ms.length ? ms.map((m) => html`${nombreCompleto(m)}<br>`) : html`<span class="insignia ambar">Sin miembros</span>`}</td>
                  <td>${insigniaCarta(f)}</td>
                </tr>`;
            }) : html`<tr><td colspan="4" class="tabla-vacia">${familias.length
              ? 'No se encontraron familias con esa búsqueda.'
              : html`Aún no hay familias. <a href="#/familias/nueva">Registre la primera</a>.`}</td></tr>`}
          </tbody>
        </table>
      </div>
      ${visibles.length ? html`<div class="paginacion"><span>${entero(visibles.length)} familia(s)</span></div>` : ''}`);
    $$('tr[data-id]', cont).forEach((tr) => {
      const ir = () => { location.hash = `#/familias/${tr.dataset.id}`; };
      tr.addEventListener('click', ir);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
    });
  };

  $('#f-texto', cont).addEventListener('input', retrasar((e) => { textoFiltro = e.target.value; pintarLista(); }, 200));
  $('#filtros', cont).addEventListener('submit', (e) => e.preventDefault());
  pintarLista();
  $('#f-texto', cont).focus();
}

// ---------------------------------------------------------------------
// FORMULARIO (nueva / editar)
// ---------------------------------------------------------------------
export async function formulario({ cont, params, titulo }) {
  const id = params[0] || null;
  let f = { nombre: '', nombre_carta: '', carta_conjunta: true, notas: '' };
  let miembros = [];
  if (id) {
    f = await cargarFamilia(id);
    if (!f) {
      pintar(cont, alerta('error', 'La familia solicitada no existe.'));
      return;
    }
    miembros = await miembrosDeFamilia(id);
  }
  titulo(id ? 'Editar familia' : 'Nueva familia');
  const sugerido = nombreCartaFamilia({ ...f, nombre_carta: null }, miembros);
  const volver = id ? `#/familias/${id}` : '#/familias';

  pintar(cont, html`
    <a class="volver" href="${volver}">${icono('arrow-left')} Volver</a>
    <div class="cabecera">
      <div>
        <h2>${id ? `Editar: ${f.nombre}` : 'Nueva familia'}</h2>
        <p>${id ? html`Número de familia <strong>${f.numero_familia}</strong> (no modificable).`
                : 'El número de familia se asignará automáticamente. Después podrá agregar a sus miembros.'}</p>
      </div>
    </div>
    <form id="form-familia" class="tarjeta formulario" novalidate style="max-width:760px">
      <div id="mensaje"></div>
      <div class="campo">
        <label for="c-nombre" class="requerido">Nombre de la familia</label>
        <input id="c-nombre" class="entrada" maxlength="120" value="${f.nombre}" placeholder="Ej.: Familia Sariñana" autocomplete="off">
      </div>
      <div class="campo">
        <label for="c-nombre_carta">Nombre en la carta anual</label>
        <input id="c-nombre_carta" class="entrada" maxlength="200" value="${f.nombre_carta || ''}"
               placeholder="${id && miembros.length ? sugerido : 'Ej.: José y María Sariñana'}">
        <div class="ayuda">Cómo se dirigirá la carta. Si lo deja vacío se arma con los nombres de los miembros
          (por ejemplo, “José y María Sariñana”).</div>
      </div>
      <label class="casilla"><input type="checkbox" id="c-carta_conjunta" ${f.carta_conjunta ? 'checked' : ''}>
        Emitir una sola carta anual para toda la familia</label>
      <div class="ayuda" style="margin-top:-6px">Desmárquelo si cada persona debe recibir su propia carta (por ejemplo,
        si declaran impuestos por separado). El estado de cuenta familiar sigue disponible.</div>
      <div class="campo">
        <label for="c-notas">Notas</label>
        <textarea id="c-notas" class="entrada" rows="3" maxlength="1000">${f.notas || ''}</textarea>
      </div>
      <div class="acciones">
        <button type="submit" class="btn btn-primario btn-grande" id="guardar">${icono('check')} Guardar</button>
        <a class="btn btn-grande" href="${volver}">Cancelar</a>
      </div>
    </form>`);

  $('#c-nombre', cont).focus();
  $('#form-familia', cont).addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {
      nombre: $('#c-nombre', cont).value.trim(),
      nombre_carta: $('#c-nombre_carta', cont).value.trim() || null,
      carta_conjunta: $('#c-carta_conjunta', cont).checked,
      notas: $('#c-notas', cont).value.trim() || null,
    };
    if (!datos.nombre) {
      $('#c-nombre', cont).setAttribute('aria-invalid', 'true');
      $('#c-nombre', cont).focus();
      pintar($('#mensaje', cont), alerta('error', 'El nombre de la familia es obligatorio.'));
      return;
    }
    const boton = $('#guardar', cont);
    boton.disabled = true;
    const { data, error } = id
      ? await sb.from('familias').update(datos).eq('id', id).select('id, numero_familia').single()
      : await sb.from('familias').insert(datos).select('id, numero_familia').single();
    if (error) {
      boton.disabled = false;
      pintar($('#mensaje', cont), alerta('error', mensajeError(error)));
      return;
    }
    aviso(id ? 'Familia actualizada.' : `Familia registrada con el número ${data.numero_familia}. Ahora agregue a sus miembros.`);
    location.hash = `#/familias/${data.id}`;
  });
}

// ---------------------------------------------------------------------
// DETALLE
// ---------------------------------------------------------------------
export async function detalle({ cont, params, titulo }) {
  const id = params[0];
  const anio = anioActual();
  const [f, miembros, historial] = await Promise.all([
    cargarFamilia(id),
    miembrosDeFamilia(id),
    sb.rpc('buscar_aportaciones', {
      p_filtros: { familia_id: id, estado: 'REGISTRADA', desde: `${anio - 1}-01-01` },
      p_limite: 50000, p_desplazamiento: 0, p_orden: 'fecha_desc',
    }),
  ]);
  if (!f) {
    pintar(cont, alerta('error', 'La familia solicitada no existe.'));
    return;
  }
  if (historial.error) throw historial.error;
  titulo(f.nombre);

  const filas = historial.data.filas;
  const total = (filtro) => filas.filter(filtro).reduce((s, x) => s + aCentavos(x.monto), 0);
  const deAnio = (a) => (x) => x.fecha_aportacion.startsWith(String(a));
  const direccion = lineasDireccion(miembros.find((m) => m.direccion) || {});

  pintar(cont, html`
    <a class="volver" href="#/familias">${icono('arrow-left')} Familias</a>
    <div class="cabecera">
      <div>
        <h2>${f.nombre}</h2>
        <p><span class="mono">${f.numero_familia}</span> · ${insigniaCarta(f)}</p>
      </div>
      <div class="acciones">
        <a class="btn btn-primario" href="#/cartas?familia=${f.id}">${icono('mail')} Carta anual familiar</a>
        <a class="btn" href="#/estados-cuenta?familia=${f.id}">${icono('file-text')} Estado de cuenta familiar</a>
        <a class="btn" href="#/familias/${f.id}/editar">${icono('edit')} Editar</a>
      </div>
    </div>

    <div class="rejilla rejilla-4">
      ${tarjetaDato(`Total familiar ${anio}`, dineroCentavos(total(deAnio(anio))))}
      ${tarjetaDato(`Total familiar ${anio - 1}`, dineroCentavos(total(deAnio(anio - 1))))}
      ${tarjetaDato('Miembros', entero(miembros.length))}
      ${tarjetaDato(`Aportaciones ${anio}`, entero(filas.filter(deAnio(anio)).length))}
    </div>

    <section class="tarjeta mt-2">
      <div class="tarjeta-titulo"><h3>Miembros de la familia</h3></div>
      ${miembros.length ? html`
        <div class="tabla-contenedor">
          <table class="tabla tabla-compacta">
            <thead><tr><th>Número</th><th>Nombre</th><th>Tipo</th><th>Estado</th><th class="dinero">Total ${anio}</th><th></th></tr></thead>
            <tbody>${miembros.map((m) => html`
              <tr>
                <td class="mono nowrap"><a href="#/miembros/${m.id}">${m.numero_miembro}</a></td>
                <td><a href="#/miembros/${m.id}">${nombreCompleto(m)}</a></td>
                <td>${m.tipo_persona}</td>
                <td>${insigniaActivo(m.activo)}</td>
                <td class="dinero">${dineroCentavos(total((x) => x.miembro_id === m.id && deAnio(anio)(x)))}</td>
                <td class="num"><button type="button" class="btn btn-texto" data-quitar="${m.id}">Quitar</button></td>
              </tr>`)}
            </tbody>
          </table>
        </div>` : html`<div class="vacio">Esta familia aún no tiene miembros. Agréguelos abajo.</div>`}
      <div class="formulario mt-2">
        <div class="campo">
          <label for="selector-miembro">Agregar un miembro existente</label>
          <div id="agregar"></div>
          <div class="ayuda">¿La persona aún no está registrada? <a href="#/miembros/nuevo?familia=${f.id}">Registrar nuevo miembro en esta familia</a>.</div>
        </div>
      </div>
    </section>

    <section class="tarjeta">
      <div class="tarjeta-titulo"><h3>Carta anual</h3></div>
      <dl class="datos">
        <div><dt>Dirigida a</dt><dd><strong>${nombreCartaFamilia(f, miembros)}</strong>
          ${f.nombre_carta ? '' : html`<br><span class="texto-tenue texto-pequeno">Armado con los nombres de los miembros. Puede cambiarlo en Editar.</span>`}</dd></div>
        <div><dt>Dirección</dt><dd>${direccion.length ? direccion.map((l) => html`${l}<br>`) : html`<span class="insignia ambar">Sin dirección</span>`}
          ${direccion.length ? html`<span class="texto-tenue texto-pequeno">Tomada del primer miembro con dirección.</span>` : ''}</dd></div>
        <div><dt>Modalidad</dt><dd>${f.carta_conjunta ? 'Una sola carta para toda la familia' : 'Una carta por persona'}</dd></div>
        <div><dt>Registrada</dt><dd>${fechaHora(f.created_at)}</dd></div>
        ${f.notas ? html`<div style="grid-column:1/-1"><dt>Notas</dt><dd style="white-space:pre-wrap">${f.notas}</dd></div>` : ''}
      </dl>
    </section>

    <section class="tarjeta">
      <div class="tarjeta-titulo"><h3>Administración del registro</h3></div>
      <div class="acciones"><button type="button" class="btn btn-peligro-suave" id="eliminar">${icono('trash')} Eliminar familia</button></div>
      <p class="texto-tenue texto-pequeno mt-1">Eliminar la familia no elimina a sus miembros ni sus aportaciones: solo deja de agruparlos.</p>
    </section>`);

  const recargar = () => detalle({ cont, params, titulo });

  selectorMiembro($('#agregar', cont), {
    soloActivos: false,
    placeholder: 'Buscar por nombre, apellido, número, teléfono o email…',
    alCambiar: async (m) => {
      if (!m) return;
      if (m.familia_id === f.id) {
        aviso(`${nombreCompleto(m)} ya pertenece a esta familia.`, 'error');
        recargar();
        return;
      }
      if (m.familia_id) {
        const otra = await cargarFamilia(m.familia_id);
        const ok = await confirmar({
          titulo: 'Cambiar de familia',
          mensaje: html`<p><strong>${nombreCompleto(m)}</strong> pertenece a la familia <strong>${otra?.nombre || ''}</strong>.</p>
            <p>¿Pasarlo a <strong>${f.nombre}</strong>?</p>`,
          textoConfirmar: 'Cambiar de familia',
        });
        if (!ok) { recargar(); return; }
      }
      const { error } = await sb.from('miembros').update({ familia_id: f.id }).eq('id', m.id);
      if (error) aviso(mensajeError(error), 'error');
      else aviso(`${nombreCompleto(m)} se agregó a ${f.nombre}.`);
      recargar();
    },
  });

  $$('[data-quitar]', cont).forEach((b) => b.addEventListener('click', async () => {
    const m = miembros.find((x) => x.id === b.dataset.quitar);
    const ok = await confirmar({
      titulo: 'Quitar de la familia',
      mensaje: html`<p>¿Quitar a <strong>${nombreCompleto(m)}</strong> de ${f.nombre}?</p>
        <p>La persona y sus aportaciones se conservan; solo deja de formar parte de esta familia.</p>`,
      textoConfirmar: 'Quitar',
    });
    if (!ok) return;
    const { error } = await sb.from('miembros').update({ familia_id: null }).eq('id', m.id);
    if (error) return aviso(mensajeError(error), 'error');
    aviso(`${nombreCompleto(m)} ya no forma parte de ${f.nombre}.`);
    recargar();
  }));

  $('#eliminar', cont).addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Eliminar familia',
      mensaje: html`<p>¿Eliminar la familia <strong>${f.nombre}</strong> (${f.numero_familia})?</p>
        <p>Sus ${entero(miembros.length)} miembro(s) y todas sus aportaciones se conservan. La acción queda registrada en la bitácora.</p>`,
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    const { error } = await sb.from('familias').delete().eq('id', f.id);
    if (error) return aviso(mensajeError(error), 'error');
    aviso('Familia eliminada.');
    location.hash = '#/familias';
  });
}

function tarjetaDato(etiqueta, valor) {
  return html`<div class="tarjeta indicador"><div class="etiqueta">${etiqueta}</div><div class="valor" style="font-size:22px">${valor}</div></div>`;
}
