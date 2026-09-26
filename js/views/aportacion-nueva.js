// Registro de una nueva aportación (y registro de correcciones).
import { sb } from '../supabase.js';
import { fondosActivos, metodosActivos, registrarEvento } from '../state.js';
import {
  html, pintar, $, $$, alerta, mensajeError, parsearMonto, parsearMontoOCero, hoyISO, fecha, fechaValida,
  dinero, nombreCompleto, aCentavos,
} from '../utils.js';
import { icono } from '../icons.js';
import { selectorMiembro, cargarMiembro, cargarAnonimo, opciones, uuid, insigniaEstado } from '../components.js';
import { pdfRecibo, mostrarPDF, descargarPDF } from '../pdf.js';

// Valores recordados entre registros consecutivos (captura por lotes).
const memoria = { fecha: null, fondo_id: null, metodo_pago_id: null };

export async function render({ cont, query, titulo }) {
  const corrigeId = query.get('corrige');
  let original = null;
  if (corrigeId) {
    const { data, error } = await sb.from('v_aportaciones').select('*').eq('id', corrigeId).maybeSingle();
    if (error) throw error;
    if (!data) {
      pintar(cont, alerta('error', 'La aportación a corregir no existe.'));
      return;
    }
    if (data.estado === 'CORREGIDA') {
      pintar(cont, alerta('advertencia', html`La aportación ${data.numero_recibo} ya fue corregida por el recibo
        <a href="#/aportaciones/${data.corregida_por_id}">${data.corregida_por_numero_recibo}</a>.`));
      return;
    }
    original = data;
  }
  titulo(original ? 'Corregir aportación' : 'Nueva aportación');

  const idMiembro = original?.miembro_id || query.get('miembro');
  const miembro = idMiembro ? await cargarMiembro(idMiembro) : null;
  mostrarFormulario(cont, { original, miembro });
}

