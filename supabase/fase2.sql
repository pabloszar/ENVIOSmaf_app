-- ════════════════════════════════════════════════════════════════════════════
-- Envíos MAF — Migración Fase 2 (Dinero)
-- Ejecutar completo en el SQL Editor de Supabase. Es idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Contado vs. crédito ─────────────────────────────────────────────────────
-- La mayoría de los fletes se cobran al entregar (contado). Solo algunos
-- clientes pagan después (crédito). Solo esos aparecen en cuentas por cobrar.
-- Los históricos quedan como contado (default), que es lo que fueron.

alter table envios add column if not exists a_credito boolean not null default false;


-- ── Cuentas por cobrar: solo crédito con saldo pendiente ────────────────────
-- Se recrea desde cero: `create or replace` no permite reordenar columnas y la
-- vista ahora expone `ruta_id` para poder saltar del cobro a su ruta.
drop view if exists v_cuentas_por_cobrar;
create view v_cuentas_por_cobrar as
select
  e.id                                as envio_id,
  r.id                                as ruta_id,
  r.folio,
  r.fecha,
  e.destino,
  e.cliente_id,
  c.nombre                            as cliente,
  c.dias_credito,
  e.precio,
  coalesce(sum(co.monto), 0)          as cobrado,
  e.precio - coalesce(sum(co.monto), 0) as saldo,
  current_date - r.fecha              as dias_transcurridos,
  (current_date - r.fecha) > coalesce(c.dias_credito, 0) as vencido
from envios e
join rutas r          on r.id = e.ruta_id and r.estado <> 'cancelada'
left join contactos c on c.id = e.cliente_id
left join cobros co   on co.envio_id = e.id
where e.a_credito = true
group by e.id, r.id, r.folio, r.fecha, e.destino, e.cliente_id, c.nombre, c.dias_credito, e.precio
having e.precio - coalesce(sum(co.monto), 0) > 0.005;


-- ── Caja mensual ────────────────────────────────────────────────────────────
-- Flujo real de efectivo, no devengado:
--   Entradas = ventas de contado entregadas + cobros de crédito recibidos.
--   Salidas  = todos los gastos (operativos, inversión, retiros) +
--              comisiones efectivamente pagadas.
create or replace view v_caja_mensual as
with meses as (
  select date_trunc('month', fecha)::date as mes from rutas
  union select date_trunc('month', fecha)::date from gastos
  union select date_trunc('month', fecha)::date from cobros
),
ent_contado as (
  select date_trunc('month', r.fecha)::date as mes, sum(e.precio) as monto
  from envios e
  join rutas r on r.id = e.ruta_id
  where r.estado = 'entregada' and e.a_credito = false
  group by 1
),
ent_credito as (
  select date_trunc('month', fecha)::date as mes, sum(monto) as monto
  from cobros group by 1
),
sal_gastos as (
  select date_trunc('month', fecha)::date as mes,
         sum(monto)                                   as total,
         sum(monto) filter (where tipo = 'operativo') as operativo,
         sum(monto) filter (where tipo = 'inversion') as inversion,
         sum(monto) filter (where tipo = 'retiro')    as retiro
  from gastos group by 1
),
sal_comisiones as (
  select date_trunc('month', coalesce(fecha_pago, creado_en::date))::date as mes,
         sum(monto) as monto
  from comisiones where estado = 'pagada' group by 1
)
select
  m.mes,
  coalesce(ec.monto, 0)                        as entradas_contado,
  coalesce(ek.monto, 0)                        as entradas_credito,
  coalesce(ec.monto, 0) + coalesce(ek.monto, 0) as entradas,
  coalesce(sg.operativo, 0)                    as salidas_operativas,
  coalesce(sg.inversion, 0)                    as salidas_inversion,
  coalesce(sg.retiro, 0)                       as salidas_retiro,
  coalesce(sc.monto, 0)                        as salidas_comisiones,
  coalesce(sg.total, 0) + coalesce(sc.monto, 0) as salidas,
  coalesce(ec.monto, 0) + coalesce(ek.monto, 0)
    - coalesce(sg.total, 0) - coalesce(sc.monto, 0) as flujo_neto
from meses m
left join ent_contado    ec on ec.mes = m.mes
left join ent_credito    ek on ek.mes = m.mes
left join sal_gastos     sg on sg.mes = m.mes
left join sal_comisiones sc on sc.mes = m.mes
order by m.mes desc;
