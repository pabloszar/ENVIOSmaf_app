# Prompts para generar las imágenes — Envíos MAF

> Tú las generas, yo las integro. Guárdalas en `public/img/` con el nombre que
> indica cada bloque; el código ya las va a buscar ahí.
>
> **Contexto de estilo para todas:** la app es oscuro operativo, fondo
> `#0b0b0c`, tarjetas `#141416`, acento lima `#d7f000`, dato teal `#14a08f`.
> Todo lo que generes debe verse bien recortado sobre negro puro.

---

## 1. Las cuatro unidades de la flotilla

Van en Flotilla y en el detalle de ruta, como en `Black/Envio in Detail`.
Necesito las cuatro en el **mismo ángulo y la misma luz**, si no, la fila de
tarjetas se ve desordenada.

**Ángulo fijo para las cuatro:** tres cuartos frontal desde la izquierda, cámara
a la altura del cofre, la unidad ocupando el 85% del ancho.

### `public/img/unidades/np300-negra.png`
```
Studio product photograph of a black Nissan NP300 Frontier pickup truck with a
flatbed cargo box, three-quarter front view from the left, camera at hood
height. Matte black bodywork, subtle rim lighting from the upper left in cool
white, a soft warm bounce from the lower right. Pure black seamless background,
no floor line, no shadow on the ground. The vehicle is clean, empty, no logos,
no license plate text. Photorealistic, sharp on the body panels, shallow
falloff toward the rear. Centered composition with generous margin. 4K, PNG with
transparent background.
```

### `public/img/unidades/np300-azul.png`
```
Same framing, lighting and background as the previous image, but the pickup is
deep metallic blue. Studio product photograph of a blue Nissan NP300 Frontier
pickup truck with a flatbed cargo box, three-quarter front view from the left,
camera at hood height, cool white rim light from the upper left, pure black
seamless background, no ground shadow, no plates, no logos. Photorealistic, 4K,
PNG with transparent background.
```

### `public/img/unidades/saveiro.png`
```
Same framing, lighting and background. Studio product photograph of a white
Volkswagen Saveiro compact pickup, three-quarter front view from the left,
camera at hood height, cool white rim light from the upper left, pure black
seamless background, no ground shadow, no plates, no logos. Photorealistic, 4K,
PNG with transparent background.
```

### `public/img/unidades/tornado.png`
```
Same framing, lighting and background. Studio product photograph of a white
Chevrolet Tornado compact pickup, three-quarter front view from the left, camera
at hood height, cool white rim light from the upper left, pure black seamless
background, no ground shadow, no plates, no logos. Photorealistic, 4K, PNG with
transparent background.
```

> **Si prefieres que sean tus unidades reales:** mándame una foto de cada una
> —de día, de tres cuartos frontal, la unidad completa dentro del encuadre— y
> te paso prompts de edición en vez de generación.

---

## 2. Tamaños de carga (para el cotizador)

Los botones-tarjeta con ilustración adentro, estilo
`Interactive Buttons; Videogame Style`. Cuatro piezas, **misma escala relativa**
para que se entienda que uno es más grande que otro.

### `public/img/carga/chico.png`
```
Minimal technical line illustration of a single small cardboard box, isometric
view, drawn with thin 1px light gray lines on a fully transparent background,
no fill, blueprint wireframe aesthetic, subtle lime green accent (#d7f000) on
one edge only. Clean, centered, lots of empty space around the object. No text,
no dimensions, no annotations.
```

### `public/img/carga/mediano.png`
```
Same wireframe style and line weight: minimal technical line illustration of a
two-seat sofa, isometric view, thin light gray lines on transparent background,
no fill, one lime green (#d7f000) accent edge. Drawn at a scale noticeably
larger than a single box. Centered, clean, no text.
```

### `public/img/carga/grande.png`
```
Same wireframe style and line weight: minimal technical line illustration of a
bedroom set — a bed frame with a mattress and a nightstand grouped together,
isometric view, thin light gray lines on transparent background, no fill, one
lime green (#d7f000) accent edge. Larger in scale than the sofa. Centered,
clean, no text.
```

### `public/img/carga/extra-grande.png`
```
Same wireframe style and line weight: minimal technical line illustration of a
full living room set — a large sectional sofa, a dining table and four chairs
grouped together, isometric view, thin light gray lines on transparent
background, no fill, one lime green (#d7f000) accent edge. The largest of the
four. Centered, clean, no text.
```

---

## 3. Portada de Rentabilidad (opcional)

La textura de fondo que usan `Stats Dashboard` y `Cotizador` detrás de los
números grandes. Va como fondo sutil del encabezado, al 15% de opacidad.

### `public/img/textura-rentabilidad.png`
```
Abstract dark background texture: very fine concentric contour lines, like a
topographic map or an oscilloscope trace, in dark teal (#14a08f) at low opacity
over pure black. Lines are hairline thin and get denser toward the right side.
No text, no logos, no recognizable objects. Wide format 2400x600, subtle enough
to sit behind white text without competing with it.
```

---

## 4. Estado vacío

Cuando no hay rutas en el periodo. Hoy es solo texto y se siente roto.

### `public/img/vacio-rutas.png`
```
Minimal technical line illustration of an empty flatbed pickup truck seen from
the side, thin 1px light gray lines on a fully transparent background, no fill,
blueprint wireframe aesthetic, no accent color. Small and quiet, meant to sit
above a short line of explanatory text. No text in the image, no ground line.
```

---

## Cuando las tengas

Pásamelas o déjalas en `public/img/` y me dices. Yo me encargo de recortarlas al
tamaño correcto, generar las versiones `@2x` y conectarlas a la app. **No las
metas al repo sin avisarme**: si pesan mucho hay que optimizarlas antes, o la
app va a tardar en cargar en el celular.
