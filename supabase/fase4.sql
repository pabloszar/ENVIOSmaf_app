-- ════════════════════════════════════════════════════════════════════════════
-- Envíos MAF — Migración Fase 4 (Venta vs. ingreso · Fondo de renta)
-- Ejecutar completo en el SQL Editor de Supabase. Es idempotente.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- 1. VENTA VS. INGRESO
-- ════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora todo se llamaba "ingreso", pero son dos cosas distintas:
--
--   Venta    lo que se facturó. Existe desde que se entrega el flete.
--   Cobrado  el dinero que de verdad entró. Es lo único que se puede gastar.
--
-- La diferencia importa al presentar resultados: un mes con mucha venta y
-- poco cobrado no es un buen mes, es un mes con clientes que deben.
--
-- Regla de cobro:
--   · Contado  → se da por cobrado cuando la ruta se entrega. Se paga en mano
--                al momento de la entrega, así que no hay recibo que capturar.
--   · Crédito  → solo cuenta lo que tenga un cobro registrado en `cobros`.
--   · Ninguno  → una ruta que todavía no se entrega no ha cobrado nada,
--                aunque ya esté vendida.

create or replace view v_envio_cobro as
select
  e.id                        as envio_id,
  e.ruta_id,
  r.fecha,
  r.estado,
  e.destino,
  e.cliente_id,
  e.a_credito,
  e.precio                    as venta,
  coalesce((select sum(c.monto) from cobros c where c.envio_id = e.id), 0) as cobros_registrados,
  case
    -- `least` protege de un cobro capturado de más: nadie cobra más de lo que
    -- vendió, y si pasa no debe inflar el ingreso del mes.
    when e.a_credito then least(
      e.precio,
      coalesce((select sum(c.monto) from cobros c where c.envio_id = e.id), 0))
    when r.estado = 'entregada' then e.precio
    else 0
  end                         as cobrado
from envios e
join rutas r on r.id = e.ruta_id
where r.estado <> 'cancelada';


create or replace view v_ruta_cobro as
select
  ruta_id,
  sum(venta)                as venta,
  sum(cobrado)              as cobrado,
  sum(venta) - sum(cobrado) as por_cobrar
from v_envio_cobro
group by ruta_id;


-- Venta y cobro por mes, para el tablero.
create or replace view v_cobro_mensual as
select
  date_trunc('month', fecha)::date as mes,
  sum(venta)                       as venta,
  sum(cobrado)                     as cobrado,
  sum(venta) - sum(cobrado)        as por_cobrar,
  sum(venta) filter (where a_credito)   as venta_credito,
  sum(venta) filter (where not a_credito) as venta_contado
from v_envio_cobro
group by 1;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. FONDO DE RENTA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Las unidades son de Tiendas MAF. Envíos MAF le retiene a cada flete un
-- porcentaje (35% en unidad rentada, 25% en propia) que NO es suyo: se aparta
-- en un fondo y de ahí salen los pagos cuando Tiendas MAF los pide, ya sea
-- como entrega directa o como mantenimiento y trámites legales pagados por su
-- cuenta.
--
-- Por qué una tabla nueva y no un `gasto`:
-- la renta ya está descontada en `v_ruta_pnl.utilidad`. Registrar el pago como
-- gasto operativo lo restaría DOS VECES y hundiría el margen sin razón. Este
-- movimiento no toca el P&L: mueve dinero de una bolsa apartada hacia afuera.
--
-- Lo devengado NO se guarda: se lee de `v_ruta_pnl`, que respeta el
-- config_snapshot de cada ruta. Copiarlo a una tabla lo dejaría desalineado el
-- día que se corrija un precio.

create table if not exists pagos_renta (
  id           uuid primary key default gen_random_uuid(),
  fecha        date         not null default current_date,
  monto        numeric(12,2) not null check (monto > 0),
  -- entrega = se le dio el dinero a Tiendas MAF
  -- mantenimiento / legal = se pagó por su cuenta, con cargo al fondo
  concepto     text         not null default 'entrega',
  vehiculo_id  uuid         references vehiculos(id) on delete set null,
  metodo       text,
  referencia   text,                      -- folio, transferencia, nota externa
  notas        text,
  creado_en    timestamptz  not null default now()
);

create index if not exists idx_pagos_renta_fecha    on pagos_renta (fecha desc);
create index if not exists idx_pagos_renta_vehiculo on pagos_renta (vehiculo_id);

-- RLS encendido y sin políticas: ni siquiera con la anon key filtrada se puede
-- leer. Todo pasa por el servidor, como el resto de las tablas.
alter table pagos_renta enable row level security;


-- Lo que cada viaje entregado aportó al fondo.
create or replace view v_renta_por_ruta as
select
  p.ruta_id, p.folio, p.fecha, p.vehiculo_id, p.vehiculo, p.propiedad,
  p.ingreso, p.renta_unidad
from v_ruta_pnl p
where p.estado = 'entregada' and p.renta_unidad > 0;


-- Saldo del fondo. Solo cuentan las rutas entregadas: una ruta agendada
-- todavía no generó renta porque el viaje no ha ocurrido.
create or replace view v_fondo_renta as
with dev as (select coalesce(sum(renta_unidad), 0) as m from v_ruta_pnl where estado = 'entregada'),
     pag as (select coalesce(sum(monto), 0) as m from pagos_renta),
     ent as (select coalesce(sum(monto), 0) as m from pagos_renta where concepto = 'entrega'),
     apl as (select coalesce(sum(monto), 0) as m from pagos_renta where concepto <> 'entrega')
select
  dev.m as devengado,        -- lo que se le retuvo a los fletes
  pag.m as pagado,           -- todo lo que ya salió del fondo
  ent.m as entregado,        -- se le dio directo a Tiendas MAF
  apl.m as aplicado,         -- mantenimiento y legales pagados por su cuenta
  dev.m - pag.m as saldo     -- lo que sigue guardado y no es nuestro
from dev, pag, ent, apl;


-- El mismo saldo, unidad por unidad.
create or replace view v_fondo_renta_unidad as
select
  v.id                             as vehiculo_id,
  v.nombre                         as vehiculo,
  v.propiedad,
  coalesce(d.devengado, 0)         as devengado,
  coalesce(p.pagado, 0)            as pagado,
  coalesce(d.devengado, 0) - coalesce(p.pagado, 0) as saldo,
  d.viajes
from vehiculos v
left join (
  select vehiculo_id, sum(renta_unidad) as devengado, count(*) as viajes
  from v_ruta_pnl where estado = 'entregada' group by 1
) d on d.vehiculo_id = v.id
left join (
  select vehiculo_id, sum(monto) as pagado from pagos_renta group by 1
) p on p.vehiculo_id = v.id;


-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación
-- ════════════════════════════════════════════════════════════════════════════
select
  (select count(*) from v_envio_cobro)                as envios_con_cobro,
  (select sum(venta)   from v_envio_cobro)            as venta_total,
  (select sum(cobrado) from v_envio_cobro)            as cobrado_total,
  (select sum(venta) - sum(cobrado) from v_envio_cobro) as por_cobrar,
  (select devengado from v_fondo_renta)               as fondo_devengado,
  (select saldo     from v_fondo_renta)               as fondo_saldo;
