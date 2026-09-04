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

## Cómo se pagó, y dónde quedó el dinero

Cada parada guarda su desglose en `cobros`: una fila por forma de pago
(`efectivo`, `transferencia`, `tienda`). Una parada de $3,500 pagada mitad en
efectivo y mitad por transferencia son dos filas, no un campo con dos valores.

`envios.cobro_detallado` distingue lo que se sabe de lo que se supone. En false
—los envíos viejos— sigue valiendo el supuesto de siempre: contado entregado es
contado cobrado. En true, mandan sus `cobros` y no se supone nada. Por eso
`v_movimiento_custodia` y `v_caja_mensual` excluyen del renglón de contado a los
que ya tienen desglose: contarlos por los dos lados los cobraría dos veces.

**Cobrado en tienda** es la tercera bolsa. Tiendas MAF cobra el flete en su caja
y ese dinero nunca llega a Envíos MAF: se abona contra la renta de las
camionetas. No es cuenta por cobrar —nadie debe— pero tampoco es caja. Se
registra como `pagos_renta` con `concepto = 'cobrado_en_tienda'`, que baja el
fondo pero **no** la caja: `v_movimiento_custodia` lo saca del bolsillo de la
tienda, porque restarlo del tuyo la dejaría corta por un dinero que nunca estuvo.

## Las tres páginas de Dinero

`/dinero/entra` · `/dinero/sale` · `/dinero/donde`. Es la división de siempre en
contabilidad —cobranza, pagos, bancos— y existe porque "en manos de" y "caja"
son saldos, no entradas ni salidas.

Las tres cargan lo mismo con `cargarDinero()` y calculan con `calculos.ts`. No
es descuido: si cada página sumara por su cuenta, la primera corrección que se
hiciera en una dejaría a las otras dando cifras distintas del mismo dinero. El
periodo viaja en la URL (`?p=&d=&h=`) para que no se pierda al navegar.

## El cotizador arma el viaje, no el destino

Se cotizan todas las paradas juntas porque ahí está el negocio: cada cliente
paga su flete completo y la gasolina se paga una sola vez, así que el margen de
tres entregas juntas no se parece al de ninguna por separado.

De ahí sale la ruta ya armada, por `/api/rutas/desde-cotizacion`: en un solo
endpoint y no creando la ruta y luego cada parada, porque a medio camino
quedaría un viaje incompleto y porque el alta normal de una parada le suma sus
km a la ruta — aquí el total ya viene del recorrido real y sumarlo lo duplicaría.

## La navegación cambia de lado, no de contenido

En escritorio es el carril de iconos de la izquierda. En un teléfono ese carril
se comía 64 de los 390 px de ancho y encima quedaba lejos del pulgar, así que
ahí baja al pie. Las dos salen del mismo `SECCIONES`: con dos listas, un día
habría una pantalla a la que solo se llega desde el escritorio.

La barra del pie lleva **el nombre debajo de cada icono** aunque el carril no lo
necesite. En el carril el nombre sale al pasar el cursor, y en una pantalla
táctil no existe "pasar por encima": sin la palabra, un camión, una tarjeta y un
mapa nunca dicen "flotilla", "dinero" y "cotizador".

Abajo van las seis secciones que se visitan a diario. **Configuración y Salir
suben a la M**, que en el teléfono abre un menú: las dos que menos se tocan no
tienen por qué competir por el pulgar con las que sí, y ocho columnas de 47 px
no se aciertan. La M sigue siendo la marca y no tres rayas — es lo que ya estaba
arriba.

Ese menú se pinta con un portal al `body`. La cabecera es `sticky z-30` y lleva
su propio desenfoque, y las dos cosas encierran a sus hijos: dentro de ella el
z-1110 del menú no pasaba del 30 de la cabecera —el velo no cubría la página— y
un `backdrop-filter` dentro de otro solo alcanza a ver el fondo de su padre, así
que el vidrio salía transparente sobre un texto nítido.

El hueco que la barra necesita vive en `--barra-movil`, que leen el cascarón
—que lo aparta— y la barra —que lo llena—. Con dos números sueltos, el día que
uno cambie el otro no se entera y algo queda debajo. En las pantallas de mapa el
alto es el de la ventana **menos** ese hueco; si no, el mapa mediría la pantalla
entera y la hoja de abajo nacería tapada.

## En el teléfono, las tablas son tarjetas

La retícula de rutas mide 62 rem —el doble que la pantalla—. Dentro de su scroll
horizontal no se lee un renglón entero sin arrastrarlo dos veces, ni se comparan
dos viajes. En `md:` abajo cada viaje es una tarjeta y las columnas se vuelven
renglones.

Lo que no cambia es el orden de la resta: Venta, Costos, Utilidad, uno al lado
del otro. Es lo que deja comprobar el viaje de memoria, y era la razón de que en
la retícula fueran esas tres y en ese orden.

## Misiones, no paradas

