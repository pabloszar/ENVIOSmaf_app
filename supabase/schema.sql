-- ════════════════════════════════════════════════════════════════════════════
-- Envíos MAF — Schema v2
-- Gestión y rentabilidad de la unidad de negocio de fletes.
--
-- Ejecutar completo en el SQL Editor de Supabase. Es idempotente.
--
-- Principio de diseño: la RUTA contiene los gastos, el ENVÍO contiene el
-- ingreso. Un envío suelto es una ruta de una sola parada.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tipos ───────────────────────────────────────────────────────────────────

do $$ begin
  create type propiedad_vehiculo as enum ('propia', 'rentada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_ruta as enum ('cotizada', 'agendada', 'en_curso', 'entregada', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rol_tripulacion as enum ('chofer', 'ayudante');
exception when duplicate_object then null; end $$;

do $$ begin
  create type categoria_gasto as enum (
    'gasolina', 'caseta', 'comida', 'mantenimiento', 'seguro', 'tenencia',
    'sueldo', 'administrativo', 'renta_vehiculo', 'comision', 'otro'
  );
exception when duplicate_object then null; end $$;

-- operativo afecta el margen; inversion y retiro solo afectan la caja.
do $$ begin
  create type tipo_gasto as enum ('operativo', 'inversion', 'retiro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_comision as enum ('devengada', 'pagada', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tamano_carga as enum ('Chico', 'Mediano', 'Grande', 'Extra Grande');
exception when duplicate_object then null; end $$;


-- ── 1. Configuración del modelo de negocio ──────────────────────────────────
-- Versionada por vigencia: cambiar los porcentajes NUNCA reescribe la
-- rentabilidad histórica, porque cada ruta guarda su propio snapshot.

create table if not exists config_negocio (
  id                       uuid primary key default gen_random_uuid(),
  vigente_desde            date        not null default current_date,
  -- Porcentajes sobre el precio del flete
  pct_venta                numeric(5,2) not null default 5,
  pct_chofer               numeric(5,2) not null default 12,
  pct_ayudante             numeric(5,2) not null default 8,
  pct_admon                numeric(5,2) not null default 8,
  pct_renta_propia         numeric(5,2) not null default 25,
  pct_renta_rentada        numeric(5,2) not null default 35,
  -- Parámetros de gasolina
  rendimiento_default_kml  numeric(5,2) not null default 8,
  precio_litro             numeric(6,2) not null default 25,
  -- Parámetros del algoritmo de cotización calibrado (17 envíos reales)
  params_pricing           jsonb        not null default '{
    "margen": 0.50,
    "road_factor": 1.55,
    "band_1_limit": 120,
    "band_2_limit": 400,
    "band_1_base": 200,
    "band_1_rate": 15,
    "band_2_rate": 12,
    "band_2_viat": 600,
    "band_3_rate": 8,
    "band_3_viat": 1200,
    "mult": { "Chico": 0.80, "Mediano": 1.00, "Grande": 1.30, "Extra Grande": 1.60 }
  }'::jsonb,
  notas                    text,
  creado_en                timestamptz  not null default now()
);

comment on table config_negocio is
  'Configuración versionada. La fila vigente es la de mayor vigente_desde <= hoy.';


-- ── 2. Contactos ────────────────────────────────────────────────────────────
-- Una sola tabla para personas y clientes. Los roles son un arreglo porque la
-- misma persona puede ser chofer y ayudante, o cliente y proveedor.

create table if not exists contactos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  roles           text[] not null default '{}',   -- chofer | ayudante | vendedor | cliente_b2b | cliente_b2c | proveedor
  telefono        text,
  email           text,
  -- Comisión propia que gana al default de config_negocio. Ej: {"chofer": 15}
  pct_override    jsonb,
  dias_credito    integer not null default 0,
  limite_credito  numeric(12,2),
  calificacion    smallint check (calificacion between 1 and 5),
  activo          boolean not null default true,
  notas           text,
  creado_en       timestamptz not null default now()
);

create index if not exists idx_contactos_roles  on contactos using gin (roles);
create index if not exists idx_contactos_nombre on contactos (nombre);


-- ── 3. Vehículos ────────────────────────────────────────────────────────────

