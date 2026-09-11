-- ════════════════════════════════════════════════════════════════════════════
-- Fase 8 — La app del chofer
--
-- Dos cosas nuevas: que un chofer pueda entrar, y que pueda decir "esta ya la
-- entregué".
--
-- Lo que NO cambia: cerrar la ruta sigue siendo del admin. `rutas.estado =
-- 'entregada'` congela los porcentajes y genera las comisiones, y de ahí
-- cuelga toda la cadena del dinero (v_ruta_pnl, v_caja_mensual). Eso no puede
-- dispararse desde un teléfono en la calle. El chofer reporta hechos; los
-- libros los cierra quien los lleva.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Entrar con un PIN ───────────────────────────────────────────────────────
--
-- El PIN nunca se guarda como se teclea: se guarda su huella PBKDF2 con sal
-- propia, en el formato `pbkdf2$iteraciones$sal$huella`. Con seis dígitos hay
-- un millón de combinaciones, que para una máquina no es nada — por eso el
-- bloqueo de abajo es tan importante como el hash.
alter table contactos add column if not exists pin_hash text;

-- Cinco intentos y a esperar. Sin esto, seis dígitos se prueban todos en una
-- tarde; con esto, quince minutos por cada cinco intentos lo vuelven inviable.
alter table contactos add column if not exists pin_intentos smallint not null default 0;
alter table contactos add column if not exists pin_bloqueado_hasta timestamptz;

comment on column contactos.pin_hash is
  'Huella PBKDF2 del PIN del chofer. Nunca el PIN. null = no puede entrar a /chofer.';

-- ── La entrega, misión por misión ───────────────────────────────────────────
--
-- Hasta ahora "entregado" era de la RUTA. El chofer entrega de una en una y
-- necesita ir palomeando, así que la marca vive en el envío. La de la ruta
-- sigue significando lo de siempre: los libros están cerrados.
alter table envios add column if not exists entregado_en timestamptz;
alter table envios add column if not exists entregado_por uuid references contactos(id);

comment on column envios.entregado_en is
  'Cuándo la marcó entregada el chofer. No cierra la ruta: eso lo hace el admin.';

-- Para la pantalla del chofer, que pregunta siempre lo mismo: qué me falta.
create index if not exists idx_envios_entregado on envios (ruta_id, entregado_en);

-- Los envíos de rutas ya cerradas se dan por entregados el día de la ruta: no
-- tiene sentido que el histórico de un viaje terminado en marzo aparezca a
-- medias porque la columna nació hoy.
update envios e
set entregado_en = (r.fecha::timestamptz + interval '18 hours')
from rutas r
where e.ruta_id = r.id
  and r.estado = 'entregada'
  and e.entregado_en is null;

-- ── Lo que el chofer puede ver ──────────────────────────────────────────────
--
-- Una vista y no un select suelto en la app: así el recorte de columnas queda
-- escrito una sola vez y no depende de que quien escriba la siguiente pantalla
-- se acuerde de no pedir el margen.
--
-- Trae el precio —lo necesita para cobrar— y NO trae gastos, comisiones,
-- utilidad ni margen. La vista no filtra por chofer: eso lo hace la API con el
-- contacto de la sesión, porque el filtro de seguridad no puede depender de
-- que quien consulte se acuerde de ponerlo... pero tampoco puede vivir aquí,
-- donde no hay sesión que consultar.
create or replace view v_mision_chofer as
select
  e.id                as envio_id,
  e.ruta_id,
  e.secuencia,
  e.destino,
  e.zona,
  e.lat,
  e.lng,
  e.tamano_carga,
  e.num_articulos,
  e.num_pisos,
  e.notas             as notas_envio,
  e.precio,
  e.a_credito,
  e.cobro_detallado,
  e.entregado_en,
  coalesce((select sum(c.monto) from cobros c where c.envio_id = e.id), 0) as cobrado,
  (select count(*) from adjuntos a where a.envio_id = e.id)               as evidencias,
  cli.nombre          as cliente,
  cli.telefono        as cliente_telefono,
  r.folio,
  r.fecha,
  r.estado,
  r.roundtrip,
  r.notas             as notas_ruta,
  v.nombre            as vehiculo
from envios e
join rutas r        on r.id = e.ruta_id
left join contactos cli on cli.id = e.cliente_id
left join vehiculos v   on v.id = r.vehiculo_id
where r.estado <> 'cancelada';