En la interfaz cada entrega de un viaje se llama **misión**. La tabla sigue
siendo `envios` y la columna de las vistas sigue siendo `paradas`: renombrar
una vista obliga a una migración y a tocar `v_pnl_mensual` y `v_ruta_pnl`, y el
nombre que se ve no vale eso. En `geo.ts` y en el prop de `Mapa` "parada"
tampoco es la palabra del negocio sino el punto de paso que se le manda a OSRM.

## Dos pantallas con mapa, y por qué no son iguales

**El cotizador** es el mapa a pantalla completa con todo flotando encima: ahí
el mapa no ilustra la decisión, ES la decisión —dónde cae cada parada y qué
tan lejos están entre sí es lo que dice si el viaje conviene—.

**El detalle de una ruta** es una retícula: los datos a la izquierda, el mapa
arriba a la derecha y el resto abajo. Aquí el viaje ya pasó y la pregunta que
trae a alguien es "¿convino?". Eso se contesta con números; el recorrido los
explica pero no los sustituye, así que ocupa su tarjeta y no la pantalla.

Lo que comparten vive en `src/components/vidrio.tsx`: `useDesplegable` (el
cursor abre, el clic fija —sin lo segundo el panel sería inalcanzable en una
pantalla táctil), `Cuerpo`, `Plegable`, `HojaMovil` y `BordesOscuros`. Las dos
usan `.vidrio` para lo que va ENCIMA del mapa y `.lamina` para lo que no:
difuminar un fondo liso no se ve y cuesta GPU en cada scroll.

Ninguna de las dos desplaza la página. Cada panel se pliega a **una línea que
ya diga algo** —"Gastos · 7 · −$1,184"— porque si para saber cuánto se gastó
hay que abrirlo, plegarlo no ahorró nada: nada más escondió.

Y cada sección tiene su icono y su color, porque con todas las tarjetas del
mismo tono la pantalla se leía como una cuadrícula de rectángulos iguales y
había que ir a buscar el título para saber en cuál se estaba. Verde lo que
quedó, teal lo que se entregó, naranja y ámbar lo que se fue. El lima no
aparece: marca lo ACTIVO y nada más. Se suman dos alturas de lámina —`.lamina`
levantada para la columna, `.lamina-honda` para la banda de abajo—, que es la
jerarquía por elevación del resto de la app.

**El mapa no lleva marco.** Se desvanece por las orillas con una viñeta encima
—`.mapa-difuminado`— y se funde con el fondo. Es una viñeta y no una máscara
por dos razones: enmascarar el plano de teselas borra el mapa entero, porque
los planos de Leaflet son cajas de cero por cero cuyo contenido se desborda y
un degradado en porcentajes sobre cero píxeles cubre todo; y enmascarar el
contenedor se llevaría por delante los créditos de OpenStreetMap, que son
obligatorios. Va en `z-500`: encima de los planos (400), debajo de los
controles y los créditos (1000).

La viñeta pinta **el fondo real de la página**, no un negro cualquiera: el
`body` lleva dos manchas de color tenues ancladas a la ventana —más fuertes
justo en la franja de arriba— y una viñeta de negro liso se despedía del mapa
en un color que no era el de atrás, así que el corte reaparecía donde más se
notaba. Las manchas viven en `--manchas-de-fondo` y las comparten los dos,
con `background-attachment: fixed` para que caigan en el mismo sitio.

**Los pines llevan globo.** Se abre al tocar el pin y también al acercarle el
cursor —con retardo, o cruzar el mapa iría abriendo globos a su paso—, y al
salir NO se cierra: hay que poder llegar hasta sus botones. Lo cierran el pin
siguiente, un clic en el mapa o su propia cruz.

Dentro va lo mismo que dice el renglón de la lista y los mismos botones, que
abren las mismas ventanas: quien está mirando el mapa ya encontró la misión, y
mandarlo a buscarla otra vez en la columna para cambiarle algo lo devuelve al
principio. Un formulario propio en el globo se separaría del de la lista a la
primera corrección.

El contenido es React, no una cadena de HTML: `bindPopup` acepta un nodo del
DOM, así que `Mapa` crea una caja por pin y quien lo usa pinta dentro por
portal. Por eso el globo entra como función y no como campo de `PuntoMapa` —la
lista de paradas va memorizada para no rehacer los marcadores cada vez que
cambia un cobro, y ahí dentro el globo se quedaría con los datos del día en que
se dibujó el mapa—. Las cajas se crean todas de entrada aunque el globo esté
cerrado, porque Leaflet mide el contenido al abrirlo; por lo mismo el globo
lleva el contador de evidencias y no el componente que las pide, que al montarse
pediría las de todas las misiones nada más abrir la ruta.

`.leaflet-popup-pane` sube a **950**. Leaflet lo deja en 700 y los paneles que
flotan sobre el mapa viven en 900: el globo salía con la cabecera cortada por
debajo de la pastilla del viaje. En 950 pasa delante de los paneles y sigue por
debajo de los controles de zoom (1000) y de las ventanas (1200). El margen con
que se autodesplaza al abrirse es el mismo que respeta el encuadre —lo que le
tapan los paneles—, para que no nazca escondido detrás de uno.

Cada misión se abre entera al acercar el cursor, con **retardo**. Sin él,
cruzar la lista con el ratón desplegaba media docena a su paso y pedía las
evidencias de todas.

