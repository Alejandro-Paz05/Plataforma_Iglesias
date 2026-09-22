-- =====================================================================
-- Migración 05 · FASE 1: Datos iniciales
-- Fondos, métodos de pago y configuración institucional.
-- Los textos de documentos son editables en Configuración.
-- IMPORTANTE: revise los textos de las cartas anuales con su asesor
-- fiscal/contable antes de emitirlas.
-- =====================================================================

begin;

insert into public.fondos (nombre, descripcion, orden) values
  ('Diezmo',        'Diezmos de los miembros',                 1),
  ('Ofrenda',       'Ofrendas generales',                      2),
  ('Misiones',      'Apoyo a la obra misionera',               3),
  ('Construcción',  'Proyectos de construcción y mejoras',     4),
  ('Fondo General', 'Gastos generales de la iglesia',          5),
  ('Otros',         'Otras aportaciones',                      6)
on conflict (nombre) do nothing;

insert into public.metodos_pago (nombre, orden) values
  ('Efectivo',               1),
  ('Cheque',                 2),
  ('Zelle',                  3),
  ('ACH',                    4),
  ('Transferencia bancaria', 5),
  ('Tarjeta',                6),
  ('Otro',                   7)
on conflict (nombre) do nothing;

insert into public.configuracion_iglesia (
  nombre_iglesia, lema, zona_horaria, cargo_responsable,
  texto_carta_sin_bienes, texto_carta_con_bienes, texto_carta_cierre, texto_pie_recibo
) values (
  'Centro Evangelístico Ebenezer',
  'Tocando a las Naciones',
  'America/New_York',
  'Pastor',
$txt$Estimado(a) {nombre_donante}:

Reciba un cordial saludo en el amor de nuestro Señor Jesucristo. En nombre del {nombre_iglesia}, le expresamos nuestra sincera gratitud por su fidelidad y generosidad durante el año {anio}. Sus aportaciones hacen posible que continuemos cumpliendo la misión que Dios nos ha encomendado.

Por medio de la presente hacemos constar que, durante el período comprendido entre el 1 de enero y el 31 de diciembre de {anio}, usted realizó contribuciones a nuestra iglesia por un total de {total}, según el resumen que se presenta a continuación.

No se proporcionaron bienes ni servicios a cambio de estas contribuciones, salvo beneficios religiosos intangibles.$txt$,
$txt$Estimado(a) {nombre_donante}:

Reciba un cordial saludo en el amor de nuestro Señor Jesucristo. En nombre del {nombre_iglesia}, le expresamos nuestra sincera gratitud por su fidelidad y generosidad durante el año {anio}. Sus aportaciones hacen posible que continuemos cumpliendo la misión que Dios nos ha encomendado.

Por medio de la presente hacemos constar que, durante el período comprendido entre el 1 de enero y el 31 de diciembre de {anio}, usted realizó contribuciones a nuestra iglesia por un total de {total}, según el resumen que se presenta a continuación.

En relación con algunas de estas contribuciones, la iglesia proporcionó bienes o servicios ({descripcion_bienes}) con un valor estimado de {valor_bienes}. El monto de sus contribuciones que excede el valor de dichos bienes o servicios es de {total_deducible}.$txt$,
$txt$Le sugerimos conservar esta carta para sus registros y consultar a su asesor fiscal sobre el tratamiento de sus contribuciones.

Que el Señor le bendiga y le recompense abundantemente.

Con gratitud en Cristo,$txt$,
$txt$Gracias por su generosidad. «Cada uno dé como propuso en su corazón: no con tristeza, ni por necesidad, porque Dios ama al dador alegre.» — 2 Corintios 9:7$txt$
)
on conflict (registro_unico) do nothing;

commit;
