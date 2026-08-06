# Cuestionario de diseño — Envíos MAF (F3.5)

> Armado a partir de las 10 imágenes de `Design_Inspo/`.
> Responde con el número/letra; donde puedas, dime *por qué* — eso vale más que la opción.

---

## Lo que leo en tus referencias

### `Black/` — el bloque más grande y más coherente
- Fondo casi negro (#0a0a0a) con tarjetas gris carbón; **jerarquía por elevación, no por bordes**.
- Chips-pill en la barra superior con métricas vivas: `Active 6/10 · Drivers 6/8 · Trips 5 · On-time 94.2%`.
- Sidebar angosto de iconos circulares; el activo es un círculo **blanco sólido**.
- Acento **lima-amarillo** para lo primario: logo, botón "Activate Route", la unidad seleccionada en el mapa.
- Badges semánticos por todos lados: `Critical / High / Normal / Low`, `Online / Offline`, `Driving / Resting / Off Duty`.
- Tabs con contador: `Overview · Cargo · Trips 2 · Maintenance 3 · Alerts 0`.
- Vista **Board tipo kanban** para personas, agrupadas por estado.
- Render 3D del camión con la caja dividida en grid de posiciones de carga.
- Gauges (velocímetro, nivel de combustible) y gráfica de área morada.

### `Stats Dashboard Style/` — el opuesto
- Fondo blanco hueso, tarjetas con **degradado suave multicolor** (verde → ámbar → durazno → azul).
- Números **enormes y ultra-light**, etiqueta chiquita arriba, veredicto en palabra ("Normal", "Optimal").
- Líneas blancas finísimas dibujando formas orgánicas; punto lima como marcador del dato actual.
- Escalas nombradas en vez de números: `Younger ← → Older`, `Optimal · Mid · Moderate · High`.

### `Truck Dashboard/` — claro operativo
- Blanco con degradado verdoso, nav de pills negras, **morado** como acento de datos.
- Deltas en pill de color: `+33%` verde, `-22%` morado.
- Gantt de viajes abajo; tira horizontal de tarjetas de embarque con render del camión.

### `Cotizador/`
- Mapa satelital oscuro a pantalla completa, paneles **glassy** con blur encima.
- Número grande con los decimales en gris: `78.3%`, `142,580 today`.
- Alertas con severidad y acciones sugeridas ("Recommend: dispatching reserve E-Bus").

### `Interactive Buttons; Videogame Style/`
- Grid de **botones-tarjeta**, cada uno con una mini ilustración técnica adentro (no un icono: un diagrama).
- Popup con borde naranja brillante y glow, sensación HUD.

### Contra lo que hay hoy
La app es clara, teal `#0f5c52`, sobria, densa en tablas, radios chicos, tipografía del sistema.
**Ninguna de tus 10 referencias se parece a eso.** El rediseño es real, no un ajuste.

---

## 1. Dirección general

**1.1** ¿A qué mundo le entramos?
- **a)** Oscuro operativo (`Black`) — se ve caro, los mapas y los estados brillan, es lo que más repetiste.
- **b)** Claro editorial (`Stats Dashboard`) — más legible de día, más "reporte de dueño".
- **c)** Las dos, con interruptor claro/oscuro (más trabajo: cada color se define dos veces).
- **d)** Claro por defecto, oscuro solo en Cotizador (por el mapa) y Rutas.

**1.2** ¿Dónde vas a usar la app más seguido? Escritorio de oficina, laptop, iPad, o el celular en la camioneta. (Cambia la densidad y el tamaño de los botones.)

**1.3** ¿Alguien más además de ti va a verla? Un chofer, un vendedor, tu contador. Si sí, ¿qué pantalla verían?

**1.4** De las 10 imágenes, ¿cuál es **la número 1**? Si el rediseño se pareciera solo a una, ¿cuál?

---

## 2. Color

**2.1** El acento lima-amarillo aparece en 6 de tus 10 referencias. ¿Lo adoptamos como color primario de la app?
- **a)** Sí, lima sobre oscuro, como en `Black`.
- **b)** Sí pero más discreto: lima solo para "lo activo/seleccionado", no para botones.
- **c)** No, conservar el teal actual `#0f5c52` como identidad de MAF.
- **d)** Otro color: ¿cuál?

**2.2** ¿Hay colores de la Mueblería MAF que debamos respetar? (logo, letreros, camionetas). Si tienes el logo en digital, pásamelo.

**2.3** Los degradados suaves de `Stats Dashboard`: ¿los quieres en las tarjetas de indicadores, o te parecen bonitos pero poco serios para dinero?