function mostrarFormulario(cont, { original = null, miembro = null } = {}) {
  const hoy = hoyISO();
  const fondos = fondosActivos();
  const metodos = metodosActivos();
  const idPendiente = uuid();

  if (!fondos.length || !metodos.length) {
    pintar(cont, alerta('advertencia', html`Para registrar aportaciones debe existir al menos un fondo y un método de pago activos.
      Revise <a href="#/fondos">Fondos</a> y <a href="#/metodos-pago">Métodos de pago</a>.`));
    return;
  }

  const inicial = original
    ? {
      fecha: original.fecha_aportacion,
      fondo_id: original.fondo_id,
      metodo_pago_id: original.metodo_pago_id,
      monto: Number(original.monto).toFixed(2),
      referencia: original.referencia_pago || '',
      bienes: original.bienes_servicios,
      valor_bienes: original.valor_bienes_servicios != null ? Number(original.valor_bienes_servicios).toFixed(2) : '',
      desc_bienes: original.descripcion_bienes_servicios || '',
      descripcion: original.descripcion || '',
    }
    : {
      fecha: memoria.fecha || hoy,
      fondo_id: memoria.fondo_id || fondos[0].id,
      metodo_pago_id: memoria.metodo_pago_id || metodos[0].id,
      monto: '', referencia: '', bienes: false, valor_bienes: '', desc_bienes: '', descripcion: '',
    };
  if (!fondos.some((f) => f.id === inicial.fondo_id)) inicial.fondo_id = fondos[0].id;
  if (!metodos.some((m) => m.id === inicial.metodo_pago_id)) inicial.metodo_pago_id = metodos[0].id;

  pintar(cont, html`
    <div class="form-aportacion">
      ${original ? html`
        <a class="volver" href="#/aportaciones/${original.id}">${icono('arrow-left')} Volver a la aportación</a>
        ${alerta('advertencia', html`
          <p><strong>Corrección del recibo ${original.numero_recibo}</strong> ${insigniaEstado(original.estado)}</p>
          <p>${original.miembro_nombre} ${original.miembro_apellido} · ${fecha(original.fecha_aportacion)} · ${original.fondo_nombre} ·
             ${dinero(original.monto)} · ${original.metodo_pago_nombre}</p>
          <p>La aportación original se conservará en el historial marcada como <strong>CORREGIDA</strong> y se generará un nuevo recibo.</p>`)}
      ` : html`
        <div class="cabecera"><div><h2>Nueva aportación</h2><p>Los campos marcados con * son obligatorios.</p></div>
          <div class="acciones"><a class="btn" href="#/aportaciones">${icono('list')} Historial</a></div></div>`}

      <form id="form-aportacion" class="tarjeta formulario ${original ? 'mt-2' : ''}" novalidate>
        <div id="mensaje"></div>
        <div class="campo">
          <label class="requerido" for="selector-miembro">Miembro / donante</label>
          <div id="miembro"></div>
          <div class="rapidos">
            <button type="button" class="chip" id="anonima">Aportación anónima</button>
          </div>
        </div>
        <div class="fila-campos">
          <div class="campo">
            <label class="requerido" for="fecha">Fecha</label>
            <input id="fecha" class="entrada" type="date" max="${hoy}" min="2000-01-01" value="${inicial.fecha}" required>
          </div>
          <div class="campo">
            <label class="requerido" for="fondo">Fondo</label>
            <select id="fondo" class="entrada">${opciones(fondos.map((f) => ({ valor: f.id, texto: f.nombre })), inicial.fondo_id)}</select>
          </div>
        </div>
        <div class="fila-campos">
          <div class="campo">
            <label class="requerido" for="monto">Monto (USD)</label>
            <div class="con-prefijo">
              <span class="prefijo">$</span>
              <input id="monto" class="entrada entrada-grande" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${inicial.monto}">
            </div>
          </div>
          <div class="campo">
            <label class="requerido" for="metodo">Método de pago</label>
            <select id="metodo" class="entrada">${opciones(metodos.map((m) => ({ valor: m.id, texto: m.nombre })), inicial.metodo_pago_id)}</select>
          </div>
        </div>
        <div class="campo">
          <label for="referencia">Referencia</label>
          <input id="referencia" class="entrada" maxlength="100" autocomplete="off" value="${inicial.referencia}"
                 placeholder="Número de cheque, confirmación de Zelle/ACH, etc.">
          <div class="ayuda">No registre números completos de tarjeta, cuentas bancarias, CVV ni contraseñas.</div>
        </div>
        <div class="campo">
          <label for="bienes">¿Se proporcionaron bienes o servicios a cambio?</label>
          <select id="bienes" class="entrada" style="max-width:220px">
            ${opciones([{ valor: 'no', texto: 'No' }, { valor: 'si', texto: 'Sí' }], inicial.bienes ? 'si' : 'no')}
          </select>
        </div>
        <div id="bloque-bienes" class="fila-campos" ${inicial.bienes ? '' : 'hidden'}>
          <div class="campo">
            <label class="requerido" for="valor-bienes">Valor estimado de los bienes o servicios</label>
            <div class="con-prefijo"><span class="prefijo">$</span>
              <input id="valor-bienes" class="entrada" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${inicial.valor_bienes}"></div>
          </div>
          <div class="campo">
            <label class="requerido" for="desc-bienes">Descripción de los bienes o servicios</label>
            <input id="desc-bienes" class="entrada" maxlength="200" value="${inicial.desc_bienes}" placeholder="Ej.: cena de gala, libro, camiseta">
          </div>
        </div>
        <div class="campo">
          <label for="descripcion">Descripción / notas</label>
          <textarea id="descripcion" class="entrada" rows="2" maxlength="500">${inicial.descripcion}</textarea>
        </div>
        ${original?.estado === 'REGISTRADA' ? html`
          <div class="campo">
            <label class="requerido" for="motivo">Motivo de la corrección</label>
            <textarea id="motivo" class="entrada" rows="2" maxlength="500" placeholder="Explique el error que se corrige (mínimo 5 caracteres)"></textarea>
          </div>` : ''}
        ${original?.estado === 'ANULADA' ? html`<p class="texto-tenue texto-pequeno">Motivo de la anulación registrado: ${original.motivo_anulacion}</p>` : ''}
        <div class="acciones">
          <button type="submit" class="btn btn-primario btn-grande" id="guardar">
            ${icono('check')} ${original ? 'GUARDAR CORRECCIÓN' : 'GUARDAR APORTACIÓN'}
          </button>
          <a class="btn btn-grande" href="${original ? `#/aportaciones/${original.id}` : '#/inicio'}">Cancelar</a>
        </div>
      </form>
    </div>`);

  const selector = selectorMiembro($('#miembro', cont), { inicial: miembro, soloActivos: !original });
  if (!miembro) selector.enfocar(); else $('#monto', cont).focus();

  $('#anonima', cont).addEventListener('click', async () => {
    try {
      const anonimo = await cargarAnonimo();
      if (!anonimo) {
        pintar($('#mensaje', cont), alerta('error', 'Falta instalar las aportaciones anónimas en la base de datos (migración 08).'));
        return;
      }
      selector.establecer(anonimo);
      $('#monto', cont).focus();
    } catch (err) {
      pintar($('#mensaje', cont), alerta('error', mensajeError(err)));
    }
  });

  const bienes = $('#bienes', cont);
  bienes.addEventListener('change', () => { $('#bloque-bienes', cont).hidden = bienes.value !== 'si'; });

  const monto = $('#monto', cont);
  monto.addEventListener('blur', () => {
    const v = parsearMonto(monto.value);
    if (v) monto.value = Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  const form = $('#form-aportacion', cont);
  let enviando = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    $$('[aria-invalid]', form).forEach((x) => x.removeAttribute('aria-invalid'));
    const errores = [];
    const marcar = (el, msg) => { el?.setAttribute('aria-invalid', 'true'); errores.push(msg); };

    const m = selector.obtener();
    const f = $('#fecha', cont).value;
    const montoOk = parsearMonto(monto.value);
    const conBienes = bienes.value === 'si';
    const valorBienes = conBienes ? parsearMontoOCero($('#valor-bienes', cont).value) : null;
    const descBienes = conBienes ? $('#desc-bienes', cont).value.trim() : null;
    const motivo = $('#motivo', cont)?.value.trim() || null;

    if (!m) marcar($('#selector-miembro', cont), 'Seleccione el miembro o donante.');
    if (!fechaValida(f)) marcar($('#fecha', cont), 'Indique una fecha válida.');
    else if (f > hoyISO()) marcar($('#fecha', cont), 'La fecha no puede ser posterior a hoy.');
    else if (f < '2000-01-01') marcar($('#fecha', cont), 'La fecha no es válida.');
    if (!montoOk) marcar(monto, 'Indique un monto válido mayor que $0.00 (máximo dos decimales).');
    if (conBienes) {
      if (valorBienes === null) marcar($('#valor-bienes', cont), 'Indique el valor estimado de los bienes o servicios.');
      else if (montoOk && aCentavos(valorBienes) > aCentavos(montoOk)) marcar($('#valor-bienes', cont), 'El valor de los bienes o servicios no puede exceder el monto.');
      if (!descBienes) marcar($('#desc-bienes', cont), 'Describa los bienes o servicios proporcionados.');
    }
    if (original?.estado === 'REGISTRADA' && (!motivo || motivo.length < 5)) {
      marcar($('#motivo', cont), 'Indique el motivo de la corrección (mínimo 5 caracteres).');
    }
    if (errores.length) {
      pintar($('#mensaje', cont), alerta('error', html`${errores.map((x) => html`<p>${x}</p>`)}`));
      $('[aria-invalid="true"]', form)?.focus();
      return;
    }

    const datos = {
      miembro_id: m.id,
      fecha_aportacion: f,
      fondo_id: $('#fondo', cont).value,
      monto: montoOk,
      metodo_pago_id: $('#metodo', cont).value,
      referencia_pago: $('#referencia', cont).value.trim() || null,
      bienes_servicios: conBienes,
      valor_bienes_servicios: conBienes ? valorBienes : null,
      descripcion_bienes_servicios: conBienes ? descBienes : null,
      descripcion: $('#descripcion', cont).value.trim() || null,
    };

    enviando = true;
    const boton = $('#guardar', cont);
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    let idNuevo = null;
    let error = null;
    if (original) {
      const r = await sb.rpc('corregir_aportacion', { p_aportacion_id: original.id, p_motivo: motivo, p_datos: datos });
      error = r.error;
      idNuevo = r.data?.id;
    } else {
      // El id se genera en el navegador: si la conexión falla y se reintenta,
      // no se duplica la aportación (la clave primaria lo impide).
      const r = await sb.from('aportaciones').insert({ id: idPendiente, ...datos }).select('id').single();
      error = r.error;
      idNuevo = r.data?.id;
      if (error && error.code === '23505' && /aportaciones_pkey/.test(error.message || '')) {
        error = null;
        idNuevo = idPendiente;
      }
    }

    if (error) {
      enviando = false;
      boton.disabled = false;
      pintar(boton, html`${icono('check')} ${original ? 'GUARDAR CORRECCIÓN' : 'GUARDAR APORTACIÓN'}`);
      pintar($('#mensaje', cont), alerta('error', mensajeError(error)));
      window.scrollTo(0, 0);
      return;
    }

    memoria.fecha = datos.fecha_aportacion;
    memoria.fondo_id = datos.fondo_id;
    memoria.metodo_pago_id = datos.metodo_pago_id;

    const { data: registrada, error: errLectura } = await sb.from('v_aportaciones').select('*').eq('id', idNuevo).single();
    if (errLectura) {
      pintar(cont, alerta('exito', html`Aportación registrada correctamente. <a href="#/aportaciones/${idNuevo}">Ver aportación</a>`));
      return;
    }
    mostrarExito(cont, registrada, m, original);
  });
}

function mostrarExito(cont, a, miembro, original) {
  pintar(cont, html`
    <div class="tarjeta exito-registro form-aportacion" role="status">
      <div class="icono-exito">${icono('check')}</div>
      <h2>${original ? 'Corrección registrada correctamente.' : 'Aportación registrada correctamente.'}</h2>
      <div class="recibo-numero">${a.numero_recibo}</div>
      <p class="resumen">
        ${miembro.es_anonimo ? 'Aportación anónima' : `${nombreCompleto(miembro)} — ${miembro.numero_miembro}`}<br>
        ${a.fondo_nombre} · <strong>${dinero(a.monto)}</strong> · ${a.metodo_pago_nombre}${a.referencia_pago ? ` #${a.referencia_pago}` : ''} · ${fecha(a.fecha_aportacion)}
        ${original ? html`<br><span class="texto-tenue">Reemplaza al recibo ${original.numero_recibo}</span>` : ''}
      </p>
      <div class="acciones">
        <button type="button" class="btn btn-primario" id="ver-recibo">${icono('eye')} VER RECIBO</button>
        <button type="button" class="btn" id="pdf-recibo">${icono('download')} GENERAR PDF</button>
        <button type="button" class="btn" id="nueva">${icono('plus-circle')} NUEVA APORTACIÓN</button>
      </div>
      <div class="acciones mt-2">
        ${miembro.activo !== false ? html`<button type="button" class="btn btn-texto" id="otra-mismo">${miembro.es_anonimo ? 'Otra aportación anónima' : `Otra aportación de ${miembro.nombre}`}</button>` : ''}
        <a class="btn btn-texto" href="#/aportaciones/${a.id}">Ver detalle</a>
      </div>
    </div>`);

  const generar = async () => {
    const doc = await pdfRecibo(a, miembro);
    registrarEvento('GENERAR_RECIBO', { tabla: 'aportaciones', registroId: a.id, descripcion: `Recibo ${a.numero_recibo}` });
    return doc;
  };
  $('#ver-recibo', cont).addEventListener('click', async () => mostrarPDF(await generar(), `Recibo-${a.numero_recibo}.pdf`, { titulo: `Recibo ${a.numero_recibo}` }));
  $('#pdf-recibo', cont).addEventListener('click', async () => descargarPDF(await generar(), `Recibo-${a.numero_recibo}.pdf`));
  $('#nueva', cont).addEventListener('click', () => {
    if (location.hash !== '#/aportaciones/nueva') location.hash = '#/aportaciones/nueva';
    else mostrarFormulario(cont);
  });
  $('#otra-mismo', cont)?.addEventListener('click', () => mostrarFormulario(cont, { miembro }));
  $('#ver-recibo', cont).focus();
}
