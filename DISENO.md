# Envíos MAF — Diseño de la app de gestión

> Documento de diseño acordado con Pablo. Fuente de verdad del modelo de datos y del alcance.
> Fecha: 23 de julio de 2026.

## 1. Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Plataforma | App propia. **Next.js 14 (App Router) + TypeScript + Tailwind**, base de datos **Supabase (Postgres)**. |
| Schema | **Desde cero.** Se reusa el algoritmo de pricing, el cliente OSRM/Nominatim y el mapa Leaflet del proyecto actual. |
| Seguridad | El navegador **nunca** habla directo con Supabase. Todo pasa por API routes del servidor con `service_role`. Login de admin con sesión en cookie httpOnly. Deja la puerta abierta a roles (chofer, vendedor) sin rediseñar. |
| Usuarios | Solo Pablo, rol administrador. |
| Contabilidad | La app es la fuente de verdad. Odoo queda fuera. |
| Modelo central | **Todo es ruta.** La ruta contiene los gastos, el envío contiene el ingreso. Un envío suelto es una ruta de una parada, pero se captura en una sola pantalla. |
| Comisiones | Porcentajes **sobre el precio del flete**, cada rol por separado, configurables. |
| Renta de vehículo | Porcentaje del flete, **configurable por unidad**, con default distinto para propia y rentada. |
| Cotizador | Dos motores **lado a lado**: algoritmo calibrado (bandas de km) vs. precio mínimo según el modelo de porcentajes. |
| Histórico | Se migra **todo** el Excel (~100 envíos). |
| Alcance 1ª entrega | Núcleo de rentabilidad. El cotizador se conecta al final. |

## 2. El modelo de negocio, en una fórmula

De cada peso que cobra un flete:

```
Precio del flete (ingreso, por envío)
  − % Renta de la unidad        (configurable por vehículo: propia ≠ rentada)
  − % Comisión vendedor
  − % Comisión chofer
  − % Comisión ayudante         (× número de ayudantes)
  − % Administración
  − Gasolina                    ( km / rendimiento × precio litro )
  − Casetas, comida, otros del viaje
  = Utilidad operativa de la ruta
  − Gastos fijos prorrateados   (seguros, tenencias, sueldos base, administrativos)
  = Utilidad del negocio
  − Inversión y retiros         (afectan la caja, NO el margen)
```

En una ruta con varias paradas: **los ingresos no se dividen** (cada cliente paga su precio
completo) y **los gastos sí se reparten** (gasolina y casetas se pagan una vez por viaje).
Ahí está la ganancia de agrupar, y la app debe hacerla visible.

**Regla clave:** cada ruta guarda un *snapshot* de los porcentajes vigentes al cerrarse.
Cambiar la configuración nunca reescribe la rentabilidad histórica.

## 3. Modelo de datos

### Configuración

**`config_negocio`** — versionada por vigencia, no se sobrescribe.
`id · vigente_desde · pct_venta · pct_chofer · pct_ayudante · pct_admon · pct_renta_propia · pct_renta_rentada · rendimiento_default_kml · precio_litro · params_pricing (jsonb: margen, road_factor, bandas, tarifas, viáticos, multiplicadores de tamaño) · creado_en`

### Catálogos

**`contactos`** — una sola tabla para personas y clientes, con roles múltiples.
`id · nombre · roles (text[]: chofer, ayudante, vendedor, cliente_b2b, cliente_b2c, proveedor) · telefono · email · pct_override (jsonb, comisión propia que gana al default) · dias_credito · limite_credito · calificacion · activo · notas`

**`vehiculos`**
`id · nombre ("NP300 Negra") · placas · tipo · propiedad (propia | rentada) · pct_renta (override; si es null usa el default de config según propiedad) · rendimiento_kml · capacidad · activo · notas`

### Operación

**`rutas`** — el viaje. Contenedor de gastos y de tripulación.
`id · folio · fecha · estado (cotizada | agendada | en_curso | entregada | cancelada) · vehiculo_id · km_total · km_osrm · roundtrip · orden_optimo (jsonb) · config_snapshot (jsonb) · notas`

