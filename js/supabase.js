// Cliente de Supabase (una sola instancia para toda la aplicación).
import { CONFIG } from './config.js';

export function configuracionPendiente() {
  if (window.__SB_MOCK__) return false;
  const url = CONFIG.SUPABASE_URL || '';
  const clave = CONFIG.SUPABASE_ANON_KEY || '';
  return !/^https:\/\/.+/.test(url) || url.includes('SU-PROYECTO') || !clave || clave.includes('SU-CLAVE');
}

// Detecta si por error se configuró una clave secreta (service_role / secret).
export function claveEsSecreta() {
  const clave = CONFIG.SUPABASE_ANON_KEY || '';
  if (clave.startsWith('sb_secret_')) return true;
  const partes = clave.split('.');
  if (partes.length === 3) {
    try {
      const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
      const carga = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
      return carga.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

function crearCliente() {
  if (configuracionPendiente() || claveEsSecreta()) return null;
  return window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: {
      // sessionStorage: la sesión termina al cerrar el navegador (equipos compartidos).
      storage: window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

export const sb = crearCliente();
