-- ════════════════════════════════════════════════════════════════════════════
-- Envíos MAF — Migración Fase 6
-- Cómo se pagó · Cobrado en tienda · Subcategorías de gasto · Evidencias
-- Ejecutar completo en el SQL Editor de Supabase. Es idempotente.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Esta fase cierra la pregunta que quedó abierta en la 5.
--
-- La fase 5 preguntaba QUIÉN tuvo el dinero. Con el uso quedó claro que la
-- pregunta de verdad es otra, más simple de contestar y más útil de leer:
-- CÓMO SE PAGÓ. De ahí se deduce casi siempre dónde quedó el dinero:
--
--   efectivo       → a la caja (o a la mano de quien haya cobrado)
--   transferencia  → al banco
--   tienda         → a la caja de Tiendas MAF, y de ahí a cuenta de la renta
--
-- "Cobrado en tienda" es el caso que no encajaba en ningún lado: ese dinero ya
-- se cobró y nunca va a llegar a Envíos MAF, porque se toma a cuenta de lo que
-- se le debe a Tiendas MAF por las camionetas. No es una cuenta por cobrar
-- —nadie debe nada— pero tampoco es caja. Es una tercera bolsa, y aquí queda
-- modelada como tal.


-- ════════════════════════════════════════════════════════════════════════════
-- 1. CÓMO SE PAGÓ CADA COBRO
-- ════════════════════════════════════════════════════════════════════════════
--
-- El desglose vive en `cobros`, una fila por forma de pago. Una parada de
-- $3,500 que se pagó con $2,000 en efectivo y $1,500 por transferencia son dos
-- filas, no un campo con dos valores adentro. Así el desglose se suma, se
-- filtra y se cuadra igual que cualquier otro movimiento.

