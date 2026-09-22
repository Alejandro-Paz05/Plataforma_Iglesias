// Estado compartido de la sesión: usuario, configuración y catálogos.
import { sb } from './supabase.js';
import { establecerZonaHoraria } from './utils.js';

export const estado = {
  usuario: null,
  config: null,
  fondos: [],
  metodos: [],
};

const CONFIG_PREDETERMINADA = {
  nombre_iglesia: 'Centro Evangelístico Ebenezer',
  lema: 'Tocando a las Naciones',
  zona_horaria: 'America/New_York',
};

export async function cargarConfiguracion() {
  const { data, error } = await sb.from('configuracion_iglesia').select('*').limit(1).maybeSingle();
  if (error) throw error;
  estado.config = data || { ...CONFIG_PREDETERMINADA };
  establecerZonaHoraria(estado.config.zona_horaria);
  return estado.config;
}

export async function cargarCatalogos() {
  const [fondos, metodos] = await Promise.all([
    sb.from('fondos').select('*').order('orden').order('nombre'),
    sb.from('metodos_pago').select('*').order('orden').order('nombre'),
  ]);
  if (fondos.error) throw fondos.error;
  if (metodos.error) throw metodos.error;
  estado.fondos = fondos.data;
  estado.metodos = metodos.data;
}

export const fondosActivos = () => estado.fondos.filter((f) => f.activo);
export const metodosActivos = () => estado.metodos.filter((m) => m.activo);

// Registra un evento en la bitácora sin interrumpir al usuario si falla.
export async function registrarEvento(accion, { tabla = null, registroId = null, descripcion = null, datos = null } = {}) {
  try {
    const { error } = await sb.rpc('registrar_evento', {
      p_accion: accion,
      p_tabla: tabla,
      p_registro_id: registroId,
      p_descripcion: descripcion,
      p_datos: datos,
    });
    if (error) console.warn('Bitácora:', error.message);
  } catch (e) {
    console.warn('Bitácora:', e);
  }
}