Y se pliega **solo cuando no cabe**. La decisión la toma la ventana, con la
pantalla `alto:` de Tailwind —`(min-height: 760px)`—: arriba de eso el panel
nace abierto, debajo se recoge y se abre al acercar el cursor. Esconder por
costumbre un dato que sí cabía le cuesta un clic a quien viene a leerlo.

Los paneles sobre el mapa van en `z-900`. Los planos de Leaflet viven en 400 y
sus controles en 1000: por debajo de 400 quedarían enterrados, por encima de
1000 taparían el zoom. Las ventanas modales suben a 1200, arriba de las dos.

En una ruta **sin ninguna misión ubicada** —los 60 registros del Excel y todo
lo capturado antes del mapa— no va un mapa vacío sino `LienzoRuta`: curvas de
nivel abstractas y el viaje contado como cadena (de dónde salió, en qué orden
entregó, cuánto cobró cada entrega, si volvió). Alude al viaje sin afirmar
dónde ocurrió, que es justo lo que no se sabe.

El mapa es una sola instancia de Leaflet para las dos anchuras: en celular su
caja crece hasta llenar la pantalla y los datos se recogen en la hoja de
abajo. Duplicar el componente habría montado dos mapas y pedido dos veces las
mismas teselas a OpenStreetMap.

## Ubicación y kilómetros

`envios.lat/lng` y `rutas.km_osrm/roundtrip/orden_optimo` existían desde el
schema original sin que nadie los llenara. Desde fase7 se llenan:

- **Nominatim** busca direcciones y **OSRM** traza el recorrido. Los dos solo
  desde el servidor (`src/lib/geo.ts`): Nominatim exige un `User-Agent` que
  diga quién llama y admite una consulta por segundo, y desde el navegador cada
  pestaña sería un cliente suelto imposible de frenar. Por eso también busca al
  dar Enter y no mientras se escribe.
- El origen se fija como primer punto (`source=first`). Dejar que el
  optimizador escoja por dónde empezar daría un recorrido más corto en el papel
  e imposible en la realidad: la camioneta sale de la bodega.
- `envios.distancia_km` es el tramo que trajo a esa parada desde la anterior.
  Con `roundtrip` la suma de los tramos NO da `km_total`: falta el regreso.
- `rutas.km_manual` protege lo escrito a mano. Se prende solo al teclear el
  kilometraje, y mientras esté prendido recalcular el recorrido guarda su
  resultado en `km_osrm` pero no toca `km_total`. Nadie corrige un dato para
  que la app se lo borre.

Nada se ubica solo. Buscar "Bodega" o "Sucursal" habría dado coordenadas
plausibles y equivocadas, y un dato inventado en el mapa es peor que un hueco
porque nadie vuelve a revisarlo.

## Los dos motores de precio

1. `src/lib/pricing.ts` — algoritmo calibrado con 17 envíos reales (bandas de km,
   factor carretera 1.55, margen 50%, multiplicador por tamaño). Los parámetros
   viven en `config_negocio.params_pricing`, pero con los valores por defecto los
   resultados son **idénticos** al cotizador original.
   `verificarParidad()` es la prueba de regresión: Toluca $1,200 · CDMX $2,400 ·
   Puebla $7,600 · Monterrey $25,700. Si esos números cambian, algo se rompió.
   Se fija por **kilómetros**, no por coordenadas: mover `ORIGEN` —la bodega—
   cambia los km de todo destino y haría fallar la prueba sin que nadie hubiera
   tocado el algoritmo. Por eso `precioDesdeKm()` va separado de `calcPrecio()`.

   `ORIGEN` es de dónde sale toda camioneta: C. Benito Juárez 9, San Pedro
   Tultepec — 19°16'23.2"N 99°30'47.4"W. Las coordenadas están **medidas en el
   punto**, no geocodificadas: Nominatim solo conoce el eje de la calle y
   dejaba la bodega a un kilómetro de donde está. Un geocodificador acierta la
   calle y adivina el número.

   Es el punto de partida tanto del precio individual (línea recta × 1.55) como
   del recorrido de OSRM, y vive solo en el código: no hay una segunda copia en
   la base que se desincronice. Moverlo cambia los kilómetros de toda ruta que
   los saque del recorrido —las de `km_manual = false`— la próxima vez que se
   recalculen. Las que traen kilometraje escrito a mano no se tocan.

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
- Leaflet siempre con `dynamic(..., { ssr: false })`. Las teselas son las de
  OpenStreetMap oscurecidas con un filtro CSS, no las de un servidor de mapas
  oscuros: así se depende de una sola fuente, la que ya está en los créditos.
- Las evidencias (fotos, PDFs) viven en el bucket privado `evidencias` de
  Supabase Storage y se sirven por `/api/adjuntos/<id>/archivo`, que pasa por el
  middleware. Nunca por URL firmada: esa funciona para cualquiera que la tenga.
- Las subcategorías de gasto son una tabla editable desde Configuración. La
  categoría es un enum y no se toca: de ella cuelga `v_ruta_pnl`.