create table if not exists vehiculos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,                 -- "NP300 Negra"
  placas           text,
  tipo             text,                          -- Pickup, 3.5 ton, Torton...
  propiedad        propiedad_vehiculo not null default 'propia',
  -- Si es null, se usa pct_renta_propia / pct_renta_rentada de la config.
  pct_renta        numeric(5,2),
  rendimiento_kml  numeric(5,2),                  -- si es null, usa el default de config
  capacidad        text,
  activo           boolean not null default true,
  notas            text,
  creado_en        timestamptz not null default now()
);

create index if not exists idx_vehiculos_activo on vehiculos (activo);


-- ── 4. Rutas ────────────────────────────────────────────────────────────────
-- El viaje. Contenedor de gastos y de tripulación.

create table if not exists rutas (
  id               uuid primary key default gen_random_uuid(),
  folio            serial unique,
  fecha            date not null default current_date,
  estado           estado_ruta not null default 'agendada',
  vehiculo_id      uuid references vehiculos(id) on delete set null,
  km_total         numeric(8,1),                  -- km reales del viaje (ida y vuelta)
  km_osrm          numeric(8,1),                  -- km calculados por OSRM, referencia
  roundtrip        boolean not null default true,
  orden_optimo     jsonb,                         -- orden de visita sugerido por OSRM
  -- Snapshot de los porcentajes vigentes al cerrar la ruta. Inmutable.
  config_snapshot  jsonb,
  cerrada_en       timestamptz,                   -- cuándo se generaron las comisiones
  notas            text,
  creado_en        timestamptz not null default now()
);

create index if not exists idx_rutas_fecha  on rutas (fecha desc);
create index if not exists idx_rutas_estado on rutas (estado);


-- ── 5. Tripulación de la ruta ───────────────────────────────────────────────
-- Tabla aparte porque un viaje puede llevar más de un ayudante.

create table if not exists ruta_tripulacion (
  id            uuid primary key default gen_random_uuid(),
  ruta_id       uuid not null references rutas(id) on delete cascade,
  contacto_id   uuid not null references contactos(id) on delete restrict,
  rol           rol_tripulacion not null,
  pct_aplicado  numeric(5,2),                     -- congelado al cerrar la ruta
  unique (ruta_id, contacto_id, rol)
);

create index if not exists idx_tripulacion_ruta     on ruta_tripulacion (ruta_id);
create index if not exists idx_tripulacion_contacto on ruta_tripulacion (contacto_id);


-- ── 6. Envíos ───────────────────────────────────────────────────────────────
-- La parada / entrega. Contenedor del ingreso. Su precio NO se divide.

create table if not exists envios (
  id                        uuid primary key default gen_random_uuid(),
  ruta_id                   uuid not null references rutas(id) on delete cascade,
  secuencia                 integer not null default 1,
  cliente_id                uuid references contactos(id) on delete set null,
  vendedor_id               uuid references contactos(id) on delete set null,
  orden_venta               text,
  destino                   text not null,
  lat                       double precision,
  lng                       double precision,
  zona                      text,
  distancia_km              numeric(8,1),
  tamano_carga              tamano_carga,
  num_articulos             integer,
  num_pisos                 integer,
  precio                    numeric(12,2) not null default 0,   -- el ingreso
  precio_sugerido_cotizador numeric(12,2),
  uso_cotizador             boolean not null default false,
  calificacion              smallint check (calificacion between 1 and 5),
  notas                     text,
  creado_en                 timestamptz not null default now()
);

create index if not exists idx_envios_ruta    on envios (ruta_id);
create index if not exists idx_envios_cliente on envios (cliente_id);
create index if not exists idx_envios_zona    on envios (zona);


-- ── 7. Gastos ───────────────────────────────────────────────────────────────
-- Todo lo que sale. Los de viaje llevan ruta_id; los fijos no.
-- Solo tipo = 'operativo' afecta el margen.

create table if not exists gastos (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null default current_date,
  categoria      categoria_gasto not null,
  tipo           tipo_gasto not null default 'operativo',
  monto          numeric(12,2) not null check (monto >= 0),
  ruta_id        uuid references rutas(id) on delete cascade,
  vehiculo_id    uuid references vehiculos(id) on delete set null,
  contacto_id    uuid references contactos(id) on delete set null,
  descripcion    text,
  metodo_pago    text,
  comprobante_url text,
  creado_en      timestamptz not null default now()
);

