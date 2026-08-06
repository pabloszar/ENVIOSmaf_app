-- ════════════════════════════════════════════════════════════════════════════
-- Envíos MAF — Migración Fase 3 (Rentabilidad)
-- Ejecutar completo en el SQL Editor de Supabase. Es idempotente.
--
-- Requiere haber corrido antes schema.sql y fase2.sql.
--
-- La utilidad nace a nivel RUTA (ahí viven los gastos). Para poder cortar la
-- rentabilidad por cliente, destino o tamaño de carga hace falta bajarla al
-- ENVÍO, y eso es lo que hace v_envio_pnl: reparte los costos de la ruta entre
-- sus paradas en proporción a lo que cobró cada una. Todo lo demás se apoya
-- en esa vista.
-- ════════════════════════════════════════════════════════════════════════════


-- ── P&L por envío (base de todos los cortes) ────────────────────────────────
-- Cada parada se queda con su ingreso completo y con la parte proporcional de
-- los costos del viaje. El criterio de reparto es la participación en el
-- ingreso de la ruta: quien cobró más caro carga más gasolina. Si una ruta no
-- cobró nada (cotización, cortesía), se reparte en partes iguales.
drop view if exists v_envio_pnl cascade;   -- las vistas de abajo dependen de ella
create view v_envio_pnl as
with tot as (
  select ruta_id,
         sum(precio)  as ingreso_ruta,
         count(*)::int as paradas
  from envios
  group by ruta_id
),
base as (
  select
    e.id as envio_id, e.ruta_id, e.secuencia, e.destino, e.zona,
    e.cliente_id, e.vendedor_id, e.tamano_carga, e.distancia_km,
    e.precio, e.a_credito,
    t.paradas,
    case when t.ingreso_ruta > 0 then e.precio / t.ingreso_ruta
         else 1.0 / t.paradas end as parte
  from envios e
  join tot t on t.ruta_id = e.ruta_id
)
select
  b.envio_id,
  b.ruta_id,
  p.folio,
  p.fecha,
  p.estado,
  p.vehiculo_id,
  p.vehiculo,
  b.secuencia,
  b.destino,
  -- Mientras no se capture la zona, el destino hace de zona.
  coalesce(nullif(btrim(b.zona), ''), b.destino) as zona,
  b.cliente_id,
  cl.nombre                                      as cliente,
  b.vendedor_id,
  b.tamano_carga,
  b.distancia_km,
  b.a_credito,
  b.paradas,
  round(b.parte, 4)                              as parte,
  b.precio                                       as ingreso,
  round(p.gastos_directos * b.parte, 2)          as gastos_viaje,
  round(p.gasolina        * b.parte, 2)          as gasolina,
  round(p.casetas         * b.parte, 2)          as casetas,
  round(p.comisiones      * b.parte, 2)          as comisiones,
  round(p.renta_unidad    * b.parte, 2)          as renta_unidad,
  round(p.admon           * b.parte, 2)          as admon,
  round(p.utilidad        * b.parte, 2)          as utilidad,
  case when b.precio > 0
       then round(p.utilidad * b.parte / b.precio * 100, 1) end as margen_pct
from base b
join v_ruta_pnl p      on p.ruta_id = b.ruta_id   -- excluye rutas canceladas
left join contactos cl on cl.id = b.cliente_id;