**`ruta_tripulacion`** — permite 1 chofer y N ayudantes por viaje.
`id · ruta_id · contacto_id · rol (chofer | ayudante) · pct_aplicado`

**`envios`** — la parada / entrega. Contenedor del ingreso.
`id · ruta_id · secuencia · cliente_id · vendedor_id · orden_venta · destino · lat · lng · zona · distancia_km · tamano_carga · num_articulos · num_pisos · precio · precio_sugerido_cotizador · uso_cotizador · calificacion · estado · notas`

**`gastos`** — una sola tabla para todo lo que sale.
`id · fecha · categoria (gasolina | caseta | comida | mantenimiento | seguro | tenencia | sueldo | administrativo | renta_vehiculo | otro) · tipo (operativo | inversion | retiro) · monto · ruta_id? · vehiculo_id? · contacto_id? · descripcion · metodo_pago · comprobante_url`

Solo `tipo = operativo` afecta el margen. `inversion` y `retiro` afectan la caja y se
reportan aparte, como pediste.

**`comisiones`** — se generan al cerrar la ruta, a partir del snapshot.
`id · ruta_id · contacto_id · rol · base_monto · porcentaje · monto · estado (devengada | pagada) · fecha_pago`

**`cobros`** — entradas de dinero, permiten pago parcial y crédito.
`id · envio_id · fecha · monto · metodo · notas`
Saldo de un envío = `precio − suma(cobros)`. De ahí sale "quién me debe y desde cuándo".

### Vistas de rentabilidad (SQL)

`v_ruta_pnl` · `v_rentabilidad_chofer` · `v_rentabilidad_vehiculo` · `v_rentabilidad_zona` · `v_pnl_mensual` · `v_cuentas_por_cobrar` · `v_comisiones_por_pagar`

## 4. Pantallas

1. **Dashboard de rentabilidad** — utilidad y margen del periodo, tendencia mensual, y desglose por chofer, por unidad, por zona y por tamaño de carga. Comparativo contra periodo anterior.
2. **Rutas y envíos** — tabla filtrable estilo hoja de cálculo con edición inline. Crear ruta, agregar paradas, capturar gastos del viaje, cerrar ruta (dispara comisiones).
3. **Captura rápida de envío** — un formulario, una pantalla, para el caso de todos los días.
4. **Flotilla** — unidades, su esquema de renta, y rentabilidad acumulada de cada una.
5. **Contactos** — personal y clientes con sus roles, comisiones propias y crédito.
6. **Dinero** — cobros pendientes, comisiones por pagar (marcar pagado), gastos fijos e inversión, y caja del periodo.
7. **Configuración** — los porcentajes al estilo de la Calculadora Flete, con el semáforo de "suma sana / apretada / insostenible" y simulador en vivo, más los parámetros del algoritmo de pricing.
8. **Cotizador** — mapa, búsqueda de destino, los dos precios lado a lado, y botón para convertirlo en envío agendado.

## 5. Fases

- **F0 — Cimientos.** Proyecto, schema en Supabase, capa de API con service_role, login admin, importador del Excel histórico.
- **F1 — Operación.** Configuración del modelo de negocio, flotilla, contactos, rutas y envíos con captura de gastos, cierre de ruta.
- **F2 — Dinero.** Cobros y crédito, comisiones devengadas y pagadas, gastos fijos, inversión y retiros, caja.
- **F3 — Rentabilidad.** Vistas SQL y dashboard con los cortes por chofer, unidad, zona y periodo.
- **F4 — Cotizador conectado.** Mapa, OSRM, los dos motores de precio, y conversión de cotización a envío.

## 6. Supuestos que asumo (corregibles)

- Moneda MXN, sin manejo de IVA ni facturación por ahora.
- Origen de los envíos: Mueblería MAF, Lerma (`19.289, -99.510`).
- El % de administración es un ingreso del negocio, no un pago a un tercero: se descuenta para medir la utilidad operativa pero no genera una comisión por pagar.
- Los gastos fijos se prorratean por mes; no se asignan a rutas individuales.