create index if not exists idx_gastos_fecha     on gastos (fecha desc);
create index if not exists idx_gastos_ruta      on gastos (ruta_id);
create index if not exists idx_gastos_vehiculo  on gastos (vehiculo_id);
create index if not exists idx_gastos_categoria on gastos (categoria);


-- ── 8. Comisiones ───────────────────────────────────────────────────────────
-- Se generan al cerrar la ruta, a partir del config_snapshot.
-- El % de administración NO genera comisión: es utilidad del dueño.

create table if not exists comisiones (
  id           uuid primary key default gen_random_uuid(),
  ruta_id      uuid not null references rutas(id) on delete cascade,
  envio_id     uuid references envios(id) on delete cascade,
  contacto_id  uuid not null references contactos(id) on delete restrict,
  rol          text not null,                     -- chofer | ayudante | vendedor
  base_monto   numeric(12,2) not null,            -- sobre qué precio se calculó
  porcentaje   numeric(5,2) not null,
  monto        numeric(12,2) not null,
  estado       estado_comision not null default 'devengada',
  fecha_pago   date,
  notas        text,
  creado_en    timestamptz not null default now()
);

create index if not exists idx_comisiones_contacto on comisiones (contacto_id);
create index if not exists idx_comisiones_estado   on comisiones (estado);
create index if not exists idx_comisiones_ruta     on comisiones (ruta_id);


-- ── 9. Cobros ───────────────────────────────────────────────────────────────
-- Entradas de dinero. Permiten pago parcial y crédito.
-- Saldo del envío = precio − suma(cobros).

create table if not exists cobros (
  id         uuid primary key default gen_random_uuid(),
  envio_id   uuid not null references envios(id) on delete cascade,
  fecha      date not null default current_date,
  monto      numeric(12,2) not null check (monto > 0),
  metodo     text,                                -- efectivo | transferencia | tarjeta
  notas      text,
  creado_en  timestamptz not null default now()
);

create index if not exists idx_cobros_envio on cobros (envio_id);
create index if not exists idx_cobros_fecha on cobros (fecha desc);


-- ════════════════════════════════════════════════════════════════════════════
-- VISTAS DE RENTABILIDAD
-- ════════════════════════════════════════════════════════════════════════════

-- Porcentajes efectivos de una ruta: el snapshot si ya se cerró, si no la
-- configuración vigente. Así el dashboard funciona con rutas abiertas también.
create or replace view v_ruta_config as
select
  r.id as ruta_id,
  coalesce(r.config_snapshot, to_jsonb(c.*)) as cfg
from rutas r
cross join lateral (
  select * from config_negocio
  where vigente_desde <= r.fecha
  order by vigente_desde desc
  limit 1
) c;