-- ── P&L mensual del negocio ─────────────────────────────────────────────────
-- Reemplaza la versión de schema.sql: además de la utilidad, ahora muestra a
-- dónde se fue cada peso (gasolina, casetas, comisiones, renta, administración)
-- y los indicadores por kilómetro.
--
-- Los indicadores por km se calculan SOLO con las rutas que sí tienen km
-- capturados; mezclarlas con las que no los tienen inflaría el costo por km.
drop view if exists v_pnl_mensual;
create view v_pnl_mensual as
with meses as (
  select date_trunc('month', fecha)::date as mes from rutas
  union
  select date_trunc('month', fecha)::date from gastos
),
op as (
  select
    date_trunc('month', fecha)::date as mes,
    count(*)                  as viajes,
    sum(num_envios)           as paradas,
    sum(ingreso)              as ingreso,
    sum(gasolina)             as gasolina,
    sum(casetas)              as casetas,
    sum(comida)               as comida,
    sum(gastos_directos)      as gastos_viaje,
    sum(comisiones)           as comisiones,
    sum(renta_unidad)         as renta_unidad,
    sum(admon)                as admon,
    sum(utilidad)             as utilidad_operativa
  from v_ruta_pnl
  group by 1
),
conkm as (
  select
    date_trunc('month', fecha)::date as mes,
    sum(km_total)             as km,
    sum(ingreso)              as ingreso_con_km,
    sum(gastos_directos)      as gastos_con_km
  from v_ruta_pnl
  where km_total > 0
  group by 1
),
comgasto as (
  -- El histórico trae comisiones capturadas como gasto de la ruta, no en la
  -- tabla comisiones. Se aíslan para no reportarlas como "otros del viaje".
  select date_trunc('month', g.fecha)::date as mes, sum(g.monto) as monto
  from gastos g
  join v_ruta_pnl p on p.ruta_id = g.ruta_id
  where g.categoria = 'comision' and g.tipo = 'operativo'
  group by 1
),
fijos as (
  select
    date_trunc('month', fecha)::date as mes,
    sum(monto) filter (where tipo = 'operativo') as gastos_fijos,
    sum(monto) filter (where tipo = 'inversion') as inversion,
    sum(monto) filter (where tipo = 'retiro')    as retiros
  from gastos
  where ruta_id is null
  group by 1
)
select
  m.mes,
  coalesce(o.viajes, 0)              as viajes,
  coalesce(o.paradas, 0)             as paradas,
  coalesce(o.ingreso, 0)             as ingreso,
  coalesce(o.gasolina, 0)            as gasolina,
  coalesce(o.casetas, 0)             as casetas,
  coalesce(o.comida, 0)              as comida,
  coalesce(o.gastos_viaje, 0)        as gastos_viaje,
  coalesce(o.comisiones, 0)          as comisiones,
  coalesce(cg.monto, 0)              as comision_gasto,
  coalesce(o.renta_unidad, 0)        as renta_unidad,
  coalesce(o.admon, 0)               as admon,
  coalesce(o.utilidad_operativa, 0)  as utilidad_operativa,
  coalesce(f.gastos_fijos, 0)        as gastos_fijos,
  coalesce(o.utilidad_operativa, 0) - coalesce(f.gastos_fijos, 0) as utilidad_neta,
  coalesce(f.inversion, 0)           as inversion,
  coalesce(f.retiros, 0)             as retiros,
  case when coalesce(o.ingreso, 0) > 0
       then round(coalesce(o.utilidad_operativa, 0) / o.ingreso * 100, 1) end
                                     as margen_operativo_pct,
  case when coalesce(o.ingreso, 0) > 0
       then round((coalesce(o.utilidad_operativa, 0) - coalesce(f.gastos_fijos, 0))
                  / o.ingreso * 100, 1) end
                                     as margen_neto_pct,
  coalesce(k.km, 0)                  as km,
  case when coalesce(k.km, 0) > 0 then round(k.ingreso_con_km / k.km, 2) end as ingreso_por_km,
  case when coalesce(k.km, 0) > 0 then round(k.gastos_con_km  / k.km, 2) end as costo_viaje_por_km
from meses m
left join op    o on o.mes = m.mes
left join conkm k on k.mes = m.mes
left join fijos f on f.mes = m.mes
left join comgasto cg on cg.mes = m.mes
order by m.mes desc;


-- ── El efecto de agrupar ────────────────────────────────────────────────────
-- La tesis del negocio: en una ruta con varias paradas los ingresos no se
-- dividen y los gastos sí se comparten. Esta vista la pone a prueba con los
-- datos reales, comparando viajes de una sola parada contra los agrupados.
drop view if exists v_efecto_agrupar;
create view v_efecto_agrupar as
select
  case when p.num_envios > 1 then 'agrupada' else 'sencilla' end as tipo,
  count(*)                                    as viajes,
  sum(p.num_envios)                           as paradas,
  sum(p.ingreso)                              as ingreso,
  sum(p.gastos_directos)                      as gastos_viaje,
  sum(p.utilidad)                             as utilidad,
  case when sum(p.ingreso) > 0
       then round(sum(p.utilidad) / sum(p.ingreso) * 100, 1) end as margen_pct,
  round(sum(p.ingreso)          / sum(p.num_envios), 2) as ingreso_por_parada,
  round(sum(p.gastos_directos)  / sum(p.num_envios), 2) as gasto_viaje_por_parada,
  round(sum(p.utilidad)         / sum(p.num_envios), 2) as utilidad_por_parada
from v_ruta_pnl p
where p.num_envios > 0
group by 1;


-- ── Rentabilidad por cliente ────────────────────────────────────────────────
-- Quién deja dinero, quién solo deja trabajo. `clave` existe para poder
-- agrupar también lo que todavía no tiene cliente capturado.
drop view if exists v_rentabilidad_cliente;
create view v_rentabilidad_cliente as
select
  coalesce(e.cliente_id::text, 'sin-cliente')   as clave,
  e.cliente_id,
  coalesce(e.cliente, 'Sin cliente capturado')  as cliente,
  count(*)                                      as envios,
  sum(e.ingreso)                                as ingreso,
  sum(e.utilidad)                               as utilidad,
  case when sum(e.ingreso) > 0
       then round(sum(e.utilidad) / sum(e.ingreso) * 100, 1) end as margen_pct,
  round(avg(e.ingreso), 2)                      as ticket_promedio,
  max(e.fecha)                                  as ultimo_envio,
  count(*) filter (where e.fecha >= current_date - 90) as envios_90d
from v_envio_pnl e
group by 1, 2, 3;