**2.4** Para utilidad/pérdida, ¿verde y rojo tradicionales, o prefieres una pareja menos "semáforo"?

---

## 3. Tipografía

**3.1** Los títulos de tus referencias son sans geométrica bold (`Driver Management`, `Trucks Management`). ¿Contratamos una tipografía real (Inter, Geist, Satoshi) o seguimos con la del sistema?

**3.2** Los números gigantes ultra-light de `Stats Dashboard` vs. los números medium compactos de `Black`. ¿Cuál para los montos en pesos?

**3.3** ¿Los montos en monoespaciada (como hoy, para que las columnas alineen) o en la misma tipografía del texto (más elegante, menos alineado)?

---

## 4. Componentes

**4.1** **Barra superior de métricas vivas** (`Active 6/10 · Trips 5 · On-time 94.2%`) presente en toda la app. ¿La quieres? Si sí, ¿qué 4 números pondrías tú ahí? Mi propuesta: rutas de hoy · por cobrar · comisiones por pagar · margen del mes.

**4.2** **Navegación**: hoy es una barra superior. Tus referencias usan sidebar de iconos. ¿Cambiamos a sidebar?

**4.3** **Tabs con contador** (`Trips 2 · Maintenance 3 · Alerts 0`) en el detalle de ruta y de unidad. ¿Van?

**4.4** **Vista Board tipo kanban**: ¿te sirve para rutas por estado (agendada / en curso / entregada) como el `Driver Management`?

**4.5** **Flecha ↗ en la esquina de cada tarjeta** para abrir el detalle en un panel inmersivo. ¿Va?

**4.6** Los **botones-tarjeta con ilustración adentro** del estilo videojuego: ¿dónde los ves? Se me ocurre la selección de tamaño de carga en el cotizador (Chico/Mediano/Grande/Extra Grande, cada uno con su dibujo).

**4.7** Las tablas densas de hoy (Rutas, Dinero): ¿las conservamos como están —son rápidas de leer— o las convertimos en listas de tarjetas?

---

## 5. Datos y gráficas

**5.1** ¿Gauges de aguja (velocímetro) como en `Black`? Sirven para "salud del margen" y para "suma de porcentajes" en Configuración. ¿O te parecen decorativos?

**5.2** ¿Sparklines (líneas mínimas sin ejes) dentro de cada fila de tabla? Ej.: cada unidad con su tendencia de utilidad de 6 meses.

**5.3** Escalas con palabra en vez de número (`Sano · Apretado · Insostenible`) — ya existe en Configuración. ¿Lo extendemos a márgenes y a clientes?

**5.4** El **Gantt de viajes** del `Truck Dashboard`: ¿te sirve para ver la agenda de la semana por unidad?

---

## 6. Imágenes y 3D

> Tú generas las imágenes; yo te paso los prompts en un `.md`.

**6.1** El render del camión es protagonista en 4 referencias. ¿Quieres renders de **tus** unidades reales (NP300 Negra, NP300 Azul, Saveiro, Tornado)? Si sí, ¿tienes fotos de cada una?

**6.2** ¿Estilo del render: fotográfico oscuro (`Black`), blanco de estudio (`Truck Dashboard`), o ilustración de línea?

**6.3** ¿Quieres el "cargo layout" —la caja dividida en posiciones para ver qué mueble va dónde— o es sobrediseño para tu operación?

**6.4** ¿Fotos de los choferes en Contactos, como en `Driver Management`?

---

## 7. Alcance y orden

**7.1** ¿Rediseñamos todo de un jalón o pantalla por pantalla? Si es por pantalla, mi orden sugerido: **Rentabilidad → Rutas → Detalle de ruta → Dinero → Cotizador → resto**.

**7.2** ¿Esto es F3.5 (una capa de diseño sobre lo que ya funciona) o también reorganizamos qué va en cada pantalla?

**7.3** ¿Qué es lo que **más te choca** de la app hoy, visualmente? Eso lo arreglo primero.

---

## 8. Lo que yo decidiría si no contestas

Para que tengas contra qué discutir:

1. **Oscuro operativo** como base, con el lima como acento único de "activo/primario".
2. **Sidebar de iconos** + barra superior de 4 métricas vivas.
3. Números en **medium compacto**, montos en monoespaciada (las columnas de dinero tienen que alinear).
4. Tablas densas se quedan, pero con **filas más altas, badges de estado y sparkline al final**.
5. **Nada de degradados multicolor en cifras de dinero** — sí en las tarjetas de portada de cada sección.
6. Gauge de aguja **solo** en Configuración, para la suma de porcentajes.
7. Renders de tus 4 unidades, estilo fotográfico oscuro sobre fondo negro.