-- P&L por ruta. El corazón del sistema.
create or replace view v_ruta_pnl as
with ing as (
  select ruta_id, sum(precio) as ingreso, count(*) as num_envios
  from envios group by ruta_id
),
gas as (
  select ruta_id,
         sum(monto) filter (where tipo = 'operativo') as gastos_directos,
         sum(monto) filter (where categoria = 'gasolina') as gasolina,
         sum(monto) filter (where categoria = 'caseta')   as casetas,
         sum(monto) filter (where categoria = 'comida')   as comida
  from gastos where ruta_id is not null group by ruta_id
),
com as (
  select ruta_id,
         sum(monto) as comisiones,
         sum(monto) filter (where rol = 'chofer')   as com_chofer,
         sum(monto) filter (where rol = 'ayudante') as com_ayudante,
         sum(monto) filter (where rol = 'vendedor') as com_vendedor
  from comisiones where estado <> 'cancelada' group by ruta_id
)
select
  r.id                                   as ruta_id,
  r.folio,
  r.fecha,
  r.estado,
  r.vehiculo_id,
  v.nombre                               as vehiculo,
  v.propiedad,
  r.km_total,
  coalesce(i.num_envios, 0)              as num_envios,
  coalesce(i.ingreso, 0)                 as ingreso,
  coalesce(g.gasolina, 0)                as gasolina,
  coalesce(g.casetas, 0)                 as casetas,
  coalesce(g.comida, 0)                  as comida,
  coalesce(g.gastos_directos, 0)         as gastos_directos,
  coalesce(c.com_chofer, 0)              as com_chofer,
  coalesce(c.com_ayudante, 0)            as com_ayudante,
  coalesce(c.com_vendedor, 0)            as com_vendedor,
  coalesce(c.comisiones, 0)              as comisiones,
  -- Renta de la unidad: % del flete según el vehículo o la config vigente
  round(coalesce(i.ingreso, 0) * coalesce(
    v.pct_renta,
    case when v.propiedad = 'rentada'
         then (rc.cfg->>'pct_renta_rentada')::numeric
         else (rc.cfg->>'pct_renta_propia')::numeric end,
    0
  ) / 100, 2)                            as renta_unidad,
  -- Administración: se descuenta para medir el margen operativo, pero es
  -- utilidad del dueño, no una comisión por pagar.
  round(coalesce(i.ingreso, 0) * coalesce((rc.cfg->>'pct_admon')::numeric, 0) / 100, 2)
                                         as admon,
  -- Utilidad operativa del viaje
  coalesce(i.ingreso, 0)
    - coalesce(g.gastos_directos, 0)
    - coalesce(c.comisiones, 0)
    - round(coalesce(i.ingreso, 0) * coalesce(
        v.pct_renta,
        case when v.propiedad = 'rentada'
             then (rc.cfg->>'pct_renta_rentada')::numeric
             else (rc.cfg->>'pct_renta_propia')::numeric end,
        0) / 100, 2)
                                         as utilidad
from rutas r
left join vehiculos v on v.id = r.vehiculo_id
left join v_ruta_config rc on rc.ruta_id = r.id
left join ing i on i.ruta_id = r.id
left join gas g on g.ruta_id = r.id
left join com c on c.ruta_id = r.id
where r.estado <> 'cancelada';


-- Margen porcentual añadido aparte para no repetir la expresión de utilidad.
create or replace view v_ruta_pnl_full as
select p.*,
       case when p.ingreso > 0 then round(p.utilidad / p.ingreso * 100, 1) else null end as margen_pct
from v_ruta_pnl p;


-- Rentabilidad por chofer
create or replace view v_rentabilidad_chofer as
select
  c.id                          as contacto_id,
  c.nombre                      as chofer,
  count(distinct p.ruta_id)     as viajes,
  sum(p.ingreso)                as ingreso,
  sum(p.utilidad)               as utilidad,
  case when sum(p.ingreso) > 0
       then round(sum(p.utilidad) / sum(p.ingreso) * 100, 1) end as margen_pct,
  sum(p.com_chofer)             as comisiones_ganadas,
  round(avg(p.ingreso), 2)      as ticket_promedio
from ruta_tripulacion t
join contactos c   on c.id = t.contacto_id
join v_ruta_pnl p  on p.ruta_id = t.ruta_id
where t.rol = 'chofer'
group by c.id, c.nombre;


-- Rentabilidad por unidad
create or replace view v_rentabilidad_vehiculo as
select
  v.id                       as vehiculo_id,
  v.nombre                   as vehiculo,
  v.propiedad,
  count(p.ruta_id)           as viajes,
  sum(p.ingreso)             as ingreso,
  sum(p.utilidad)            as utilidad,
  sum(p.renta_unidad)        as renta_generada,
  case when sum(p.ingreso) > 0
       then round(sum(p.utilidad) / sum(p.ingreso) * 100, 1) end as margen_pct,
  sum(p.km_total)            as km_recorridos,
  -- Gastos del vehículo que NO son de viaje (mantenimiento, seguro, tenencia)
  coalesce((select sum(g.monto) from gastos g
            where g.vehiculo_id = v.id and g.ruta_id is null and g.tipo = 'operativo'), 0)
                             as gastos_fijos_unidad
from vehiculos v
left join v_ruta_pnl p on p.vehiculo_id = v.id
group by v.id, v.nombre, v.propiedad;


-- Rentabilidad por zona de destino
create or replace view v_rentabilidad_zona as
select
  coalesce(e.zona, 'Sin zona')  as zona,
  count(*)                      as envios,
  sum(e.precio)                 as ingreso,
  round(avg(e.precio), 2)       as precio_promedio,
  round(avg(e.distancia_km), 1) as km_promedio