do $$ begin
  alter table cobros add constraint cobros_metodo_conocido
    check (metodo is null or metodo in ('efectivo', 'transferencia', 'tienda'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table gastos add constraint gastos_metodo_conocido
    check (metodo_pago is null or metodo_pago in ('efectivo', 'transferencia', 'tienda'));
exception when duplicate_object then null; end $$;

create index if not exists idx_cobros_metodo on cobros (metodo);


-- ── El supuesto, y cómo se apaga ────────────────────────────────────────────
--
-- Hasta hoy la app daba por cobrado todo flete de contado en cuanto la ruta se
-- entregaba. Es cierto casi siempre, pero es un supuesto: por eso la caja de
-- la app y la de verdad se separaban sin que se pudiera ver dónde.
--
-- Esta bandera dice "de este envío ya no hay que suponer nada: sus `cobros`
-- describen exactamente lo que entró". Los envíos viejos se quedan en false y
-- siguen funcionando igual que siempre; los que se capturen o corrijan con el
-- desglose nuevo pasan a true y dejan de adivinarse.

alter table envios add column if not exists cobro_detallado boolean not null default false;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. VENTA VS. COBRADO, AHORA CON EL DESGLOSE
-- ════════════════════════════════════════════════════════════════════════════
-- Reemplaza la de la fase 4. Solo cambia de dónde sale `cobrado`.
--
-- Se tiran y se vuelven a crear en vez de reemplazarse: `create or replace`
-- solo deja agregar columnas al final, y aquí el desglose entra en medio.
-- Nada fuera de este bloque depende de ellas.

drop view if exists v_cobro_mensual cascade;
drop view if exists v_ruta_cobro    cascade;
drop view if exists v_envio_cobro   cascade;

create view v_envio_cobro as
with pagos as (
  select envio_id,
         sum(monto)                                          as total,
         sum(monto) filter (where metodo = 'efectivo')        as efectivo,
         sum(monto) filter (where metodo = 'transferencia')   as transferencia,
         sum(monto) filter (where metodo = 'tienda')          as tienda,
         sum(monto) filter (where metodo is null)             as sin_metodo
  from cobros group by envio_id
)
select
  e.id                        as envio_id,
  e.ruta_id,
  r.fecha,
  r.estado,
  e.destino,
  e.cliente_id,
  e.a_credito,
  e.cobro_detallado,
  e.precio                    as venta,
  coalesce(p.total, 0)        as cobros_registrados,
  coalesce(p.efectivo, 0)     as efectivo,
  coalesce(p.transferencia, 0) as transferencia,
  coalesce(p.tienda, 0)       as tienda,
  case
    -- Con desglose o a crédito, manda lo capturado. `least` protege de un
    -- cobro puesto de más: nadie cobra más de lo que vendió, y si pasa no
    -- debe inflar el ingreso del mes.
    when e.cobro_detallado or e.a_credito
      then least(e.precio, coalesce(p.total, 0))
    -- Sin desglose, el supuesto de siempre: contado entregado es contado cobrado.
    when r.estado = 'entregada' then e.precio
    else 0
  end                         as cobrado,
  -- Para poder señalar en pantalla lo que todavía es una suposición.
  (not e.cobro_detallado and not e.a_credito and r.estado = 'entregada') as cobrado_supuesto
from envios e
join rutas r on r.id = e.ruta_id
left join pagos p on p.envio_id = e.id
where r.estado <> 'cancelada';


create view v_ruta_cobro as
select
  ruta_id,
  sum(venta)                as venta,
  sum(cobrado)              as cobrado,
  sum(venta) - sum(cobrado) as por_cobrar,
  sum(efectivo)             as efectivo,
  sum(transferencia)        as transferencia,
  sum(tienda)               as tienda
from v_envio_cobro
group by ruta_id;


create view v_cobro_mensual as
select
  date_trunc('month', fecha)::date as mes,
  sum(venta)                       as venta,
  sum(cobrado)                     as cobrado,
  sum(venta) - sum(cobrado)        as por_cobrar,
  sum(venta) filter (where a_credito)     as venta_credito,
  sum(venta) filter (where not a_credito) as venta_contado,
  sum(efectivo)                    as efectivo,
  sum(transferencia)               as transferencia,
  sum(tienda)                      as tienda
from v_envio_cobro
group by 1;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. SUBCATEGORÍAS DE GASTO
-- ════════════════════════════════════════════════════════════════════════════
--
-- La categoría no se toca: `v_ruta_pnl` separa gasolina, casetas y comida por
-- ella, y meterle valores nuevos al enum sería tocar la rentabilidad para
-- resolver un problema de archivo. La subcategoría cuelga debajo, es una tabla
-- normal, y por eso se puede editar desde Configuración sin migrar nada.

create table if not exists subcategorias_gasto (
  id        uuid primary key default gen_random_uuid(),
  categoria categoria_gasto not null,
  nombre    text not null,
  activa    boolean not null default true,
  orden     integer not null default 0,
  creado_en timestamptz not null default now(),
  unique (categoria, nombre)
);

create index if not exists idx_subcat_categoria on subcategorias_gasto (categoria, orden);
alter table subcategorias_gasto enable row level security;

alter table gastos add column if not exists subcategoria_id uuid
  references subcategorias_gasto(id) on delete set null;
-- `descripcion` es la etiqueta corta del renglón; `notas` es el comentario
-- largo que acompaña a la evidencia.
alter table gastos add column if not exists notas text;

create index if not exists idx_gastos_subcategoria on gastos (subcategoria_id);

-- Lista de arranque. Se puede editar toda desde Configuración; está aquí solo
-- para que la primera captura ya tenga de dónde escoger.
insert into subcategorias_gasto (categoria, nombre, orden) values
  ('mantenimiento', 'Servicio y afinación',  10),
  ('mantenimiento', 'Llantas',               20),
  ('mantenimiento', 'Refacciones',           30),
  ('mantenimiento', 'Limpieza',              40),
  ('mantenimiento', 'Mejora de servicio',    50),
  ('mantenimiento', 'Hojalatería y pintura', 60),
  ('mantenimiento', 'Varios',                90),
  ('administrativo', 'Trámites y legales',   10),
  ('administrativo', 'Verificación y tenencia', 20),
  ('administrativo', 'TAG y peaje',          30),
  ('administrativo', 'Papelería',            40),
  ('administrativo', 'Varios',               90),
  ('otro', 'Varios',                         90)
on conflict (categoria, nombre) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. EVIDENCIAS
-- ════════════════════════════════════════════════════════════════════════════
--
-- La foto del ticket o de la entrega. El archivo vive en el bucket privado
-- `evidencias` de Supabase Storage; aquí solo queda su ruta, para que buscarlo
-- sea una consulta normal y no un listado del bucket.
--
-- Cuelga de un gasto, de una parada o de una ruta — de uno solo. Un adjunto
-- que perteneciera a dos cosas aparecería dos veces y se borraría a medias.

create table if not exists adjuntos (
  id           uuid primary key default gen_random_uuid(),
  gasto_id     uuid references gastos(id) on delete cascade,
  envio_id     uuid references envios(id) on delete cascade,
  ruta_id      uuid references rutas(id)  on delete cascade,
  ruta_archivo text not null,
  nombre       text not null,
  tipo_mime    text,
  bytes        integer,
  comentario   text,
  creado_en    timestamptz not null default now(),
  constraint adjunto_con_un_dueno
    check (num_nonnulls(gasto_id, envio_id, ruta_id) = 1)
);

create index if not exists idx_adjuntos_gasto on adjuntos (gasto_id);
create index if not exists idx_adjuntos_envio on adjuntos (envio_id);
create index if not exists idx_adjuntos_ruta  on adjuntos (ruta_id);
alter table adjuntos enable row level security;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. LA CUENTA DE LO COBRADO EN TIENDA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Tiendas MAF cobra el flete en su caja. Ese dinero no vuelve: se abona contra
-- la renta de las camionetas, que es lo que Envíos MAF le debe.
--
-- Se registra como un `pago_renta` con concepto 'cobrado_en_tienda' para que
-- baje el fondo igual que cualquier otro pago —el fondo ya lo contempla en
-- `aplicado`— pero se distingue por una razón concreta: ese dinero nunca pasó
-- por la caja, así que no se puede restar de ella. La vista de custodia lo
-- saca del bolsillo de la tienda, no del tuyo.

create or replace view v_cuenta_tienda as
with cobrado as (
  select coalesce(sum(monto), 0) as m from cobros where metodo = 'tienda'
),
aplicado as (
  select coalesce(sum(monto), 0) as m from pagos_renta where concepto = 'cobrado_en_tienda'
)
select
  cobrado.m                as cobrado,      -- lo que la tienda ha cobrado por ti
  aplicado.m               as aplicado,     -- lo que ya se abonó a la renta
  cobrado.m - aplicado.m   as saldo         -- lo que falta por abonar
from cobrado, aplicado;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. CUSTODIA, AHORA CON MÉTODO
-- ════════════════════════════════════════════════════════════════════════════
-- Reemplaza la de la fase 5. Dos cambios:
--   · cada movimiento dice con qué método se movió, para poder cuadrar contra
--     el banco, contra el efectivo o contra la tienda por separado;
--   · los envíos con desglose ya no se dan por cobrados: su dinero entra por
--     las filas de `cobros`, y contarlos también aquí sería contarlos dos veces.
--
-- Igual que arriba: `metodo` entra en medio, así que hay que tirarlas.

drop view if exists v_saldo_custodia      cascade;
drop view if exists v_movimiento_custodia cascade;

create view v_movimiento_custodia as
-- Fletes de contado sin desglose: se siguen dando por cobrados al entregarse.
select
  'flete'::text                                             as clase,
  e.id                                                      as origen_id,
  r.fecha                                                   as fecha,
  r.id                                                      as ruta_id,
  coalesce(e.cobrado_por::text, nullif(btrim(coalesce(e.cobrado_por_otro, '')), ''), 'caja') as custodio,
  e.cobrado_por                                             as contacto_id,
  nullif(btrim(coalesce(e.cobrado_por_otro, '')), '')       as nombre_otro,
  null::text                                                as metodo,
  e.precio                                                  as entrada,
  0::numeric                                                as salida
from envios e
join rutas r on r.id = e.ruta_id
where r.estado = 'entregada' and e.a_credito = false and e.cobro_detallado = false

union all
-- Cobros capturados: el desglose de las paradas nuevas y los abonos a crédito.
select 'cobro', c.id, c.fecha, e.ruta_id,
  coalesce(c.recibido_por::text, nullif(btrim(coalesce(c.recibido_por_otro, '')), ''), 'caja'),
  c.recibido_por, nullif(btrim(coalesce(c.recibido_por_otro, '')), ''),
  c.metodo, c.monto, 0
from cobros c
join envios e on e.id = c.envio_id

union all
-- Gastos: salen del bolsillo de quien los pagó.
select 'gasto', g.id, g.fecha, g.ruta_id,
  coalesce(g.pagado_por::text, nullif(btrim(coalesce(g.pagado_por_otro, '')), ''), 'caja'),
  g.pagado_por, nullif(btrim(coalesce(g.pagado_por_otro, '')), ''),
  g.metodo_pago, 0, g.monto
from gastos g

union all
-- Comisiones pagadas: siempre salen de la caja.
select 'comision', c.id, coalesce(c.fecha_pago, c.creado_en::date), c.ruta_id,
  'caja', null, null, null, 0, c.monto
from comisiones c
where c.estado = 'pagada'

union all
-- Salidas del fondo de renta que sí se pagaron con dinero tuyo.
select 'renta', p.id, p.fecha, null, 'caja', null, null, p.metodo, 0, p.monto
from pagos_renta p
where p.concepto <> 'cobrado_en_tienda'

union all
-- Lo cobrado en tienda que se abonó a la renta. Sale del bolsillo de la
-- tienda, que es donde ese dinero estaba: restarlo de la caja la dejaría corta
-- por un dinero que nunca estuvo ahí.
select 'renta', p.id, p.fecha, null, 'Tiendas MAF', null, 'Tiendas MAF', 'tienda', 0, p.monto
from pagos_renta p
where p.concepto = 'cobrado_en_tienda'

union all
-- La entrega, vista desde la persona.
select 'entrega', x.id, x.fecha, null,
  coalesce(x.contacto_id::text, nullif(btrim(coalesce(x.nombre_otro, '')), ''), 'caja'),
  x.contacto_id, nullif(btrim(coalesce(x.nombre_otro, '')), ''),
  x.metodo,
  case when x.direccion = 'entrego' then x.monto else 0 end,
  case when x.direccion = 'recibo'  then x.monto else 0 end
from entregas_efectivo x

union all
-- Y la misma entrega, vista desde la caja: lo que sale de un bolsillo entra
-- en el otro. Sin este segundo renglón el dinero se evaporaría al saldarse.
select 'entrega', x.id, x.fecha, null, 'caja', null, null, x.metodo,
  case when x.direccion = 'recibo'  then x.monto else 0 end,
  case when x.direccion = 'entrego' then x.monto else 0 end
from entregas_efectivo x;


create view v_saldo_custodia as
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


-- Saldo por método: la respuesta a "¿cuánto de esto está en el banco?".
-- Los movimientos sin método son los que todavía se dan por supuestos.
create or replace view v_saldo_metodo as
select
  coalesce(m.metodo, 'sin_especificar') as metodo,
  sum(m.entrada)                        as entradas,
  sum(m.salida)                         as salidas,
  sum(m.entrada - m.salida)             as saldo,
  count(*)                              as movimientos
from v_movimiento_custodia m
group by 1;


-- ════════════════════════════════════════════════════════════════════════════
-- 7. LA CAJA MENSUAL, SIN CONTAR DOS VECES
-- ════════════════════════════════════════════════════════════════════════════
--
-- Dos correcciones, las dos necesarias para que el corte mensual siga
-- cuadrando con el resto:
--
-- 1. El desglose. `v_caja_mensual` sumaba el precio completo de todo flete de
--    contado entregado Y además todos los renglones de `cobros`. Mientras no
--    existía el desglose eso estaba bien, porque `cobros` solo traía abonos de
--    crédito. Ahora un flete de contado con desglose aparece en los dos lados
--    y se contaría dos veces.
--
-- 2. El fondo de renta. Los pagos a Tiendas MAF nunca se restaron de la caja,
--    así que el flujo neto salía más alto de lo que de verdad quedó. El abono
--    de lo cobrado en tienda queda fuera: ese dinero jamás pasó por la caja.

drop view if exists v_caja_mensual cascade;

create view v_caja_mensual as
with meses as (
  select date_trunc('month', fecha)::date as mes from rutas
  union select date_trunc('month', fecha)::date from gastos
  union select date_trunc('month', fecha)::date from cobros
  union select date_trunc('month', fecha)::date from pagos_renta
),
ent_contado as (
  -- Solo los que todavía se dan por supuestos. Los que ya tienen desglose
  -- entran abajo, por su renglón de `cobros`, con su método y su fecha.
  select date_trunc('month', r.fecha)::date as mes, sum(e.precio) as monto
  from envios e
  join rutas r on r.id = e.ruta_id
  where r.estado = 'entregada' and e.a_credito = false and e.cobro_detallado = false
  group by 1
),
ent_cobros as (
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
),
sal_renta as (
  select date_trunc('month', fecha)::date as mes, sum(monto) as monto
  from pagos_renta where concepto <> 'cobrado_en_tienda' group by 1
)
select
  m.mes,
  coalesce(ec.monto, 0)                         as entradas_contado,
  coalesce(ek.monto, 0)                         as entradas_credito,
  coalesce(ec.monto, 0) + coalesce(ek.monto, 0) as entradas,
  coalesce(sg.operativo, 0)                     as salidas_operativas,
  coalesce(sg.inversion, 0)                     as salidas_inversion,
  coalesce(sg.retiro, 0)                        as salidas_retiro,
  coalesce(sc.monto, 0)                         as salidas_comisiones,
  coalesce(sr.monto, 0)                         as salidas_renta,
  coalesce(sg.total, 0) + coalesce(sc.monto, 0) + coalesce(sr.monto, 0) as salidas,
  coalesce(ec.monto, 0) + coalesce(ek.monto, 0)
    - coalesce(sg.total, 0) - coalesce(sc.monto, 0) - coalesce(sr.monto, 0) as flujo_neto
from meses m
left join ent_contado    ec on ec.mes = m.mes
left join ent_cobros     ek on ek.mes = m.mes
left join sal_gastos     sg on sg.mes = m.mes
left join sal_comisiones sc on sc.mes = m.mes
left join sal_renta      sr on sr.mes = m.mes
order by m.mes desc;


-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación
-- ════════════════════════════════════════════════════════════════════════════
select 'saldo por método' as que, metodo as detalle,
       entradas, salidas, saldo, movimientos
from v_saldo_metodo
union all
select 'cuenta de tienda', 'Tiendas MAF', cobrado, aplicado, saldo, null::bigint
from v_cuenta_tienda
union all
select 'venta vs cobrado', 'total',
       sum(venta), sum(cobrado), sum(venta) - sum(cobrado),
       count(*) filter (where cobrado_supuesto)
from v_envio_cobro;
