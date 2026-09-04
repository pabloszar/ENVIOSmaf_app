-- ════════════════════════════════════════════════════════════════════════════
-- Envíos MAF — Migración Fase 7 (Cotizador con mapa · Rutas con ubicación)
-- Ejecutar completo en el SQL Editor de Supabase. Es idempotente.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora los kilómetros de un viaje se escribían a mano, parada por
-- parada, y el destino era un texto suelto: "Metepec". Con eso no se puede
-- calcular la gasolina de verdad ni proponer en qué orden conviene entregar.
--
-- Las columnas para arreglarlo ya existían desde el schema original —
-- `envios.lat/lng`, `rutas.km_osrm`, `roundtrip`, `orden_optimo`— pero nadie
-- las llenaba. Esta fase las pone a trabajar y agrega las dos que faltaban.


-- ── 1. El trayecto dibujado ─────────────────────────────────────────────────
-- La línea que sigue la camioneta, tal como la devolvió OSRM. Se guarda para
-- poder pintar el mapa de una ruta vieja sin volver a preguntarle al servicio:
-- es un dato del viaje que ya ocurrió, no algo que deba recalcularse cada vez
-- que alguien abre la pantalla.

alter table rutas add column if not exists trayecto jsonb;


-- ── 2. Km escritos a mano ───────────────────────────────────────────────────
-- Cuando alguien corrige el kilometraje, ese número gana sobre el calculado.
-- Sin esta bandera, agregar una parada más tarde recalcularía el trayecto y
-- borraría la corrección en silencio.

alter table rutas add column if not exists km_manual boolean not null default false;

-- Todo lo que ya tiene kilometraje se considera escrito a mano, porque lo
-- está: son los km del Excel y los que se capturaron desde entonces. Recalcular
-- sobre ellos reemplazaría un dato real por una estimación.
update rutas set km_manual = true where km_total is not null and km_manual = false;


-- ── 3. Índice para las paradas ubicadas ─────────────────────────────────────
-- El mapa de la lista de rutas pide "las paradas con coordenadas" y hoy eso
-- recorre la tabla entera.

create index if not exists idx_envios_ubicados on envios (ruta_id) where lat is not null;


-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación
-- ════════════════════════════════════════════════════════════════════════════
select
  (select count(*) from rutas)                              as rutas,
  (select count(*) from rutas where km_manual)              as km_a_mano,
  (select count(*) from envios where lat is not null)       as paradas_ubicadas,
  (select count(*) from envios where lat is null)           as paradas_sin_ubicar;