-- ── Rentabilidad por destino ────────────────────────────────────────────────
-- Sustituye a v_rentabilidad_zona, que solo sabía de ingresos. Agrupa por zona
-- cuando está capturada y por destino mientras no lo esté.
drop view if exists v_rentabilidad_zona;
drop view if exists v_rentabilidad_destino;
create view v_rentabilidad_destino as
select
  e.zona                                as destino,
  count(*)                              as envios,
  sum(e.ingreso)                        as ingreso,
  sum(e.gastos_viaje)                   as gastos_viaje,
  sum(e.utilidad)                       as utilidad,
  case when sum(e.ingreso) > 0
       then round(sum(e.utilidad) / sum(e.ingreso) * 100, 1) end as margen_pct,
  round(avg(e.ingreso), 2)              as precio_promedio,
  round(avg(e.distancia_km), 1)         as km_promedio,
  max(e.fecha)                          as ultimo_envio
from v_envio_pnl e
group by e.zona;


-- ── Rentabilidad por tamaño de carga ────────────────────────────────────────
-- Sirve para calibrar el cotizador: si un tamaño deja siempre menos margen,
-- su multiplicador de precio está corto.
drop view if exists v_rentabilidad_tamano;
create view v_rentabilidad_tamano as
select
  coalesce(e.tamano_carga::text, 'Sin especificar') as tamano,
  case e.tamano_carga
    when 'Chico' then 1 when 'Mediano' then 2
    when 'Grande' then 3 when 'Extra Grande' then 4 else 9 end as orden,
  count(*)                              as envios,
  sum(e.ingreso)                        as ingreso,
  sum(e.utilidad)                       as utilidad,
  case when sum(e.ingreso) > 0
       then round(sum(e.utilidad) / sum(e.ingreso) * 100, 1) end as margen_pct,
  round(avg(e.ingreso), 2)              as precio_promedio,
  round(avg(e.distancia_km), 1)         as km_promedio
from v_envio_pnl e
group by 1, 2;


-- ── Rentabilidad por unidad ─────────────────────────────────────────────────
-- Reemplaza la de schema.sql para añadir lo que de verdad decide si una unidad
-- conviene: la utilidad DESPUÉS de sus gastos fijos (mantenimiento, seguro,
-- tenencia) y el rendimiento por kilómetro.
drop view if exists v_rentabilidad_vehiculo;
create view v_rentabilidad_vehiculo as
with fijos as (
  select vehiculo_id, sum(monto) as gastos_fijos_unidad
  from gastos
  where vehiculo_id is not null and ruta_id is null and tipo = 'operativo'
  group by vehiculo_id
),
conkm as (
  select vehiculo_id, sum(km_total) as km, sum(ingreso) as ingreso_con_km,
         sum(gastos_directos) as gastos_con_km
  from v_ruta_pnl where km_total > 0 group by vehiculo_id
)
select
  v.id                            as vehiculo_id,
  v.nombre                        as vehiculo,
  v.propiedad,
  count(p.ruta_id)                as viajes,
  coalesce(sum(p.ingreso), 0)     as ingreso,
  coalesce(sum(p.utilidad), 0)    as utilidad,
  coalesce(sum(p.renta_unidad), 0) as renta_generada,
  case when sum(p.ingreso) > 0
       then round(sum(p.utilidad) / sum(p.ingreso) * 100, 1) end as margen_pct,
  coalesce(f.gastos_fijos_unidad, 0) as gastos_fijos_unidad,
  coalesce(sum(p.utilidad), 0) - coalesce(f.gastos_fijos_unidad, 0) as utilidad_despues_fijos,
  coalesce(k.km, 0)               as km_recorridos,
  case when coalesce(k.km, 0) > 0 then round(k.ingreso_con_km / k.km, 2) end as ingreso_por_km,
  case when coalesce(k.km, 0) > 0 then round(k.gastos_con_km  / k.km, 2) end as costo_viaje_por_km,
  max(p.fecha)                    as ultimo_viaje
from vehiculos v
left join v_ruta_pnl p on p.vehiculo_id = v.id
left join fijos f      on f.vehiculo_id = v.id
left join conkm k      on k.vehiculo_id = v.id
group by v.id, v.nombre, v.propiedad, f.gastos_fijos_unidad,
         k.km, k.ingreso_con_km, k.gastos_con_km;


-- ── Rentabilidad por chofer ─────────────────────────────────────────────────
-- Reemplaza la de schema.sql para agregar el último viaje y las paradas
-- atendidas, que es lo que distingue a quien hace rutas agrupadas.
drop view if exists v_rentabilidad_chofer;
create view v_rentabilidad_chofer as
select
  c.id                        as contacto_id,
  c.nombre                    as chofer,
  count(distinct p.ruta_id)   as viajes,
  sum(p.num_envios)           as paradas,
  sum(p.ingreso)              as ingreso,
  sum(p.utilidad)             as utilidad,
  case when sum(p.ingreso) > 0
       then round(sum(p.utilidad) / sum(p.ingreso) * 100, 1) end as margen_pct,
  sum(p.com_chofer)           as comisiones_ganadas,
  round(avg(p.ingreso), 2)    as ticket_promedio,
  max(p.fecha)                as ultimo_viaje
from ruta_tripulacion t
join contactos c  on c.id = t.contacto_id
join v_ruta_pnl p on p.ruta_id = t.ruta_id
where t.rol = 'chofer'
group by c.id, c.nombre;