from envios e
join rutas r on r.id = e.ruta_id and r.estado <> 'cancelada'
group by coalesce(e.zona, 'Sin zona');


-- P&L mensual del negocio completo, incluyendo gastos fijos e inversión
create or replace view v_pnl_mensual as
with meses as (
  select date_trunc('month', fecha)::date as mes from rutas
  union
  select date_trunc('month', fecha)::date from gastos
),
op as (
  select date_trunc('month', fecha)::date as mes,
         sum(ingreso)   as ingreso,
         sum(utilidad)  as utilidad_operativa,
         count(*)       as viajes
  from v_ruta_pnl group by 1
),
fijos as (
  select date_trunc('month', fecha)::date as mes,
         sum(monto) filter (where tipo = 'operativo')  as gastos_fijos,
         sum(monto) filter (where tipo = 'inversion')  as inversion,
         sum(monto) filter (where tipo = 'retiro')     as retiros
  from gastos where ruta_id is null group by 1
)
select
  m.mes,
  coalesce(o.viajes, 0)                        as viajes,
  coalesce(o.ingreso, 0)                       as ingreso,
  coalesce(o.utilidad_operativa, 0)            as utilidad_operativa,
  coalesce(f.gastos_fijos, 0)                  as gastos_fijos,
  coalesce(o.utilidad_operativa, 0) - coalesce(f.gastos_fijos, 0) as utilidad_neta,
  coalesce(f.inversion, 0)                     as inversion,
  coalesce(f.retiros, 0)                       as retiros,
  case when coalesce(o.ingreso, 0) > 0
       then round((coalesce(o.utilidad_operativa, 0) - coalesce(f.gastos_fijos, 0))
                  / o.ingreso * 100, 1) end    as margen_neto_pct
from meses m
left join op    o on o.mes = m.mes
left join fijos f on f.mes = m.mes
order by m.mes desc;


-- Cuentas por cobrar: quién me debe, cuánto y desde cuándo
create or replace view v_cuentas_por_cobrar as
select
  e.id                                as envio_id,
  r.folio,
  r.fecha,
  e.destino,
  c.nombre                            as cliente,
  c.dias_credito,
  e.precio,
  coalesce(sum(co.monto), 0)          as cobrado,
  e.precio - coalesce(sum(co.monto), 0) as saldo,
  current_date - r.fecha              as dias_transcurridos,
  (current_date - r.fecha) > coalesce(c.dias_credito, 0) as vencido
from envios e
join rutas r      on r.id = e.ruta_id and r.estado <> 'cancelada'
left join contactos c on c.id = e.cliente_id
left join cobros co   on co.envio_id = e.id
group by e.id, r.folio, r.fecha, e.destino, c.nombre, c.dias_credito, e.precio
having e.precio - coalesce(sum(co.monto), 0) > 0;


-- Comisiones por pagar, agrupadas por persona
create or replace view v_comisiones_por_pagar as
select
  c.id                as contacto_id,
  c.nombre,
  count(*)            as num_comisiones,
  sum(cm.monto)       as total_devengado,
  min(r.fecha)        as desde
from comisiones cm
join contactos c on c.id = cm.contacto_id
join rutas r     on r.id = cm.ruta_id
where cm.estado = 'devengada'
group by c.id, c.nombre;


-- ════════════════════════════════════════════════════════════════════════════
-- SEGURIDAD
-- La app accede siempre desde el servidor con la service_role key, que ignora
-- RLS. Habilitamos RLS sin políticas para que la anon key no pueda leer nada
-- si alguna vez se filtra.
-- ════════════════════════════════════════════════════════════════════════════

alter table config_negocio   enable row level security;
alter table contactos        enable row level security;
alter table vehiculos        enable row level security;
alter table rutas            enable row level security;
alter table ruta_tripulacion enable row level security;
alter table envios           enable row level security;
alter table gastos           enable row level security;
alter table comisiones       enable row level security;
alter table cobros           enable row level security;


-- ── Semilla: configuración inicial con los valores de la Calculadora Flete ──
insert into config_negocio (vigente_desde, notas)
select '2026-01-01'::date, 'Configuración inicial migrada de la Calculadora Flete'
where not exists (select 1 from config_negocio);
