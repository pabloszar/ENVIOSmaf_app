-- ════════════════════════════════════════════════════════════════════════════
-- Envíos MAF — Migración Fase 5 (En manos de quién está el dinero)
-- Ejecutar completo en el SQL Editor de Supabase. Es idempotente.
-- ════════════════════════════════════════════════════════════════════════════
--
-- El problema que resuelve:
--
-- Hasta ahora la app suponía que todo el dinero pasaba por una sola caja. En
-- la realidad no siempre: a veces cobra el chofer, a veces cobra Tiendas MAF
-- en su propia caja, y a veces el gasto de un viaje lo pone alguien más. Ese
-- dinero existe en el negocio, pero no está en tu mano — y por eso la caja de
-- la app no cuadraba con la de verdad.
--
-- La solución es guardar, en cada movimiento, QUIÉN LO TUVO FÍSICAMENTE.
--
--   NULL      = la caja de Envíos MAF. Es lo normal y por eso es el default:
--               no obliga a capturar nada de más en el 95% de los viajes.
--   contacto  = una persona del directorio (el chofer, un vendedor).
--   texto     = alguien que no está en el directorio, como "Tiendas MAF".
--
-- Con eso, el saldo de cada quien es lo que cobró menos lo que pagó de gastos
-- menos lo que ya entregó. Positivo = trae dinero tuyo. Negativo = puso de su
-- bolsa y se le debe.


-- ── 1. Quién recibió el dinero de cada flete ────────────────────────────────
-- Vive en el envío y no en la ruta porque en una ruta de varias paradas puede
-- cobrar el chofer una y la tienda otra.

alter table envios add column if not exists cobrado_por      uuid references contactos(id) on delete set null;
alter table envios add column if not exists cobrado_por_otro text;

create index if not exists idx_envios_cobrado_por on envios (cobrado_por);


-- ── 2. Quién pagó cada gasto ────────────────────────────────────────────────

alter table gastos add column if not exists pagado_por      uuid references contactos(id) on delete set null;
alter table gastos add column if not exists pagado_por_otro text;

create index if not exists idx_gastos_pagado_por on gastos (pagado_por);


-- ── 3. Quién recibió cada cobro de crédito ──────────────────────────────────

alter table cobros add column if not exists recibido_por      uuid references contactos(id) on delete set null;
alter table cobros add column if not exists recibido_por_otro text;

create index if not exists idx_cobros_recibido_por on cobros (recibido_por);


-- ── 4. Entregas de efectivo ─────────────────────────────────────────────────
-- El movimiento que salda la cuenta: alguien te entrega lo que traía, o tú le
-- adelantas dinero para gastos.
--
-- No son `gastos`: aquí el dinero no sale del negocio, solo cambia de bolsillo.
-- Registrarlo como gasto restaría dos veces y hundiría el margen sin motivo,
-- igual que pasaría con los pagos del fondo de renta.

create table if not exists entregas_efectivo (
  id          uuid primary key default gen_random_uuid(),
  fecha       date          not null default current_date,
  -- A quién se le recibe o se le entrega. Uno de los dos, no los dos.
  contacto_id uuid          references contactos(id) on delete set null,
  nombre_otro text,
  monto       numeric(12,2) not null check (monto > 0),
  -- recibo  = me entregó lo que traía   → su saldo baja, tu caja sube
  -- entrego = le di dinero por delante  → su saldo sube, tu caja baja
  direccion   text          not null default 'recibo'
                            check (direccion in ('recibo', 'entrego')),
  metodo      text,
  referencia  text,
  notas       text,
  creado_en   timestamptz   not null default now(),
  -- Una entrega sin destinatario no se puede saldar contra nadie.
  constraint entrega_con_destinatario
    check (contacto_id is not null or nullif(btrim(coalesce(nombre_otro, '')), '') is not null)
);

create index if not exists idx_entregas_fecha    on entregas_efectivo (fecha desc);
create index if not exists idx_entregas_contacto on entregas_efectivo (contacto_id);

-- RLS encendido y sin políticas, como el resto: ni con la anon key filtrada se
-- puede leer. Todo pasa por el servidor.
alter table entregas_efectivo enable row level security;


