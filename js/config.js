// =====================================================================
// Configuración de conexión a Supabase
//
// Obtenga estos valores en Supabase → Project Settings → API:
//   • SUPABASE_URL      → "Project URL"
//   • SUPABASE_ANON_KEY → clave pública "anon" o "publishable"
//
// La clave pública está diseñada para usarse en el navegador: la
// seguridad la garantizan Supabase Auth + Row Level Security.
//
// ⚠ NUNCA coloque aquí la clave "service_role" / "secret" ni la
//   contraseña de la base de datos. La aplicación se negará a iniciar
//   si detecta una clave secreta.
// =====================================================================

export const CONFIG = {
  SUPABASE_URL: 'https://wvlkvtpcwfokpjfnpoxo.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_I6BeKtuPRzsYBKI2a9Jjyw_8QU_Obxk',

  // Minutos de inactividad antes de cerrar la sesión automáticamente (0 = desactivado).
  MINUTOS_INACTIVIDAD: 30,
};
