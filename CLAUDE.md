# CLAUDE.md — Envíos MAF

App de gestión y rentabilidad de la unidad de negocio de fletes de Mueblería MAF
(Lerma, Edo. de México). Reemplaza al cotizador anterior y al Excel de registro.

El diseño completo y las decisiones acordadas están en `DISENO.md`. Léelo primero.

## Restricción del entorno (importante)

**El proyecto no puede vivir en una ruta con acentos.** Webpack falla al resolver
sus propios módulos (`Cannot find module 'caniuse-lite/data/features/...'`) cuando
alguna carpeta del path tiene í, ó, etc. Los espacios sí son inofensivos.
Por eso el proyecto está en `~/Documents/maf/envios-maf` y no dentro de
`Envíos MAF Cotizador y Operación/`.

## Stack

- **Next.js 14 (App Router) + TypeScript + Tailwind**
- **Supabase (Postgres)** — solo desde el servidor, con `service_role`
- **Leaflet + OSRM + Nominatim** — mapa, distancias reales y orden óptimo de ruta
- **Recharts** — gráficas

## Comandos

```bash
npm run dev               # http://localhost:3000
npm run build
npm run import:historico  # importa scripts/data/historico.json a Supabase

python3 scripts/parse_excel.py "<ruta al xlsx>" scripts/data/historico.json
```

## Seguridad — no negociable

El navegador **nunca** habla directo con Supabase. La `service_role` key ignora
RLS: si llegara al cliente, quedaría expuesta toda la base. Todo acceso pasa por
API routes o server components que importan `@/lib/db`.

- `src/lib/db.ts` solo puede importarse desde código de servidor.
- Ninguna variable de entorno con datos sensibles lleva prefijo `NEXT_PUBLIC_`.
- `src/middleware.ts` bloquea todo salvo `/login`; las rutas `/api` responden 401.
- Las tablas tienen RLS habilitado **sin políticas**, para que la anon key no
  pueda leer nada aunque se filtre.

## El modelo, en corto

**La ruta contiene los gastos, el envío contiene el ingreso.** Un envío suelto es
una ruta de una sola parada. En una ruta con varias paradas los ingresos no se
dividen (cada cliente paga completo) y los gastos sí se comparten: ahí está la
ganancia de agrupar.

De cada flete se reparte por porcentajes: renta de la unidad (distinta si es
propia o rentada), comisión de vendedor, chofer y ayudante, y administración.
Lo que sobra, después de gasolina y casetas, es la utilidad.

**El % de administración es utilidad del dueño, no una comisión por pagar.** Se
descuenta para medir el margen operativo pero no genera fila en `comisiones`.

## Regla de oro de la configuración

Cada ruta guarda un `config_snapshot` con los porcentajes vigentes al cerrarse.
**Cambiar la configuración nunca debe reescribir la rentabilidad histórica.**
Si tocas `v_ruta_pnl`, respeta esto.

## Los dos motores de precio

1. `src/lib/pricing.ts` — algoritmo calibrado con 17 envíos reales (bandas de km,
   factor carretera 1.55, margen 50%, multiplicador por tamaño). Los parámetros
   viven en `config_negocio.params_pricing`, pero con los valores por defecto los
   resultados son **idénticos** al cotizador original.
   `verificarParidad()` es la prueba de regresión: Toluca $1,200 · CDMX $2,400 ·
   Puebla $7,600 · Monterrey $25,700. Si esos números cambian, algo se rompió.

2. `src/lib/negocio.ts` — modelo de reparto por porcentajes. Da el punto de
   equilibrio y el precio objetivo. A diferencia de la Calculadora Flete original,
   separa esos dos números en vez de meter un colchón fijo de 15% en el mínimo.

El cotizador muestra ambos lado a lado.

## El histórico importado

Los 60 registros del Excel se importan con `config_snapshot` de porcentajes en
**cero**, porque en ese periodo no se aplicaba el modelo de porcentajes: al
ayudante se le pagaba monto fijo y el chofer no cobraba comisión. Así su utilidad
es `ingreso − gastos reales`, que es lo que de verdad pasó.

Aplicarles los porcentajes de hoy haría que la utilidad histórica pareciera mucho
menor de lo que fue y arruinaría cualquier comparación de tendencia.

## Convenciones

- Todo en español (es-MX): código, nombres de tablas, columnas y UI.
- Montos con `mxn()` de `src/lib/pricing.ts`.
- Los envíos importados llevan `[excel:fila-N]` en `notas`: así el importador es
  idempotente y se puede rastrear cada dato a su origen.
- Leaflet siempre con `dynamic(..., { ssr: false })`.