-- ── 5. Saldo por persona ────────────────────────────────────────────────────
-- Todos los movimientos de efectivo, cada uno con el bolsillo donde cayó.
-- La clave 'caja' agrupa lo que sí está en Envíos MAF.

create or replace view v_movimiento_custodia as
-- Fletes de contado: se dan por cobrados al entregarse.
select
  'flete'::text                                             as clase,
  e.id                                                      as origen_id,
  r.fecha                                                   as fecha,
  r.id                                                      as ruta_id,
  coalesce(e.cobrado_por::text, nullif(btrim(coalesce(e.cobrado_por_otro, '')), ''), 'caja') as custodio,
  e.cobrado_por                                             as contacto_id,
  nullif(btrim(coalesce(e.cobrado_por_otro, '')), '')       as nombre_otro,
  e.precio                                                  as entrada,
  0::numeric                                                as salida
from envios e
join rutas r on r.id = e.ruta_id
where r.estado = 'entregada' and e.a_credito = false

union all
-- Cobros de crédito capturados.
select 'cobro', c.id, c.fecha, e.ruta_id,
  coalesce(c.recibido_por::text, nullif(btrim(coalesce(c.recibido_por_otro, '')), ''), 'caja'),
  c.recibido_por, nullif(btrim(coalesce(c.recibido_por_otro, '')), ''),
  c.monto, 0
from cobros c
join envios e on e.id = c.envio_id

union all
-- Gastos: salen del bolsillo de quien los pagó.
select 'gasto', g.id, g.fecha, g.ruta_id,
  coalesce(g.pagado_por::text, nullif(btrim(coalesce(g.pagado_por_otro, '')), ''), 'caja'),
  g.pagado_por, nullif(btrim(coalesce(g.pagado_por_otro, '')), ''),
  0, g.monto
from gastos g

union all
-- Comisiones pagadas: siempre salen de la caja.
select 'comision', c.id, coalesce(c.fecha_pago, c.creado_en::date), c.ruta_id,
  'caja', null, null, 0, c.monto
from comisiones c
where c.estado = 'pagada'

union all
-- Salidas del fondo de renta: también de la caja.
select 'renta', p.id, p.fecha, null, 'caja', null, null, 0, p.monto
from pagos_renta p

union all
-- La entrega, vista desde la persona.
select 'entrega', x.id, x.fecha, null,
  coalesce(x.contacto_id::text, nullif(btrim(coalesce(x.nombre_otro, '')), ''), 'caja'),
  x.contacto_id, nullif(btrim(coalesce(x.nombre_otro, '')), ''),
  case when x.direccion = 'entrego' then x.monto else 0 end,
  case when x.direccion = 'recibo'  then x.monto else 0 end
from entregas_efectivo x

union all
-- Y la misma entrega, vista desde la caja: lo que sale de un bolsillo entra
-- en el otro. Sin este segundo renglón el dinero se evaporaría al saldarse.
select 'entrega', x.id, x.fecha, null, 'caja', null, null,
  case when x.direccion = 'recibo'  then x.monto else 0 end,
  case when x.direccion = 'entrego' then x.monto else 0 end
from entregas_efectivo x;


-- Se agrupa por las tres columnas y no solo por `custodio` porque las otras
-- dos son constantes dentro de cada grupo: así Postgres no necesita un max()
-- postizo para sacarlas.
create or replace view v_saldo_custodia as
select
  m.custodio,
  m.contacto_id,
  m.nombre_otro,
  coalesce(c.nombre, m.nombre_otro, 'Caja de Envíos MAF') as nombre,
  sum(m.entrada)                          as cobrado,
  sum(m.salida)                           as pagado,
  sum(m.entrada - m.salida)               as saldo,
  count(*)                                as movimientos,
  max(m.fecha)                            as ultimo_movimiento
from v_movimiento_custodia m
left join contactos c on c.id = m.contacto_id
group by m.custodio, m.contacto_id, m.nombre_otro, c.nombre;


-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación — sin datos nuevos, todo debe quedar en 'caja'
-- ════════════════════════════════════════════════════════════════════════════
select custodio, nombre, cobrado, pagado, saldo, movimientos
from v_saldo_custodia
order by saldo desc;
