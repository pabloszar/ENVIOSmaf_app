'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { renderUnidad, sueloUnidad } from '@/lib/imagenes';
import { useSinMovimiento } from '@/components/movimiento';

/* ══════════════════════════════════════════════════════════════════════════
   El garage

   La flotilla como un lugar: las unidades en fila, cada una bajo su lámpara.
   Elegir una no abre una ficha: la cámara vuela hasta ella.

   Las unidades son sus renders —fotos con fondo transparente— paradas en un
   espacio en perspectiva. No son modelos 3D, y eso decide cómo se mueve la
   cámara: se acerca, se desliza y cabecea, pero no rodea a la unidad, porque
   una foto vista de canto es una raya. El 3D está en todo lo demás: el piso
   que fuga, las columnas que pasan por delante del muro, las lámparas que se
   quedan atrás al acercarse.

   Las medidas están en "píxeles de mundo": lo que mide cada cosa cuando la
   cámara la ve a escala 1.
   ══════════════════════════════════════════════════════════════════════════ */

/** Distancia del ojo a la pantalla. Tiene que coincidir con `.garage`. */
const P = 800;
/** Ancho de cada cajón de estacionamiento. */
const BAHIA = 540;
const ANCHO_AUTO = 460;
/** Los renders son todos de 1400 × 787. */
const ALTO_AUTO = (ANCHO_AUTO * 787) / 1400;
/**
 * Una bodega alta, no un estacionamiento: el techo queda lejos y las
 * lámparas cuelgan de él. Con el techo bajo la cámara tenía que meterse
 * debajo para ver las lámparas y entonces ya no veía el piso.
 */
const TECHO = 760;
/** A qué altura cuelga el disco de cada lámpara. */
const LAMPARA = 560;
/** El muro del fondo y la orilla de enfrente, medidos desde la fila. */
const FONDO = -620;
/*
 * El piso termina aquí y se funde a negro; NO llega hasta debajo de la
 * cámara. De cerca la cámara queda a unos 530 de la fila: con el piso
 * llegando a 760 le pasaba por debajo y por detrás, y una hoja pegada al ojo
 * se agranda tanto que el navegador pide una textura enorme para ella.
 */
const FRENTE = 340;
const HONDO = FRENTE - FONDO;
const CENTRO_Z = (FRENTE + FONDO) / 2;
/** Cuánto mira hacia abajo la cámara, en grados. De lejos más, de cerca menos. */
const CABECEO_LEJOS = 8;
const CABECEO_CERCA = 7;

export interface UnidadGarage {
  id: string;
  nombre: string;
  activa: boolean;
  /** La segunda línea de la placa: "70 viajes · 45%". */
  pie: string;
}

type Estado = 'normal' | 'sobre' | 'elegida' | 'atenuada';

/** Qué tan prendida va cada luz según lo que le pasa a su unidad. */
const BRILLO: Record<Estado, number> = { normal: 0.6, sobre: 0.95, elegida: 1, atenuada: 0.1 };

const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Dónde se para la cámara.
 *
 * `s` es la escala a la que se ve la fila de unidades; de ahí sale cuánto se
 * acerca. `x` e `y` son el punto del mundo que queda en el centro de la
 * pantalla.
 *
 * De lejos, si la fila entera cabe, se ve entera. Si no cabe —un teléfono, o
 * el día que haya ocho unidades— no se encoge hasta volverlas estampillas:
 * se queda a un tamaño que se lee y la fila se recorre de una en una.
 */
function encuadre(ancho: number, alto: number, n: number, elegida: number, foco: number, escritorio: boolean) {
  const xDe = (i: number) => (i - (n - 1) / 2) * BAHIA;

  if (elegida >= 0) {
    if (escritorio) {
      // Lo que dejan libre las dos fichas de los lados.
      // Tope en 1.5: más cerca, la orilla del piso queda encima de la cámara.
      const s = limitar((ancho - 2 * 372) / ANCHO_AUTO, 0.95, 1.5);
      return { x: xDe(elegida), y: -128, s, cabe: true };
    }
    // En el teléfono la ficha sube desde abajo: la unidad se va al tercio alto.
    const s = limitar((ancho * 0.94) / ANCHO_AUTO, 0.55, 1.15);
    return { x: xDe(elegida), y: -ALTO_AUTO * 0.42 + (0.25 * alto) / s, s, cabe: true };
  }

  const sCabe = (ancho - 150) / (n * BAHIA);
  // Por debajo de media escala una camioneta ya es una estampilla.
  const cabe = sCabe >= Math.min(0.5, (ancho * 0.8) / ANCHO_AUTO);
  // Recorriéndola, cada unidad se ve más grande que con todas a la vez: es la
  // ventaja de no tener que meterlas todas.
  const s = cabe ? Math.min(sCabe, 0.95) : Math.min(0.68, (ancho * 0.8) / ANCHO_AUTO);
  // El piso de la fila cae a dos tercios de la pantalla; en el teléfono un
  // poco más abajo, para que la lámpara no quede detrás del título.
  return { x: cabe ? 0 : xDe(foco), y: (-(escritorio ? 0.2 : 0.25) * alto) / s, s, cabe };
}

export default function Garage({
  unidades, elegida, onElegir, teclado,
}: {
  unidades: UnidadGarage[];
  elegida: string | null;
  onElegir: (id: string | null) => void;
  /** Falso mientras hay un formulario abierto: ahí las flechas son del texto. */
  teclado: boolean;
}) {
  const quieto = useSinMovimiento();
  const escenario = useRef<HTMLDivElement>(null);
  const mirada = useRef<HTMLDivElement>(null);

  const [medida, setMedida] = useState<{ ancho: number; alto: number } | null>(null);
  const [escritorio, setEscritorio] = useState(true);
  const [sobre, setSobre] = useState<string | null>(null);
  const [foco, setFoco] = useState(0);
  // La cámara arranca un paso atrás y llega: el garage se entra, no aparece.
  const [llego, setLlego] = useState(false);

  const n = unidades.length;
  const iElegida = unidades.findIndex((u) => u.id === elegida);

  useEffect(() => {
    const el = escenario.current;
    if (!el) return;
    const medir = () => setMedida({ ancho: el.clientWidth, alto: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    const mq = window.matchMedia('(min-width: 1024px)');
    const leer = () => setEscritorio(mq.matches);
    leer();
    mq.addEventListener('change', leer);
    return () => { ro.disconnect(); mq.removeEventListener('change', leer); };
  }, []);

  useEffect(() => {
    if (!medida || llego) return;
    // Dos cuadros: el primero pinta la pose de salida, el segundo la cambia.
    // Con uno solo el navegador junta las dos y no hay vuelo que ver.
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setLlego(true)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [medida, llego]);

  // Al salir de una unidad, la fila se queda centrada en ella.
  useEffect(() => { if (iElegida >= 0) setFoco(iElegida); }, [iElegida]);

  const cam = encuadre(medida?.ancho ?? 1280, medida?.alto ?? 720, Math.max(n, 1), iElegida, limitar(foco, 0, Math.max(n - 1, 0)), escritorio);
  const s = llego ? cam.s : cam.s * 0.86;
  /** A escala `s` se llega acercando el mundo: s = P / (P − z). */
  const tz = P * (1 - 1 / s);

  /* ── La mirada: cabeceo y giro con el cursor ───────────────────────────
     Va cuadro a cuadro y no por transición porque persigue un blanco que se
     mueve —el cursor—, y una transición reiniciada sesenta veces por segundo
     se traba. Cada cuadro recorre una fracción de lo que falta: eso solo ya
     frena largo, igual que la curva de entrada. Cuando llega, se duerme. */
  const blanco = useRef({ rx: 0, ry: 0, cabeceo: CABECEO_LEJOS });
  const actual = useRef({ rx: 0, ry: 0, cabeceo: CABECEO_LEJOS });
  const cuadro = useRef(0);

  const pintar = useCallback(() => {
    const a = actual.current;
    if (mirada.current) {
      mirada.current.style.transform = `rotateX(${(-a.cabeceo + a.rx).toFixed(3)}deg) rotateY(${a.ry.toFixed(3)}deg)`;
    }
  }, []);

  const despertar = useCallback(() => {
    if (cuadro.current) return;
    const paso = () => {
      const a = actual.current, b = blanco.current;
      a.rx += (b.rx - a.rx) * 0.085;
      a.ry += (b.ry - a.ry) * 0.085;
      a.cabeceo += (b.cabeceo - a.cabeceo) * 0.07;
      pintar();
      const falta = Math.abs(b.rx - a.rx) + Math.abs(b.ry - a.ry) + Math.abs(b.cabeceo - a.cabeceo);
      cuadro.current = falta > 0.004 ? requestAnimationFrame(paso) : 0;
    };
    cuadro.current = requestAnimationFrame(paso);
  }, [pintar]);

  useEffect(() => {
    blanco.current.cabeceo = iElegida >= 0 ? CABECEO_CERCA : CABECEO_LEJOS;
    if (quieto) { actual.current = { ...blanco.current, rx: 0, ry: 0 }; pintar(); return; }
    despertar();
  }, [iElegida, quieto, despertar, pintar]);

  /*
   * Al desmontar se cancela el cuadro pendiente Y se anota que ya no hay
   * ninguno. Sin lo segundo la mirada no volvía a moverse jamás: en
   * desarrollo React monta dos veces, la limpieza de la primera cancelaba la
   * animación pero dejaba puesta la marca de "ya voy corriendo", y
   * `despertar` —que no arranca dos veces— se quedaba esperando a alguien
   * que no iba a llegar.
   */
  useEffect(() => () => { cancelAnimationFrame(cuadro.current); cuadro.current = 0; }, []);

  function seguirCursor(e: React.PointerEvent) {
    if (quieto || e.pointerType !== 'mouse' || !escenario.current) return;
    const r = escenario.current.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    // De cerca gira la mitad: con la unidad llenando la pantalla, el mismo
    // ángulo la saca de su sitio.
    const fuerza = iElegida >= 0 ? 0.5 : 1;
    blanco.current.ry = nx * 2.4 * fuerza;
    blanco.current.rx = -ny * 1.1 * fuerza;
    despertar();
  }
  function soltarCursor() {
    blanco.current.rx = 0;
    blanco.current.ry = 0;
    despertar();
  }

  /* ── Moverse por la fila ── */
  const mover = useCallback((paso: number) => {
    if (n === 0) return;
    if (iElegida >= 0) {
      onElegir(unidades[limitar(iElegida + paso, 0, n - 1)].id);
    } else {
      setFoco((f) => limitar(f + paso, 0, n - 1));
    }
  }, [iElegida, n, onElegir, unidades]);

  useEffect(() => {
    if (!teclado) return;
    const tecla = (e: KeyboardEvent) => {
      const en = e.target as HTMLElement | null;
      if (en && /^(INPUT|TEXTAREA|SELECT)$/.test(en.tagName)) return;
      if (e.key === 'Escape' && iElegida >= 0) { onElegir(null); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); mover(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); mover(-1); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [teclado, iElegida, mover, onElegir]);

  // Arrastrar de lado pasa a la unidad de junto. El clic que el navegador
  // dispara al soltar se ignora: si no, el arrastre también elegiría.
  const arrastre = useRef<{ x: number; fue: boolean } | null>(null);
  function bajar(e: React.PointerEvent) { arrastre.current = { x: e.clientX, fue: false }; }
  function subir(e: React.PointerEvent) {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    if (Math.abs(dx) > 48) { a.fue = true; mover(dx < 0 ? 1 : -1); setTimeout(() => { arrastre.current = null; }, 0); }
    else arrastre.current = null;
  }
  const fueArrastre = () => !!arrastre.current?.fue;

  /* ── El mundo ── */
  /*
   * Lo justo para que no se le vea la orilla al muro, y ni un píxel más: cada
   * plano es una textura en la tarjeta de video y su ancho se paga en megas.
   */
  const ANCHO_MUNDO = Math.max(n, 1) * BAHIA + 3600;
  const xDe = (i: number) => (i - (n - 1) / 2) * BAHIA;

  const estadoDe = (u: UnidadGarage): Estado =>
    elegida ? (u.id === elegida ? 'elegida' : 'atenuada') : sobre === u.id ? 'sobre' : 'normal';
  /** Una unidad inactiva está en el garage, pero con la luz apagada. */
  const brilloDe = (u: UnidadGarage) => BRILLO[estadoDe(u)] * (u.activa ? 1 : 0.28);

  const vuela = llego && !quieto ? 'garage-vuela' : '';

  return (
    <div ref={escenario} className="garage"
      onPointerMove={seguirCursor} onPointerLeave={soltarCursor}
      onPointerDown={bajar} onPointerUp={subir}
      onClick={() => { if (!fueArrastre() && elegida) onElegir(null); }}>

      <div className={`garage-eje ${vuela}`} style={{ transform: `translateZ(${tz.toFixed(1)}px)` }}>
        <div ref={mirada} className="garage-eje" style={{ transform: `rotateX(${-CABECEO_LEJOS}deg)` }}>
          <div className={`garage-eje ${vuela}`}
            style={{ transform: `translate3d(${(-cam.x).toFixed(1)}px, ${(-cam.y).toFixed(1)}px, 0)` }}>

            {/* ── Muro, piso y techo ──
                Tres lienzos y no tres cajas con degradados: ver `Lienzo`. */}
            <Lienzo w={4} h={190} clave="muro" pinta={pintaMuro} className="garage-pieza"
              style={{ left: -ANCHO_MUNDO / 2, top: -TECHO + 1, width: ANCHO_MUNDO, height: TECHO - 2,
                transform: `translateZ(${FONDO}px)` }} />

            {/* El piso va un poco translúcido a propósito: debajo de él está
                el reflejo de cada unidad, que es la unidad misma volteada.
                Con el piso opaco no se vería; así se ve como en un concreto
                pulido. Las juntas no son adorno: son las líneas que fugan al
                fondo y le dicen al ojo que esto tiene profundidad. Lleva
                pintado todo lo que no cambia: juntas, rayas de cajón,
                números y la sombra de contacto de cada unidad. */}
            <Lienzo w={Math.round(ANCHO_MUNDO / 2)} h={Math.round(HONDO / 2)} clave={`piso-${n}`}
              pinta={(c, w, h) => pintaPiso(c, w, h, n, ANCHO_MUNDO)}
              className="garage-pieza cifra"
              style={{ left: -ANCHO_MUNDO / 2, top: -HONDO / 2, width: ANCHO_MUNDO, height: HONDO,
                transform: `translateZ(${CENTRO_Z}px) rotateX(90deg)` }} />

            <Lienzo w={Math.round(ANCHO_MUNDO / 4)} h={Math.round(HONDO / 4)} clave={`techo-${n}`} pinta={pintaTecho}
              className="garage-pieza"
              style={{ left: -ANCHO_MUNDO / 2, top: -TECHO - HONDO / 2, width: ANCHO_MUNDO, height: HONDO,
                transform: `translateZ(${CENTRO_Z}px) rotateX(-90deg)` }} />

            {/* ── Columnas ──
                Están a medio camino entre la fila y el muro, y eso es todo
                su trabajo: al deslizar la cámara se mueven a otra velocidad
                que lo de adelante y lo de atrás. */}
            {Array.from({ length: n + 1 }, (_, i) => (
              <div key={i} className="garage-pieza garage-fija" style={{
                left: xDe(i) - BAHIA / 2 - 22, top: -TECHO + 1, width: 44, height: TECHO - 2,
                transform: 'translateZ(-330px)',
                background: 'linear-gradient(90deg, #19191d, #0c0c0e 55%, #151518)',
                boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.05)',
              }} />
            ))}

            {/* ── Los cajones ── */}
            {unidades.map((u, i) => {
              const e = estadoDe(u);
              const brillo = brilloDe(u);
              const render = renderUnidad(u.nombre);
              const suelo = sueloUnidad(render ? u.nombre : null);
              const espera = { '--espera': `${200 + i * 110}ms` } as React.CSSProperties;
              return (
                <div key={u.id} className="garage-pieza" style={{ transform: `translate3d(${xDe(i)}px, 0, 0)`, transformStyle: 'preserve-3d' }}>
                  {/*
                    * Ninguna de estas piezas toca a otra, y es a propósito.
                    *
                    * Cuando dos hojas se cruzan —el resplandor vertical con el
                    * disco acostado, la foto con el piso— el navegador las
                    * parte por la línea del cruce y ordena los pedazos según
                    * el ángulo. Al girar la mirada ese orden cambia de un
                    * cuadro al siguiente. Por eso cada una vive en su propia
                    * profundidad: lo que va sobre el piso flota un píxel
                    * encima, lo que va sobre el muro un píxel delante.
                    */}

                  {/* Paneles de madera en el muro, encendidos por su lámpara.
                      Es lo único cálido de la escena y por eso es lo que dice
                      dónde hay una unidad aun con todo lo demás negro. */}
                  <Luz espera={`${260 + i * 110}ms`} nivel={brillo * 0.75} w={210} h={220} pinta={pintaMadera}
                    style={{ left: -210, top: -440, width: 420, height: 440, transform: `translateZ(${FONDO + 1}px)` }} />

                  {/* El charco de luz, acostado sobre el piso. */}
                  <Luz espera={`${200 + i * 110}ms`} nivel={brillo} w={220} h={200} pinta={pintaCharco}
                    style={{ left: -330, top: -300, width: 660, height: 600, transform: 'translate3d(0, -1px, 0) rotateX(90deg)' }} />

                  {/* El anillo del cajón. Son dos, uno encima del otro, y se
                      cruzan por opacidad: blanco mientras nadie lo elige y
                      lima cuando sí —el lima marca lo activo y nada más, aquí
                      también—. El de rayas gira despacio: "esta está viva". */}
                  <Lienzo w={520} h={520} clave="anillo" pinta={(c, w) => pintaAnillo(c, w, 'rgba(255,255,255,0.14)', false)}
                    className="garage-pieza garage-luz"
                    style={{ left: -260, top: -260, width: 520, height: 520, transform: 'translate3d(0, -2px, 0) rotateX(90deg)',
                      opacity: e === 'elegida' ? 0 : e === 'atenuada' ? 0.15 : 1 }} />
                  <div className="garage-pieza garage-luz" style={{ left: -276, top: -276, width: 552, height: 552,
                    transform: 'translate3d(0, -3px, 0) rotateX(90deg)', opacity: e === 'elegida' ? 1 : 0 }}>
                    <Lienzo w={552} h={552} clave="anillo-lima" pinta={(c, w) => pintaAnillo(c, w, 'rgba(215,240,0,0.6)', false, 260)}
                      className="absolute inset-0 h-full w-full" />
                    <Lienzo w={552} h={552} clave="anillo-rayas" pinta={(c, w) => pintaAnillo(c, w, 'rgba(215,240,0,0.4)', true, 274)}
                      className={`absolute inset-0 h-full w-full ${e === 'elegida' ? 'garage-giro' : ''}`} />
                  </div>

                  {/* El haz. Detrás de la unidad, del disco al piso. */}
                  <Luz espera={`${200 + i * 110}ms`} nivel={brillo} w={330} h={278} pinta={pintaHaz}
                    style={{ left: -330, top: -LAMPARA + 2, width: 660, height: LAMPARA - 3, transform: 'translateZ(-24px)' }} />

                  {/* La lámpara: un disco colgado de su cable, como los del
                      garage de referencia y los del dibujo. Va acostado —es
                      una hoja horizontal— y por eso se ve como una elipse que
                      se abre o se cierra según desde dónde se mire. */}
                  <span className="garage-pieza garage-fija" style={{ left: -1, top: -TECHO + 1, width: 2, height: TECHO - LAMPARA - 4,
                    background: 'rgba(255,255,255,0.14)' }} />
                  <Luz espera={`${200 + i * 110}ms`} nivel={brillo} w={470} h={470} pinta={pintaDisco}
                    style={{ left: -235, top: -LAMPARA - 235, width: 470, height: 470, transform: 'rotateX(-90deg)' }} />
                  {/* Su resplandor, de frente a la cámara: el disco solo es
                      una raya de canto y no alcanza a decir "esto alumbra".
                      Va DETRÁS del disco: en su misma profundidad lo
                      atravesaba por la mitad. */}
                  <Luz espera={`${200 + i * 110}ms`} nivel={brillo * 0.9} w={260} h={100} pinta={pintaResplandor}
                    style={{ left: -260, top: -LAMPARA - 90, width: 520, height: 200, transform: 'translateZ(-250px)' }} />

                  {/* El reflejo: la misma foto volteada sobre la línea donde
                      pisan las llantas. Su caja empieza DEBAJO del piso. Va a
                      poca resolución a propósito: es lo que lo desenfoca. */}
                  {render && (
                    <Foto src={render} w={300} h={Math.round((300 * ALTO_AUTO * 0.5) / ANCHO_AUTO)} suelo={suelo} reflejo
                      className="garage-pieza garage-luz"
                      style={{ left: -ANCHO_AUTO / 2, top: 1, width: ANCHO_AUTO, height: ALTO_AUTO * 0.5,
                        transform: 'translateZ(6px)', opacity: e === 'atenuada' ? 0.1 : 0.8 }} />
                  )}

                  {/* La unidad. Su caja termina justo en la línea del piso
                      —lo de abajo es aire del PNG— para no cruzarlo. */}
                  <div className="garage-pieza" style={{ left: -ANCHO_AUTO / 2, top: -ALTO_AUTO * suelo, transform: 'translateZ(6px)' }}>
                    <div className="garage-llega" style={{ ...espera, animationDelay: `${320 + i * 110}ms` }}>
                    <button type="button" aria-label={`${u.nombre}. ${u.pie}`} aria-pressed={e === 'elegida'}
                      className="garage-auto relative block"
                      style={{ width: ANCHO_AUTO, height: ALTO_AUTO * suelo }}
                      onPointerEnter={(ev) => { if (ev.pointerType === 'mouse') setSobre(u.id); }}
                      onPointerLeave={() => setSobre((v) => (v === u.id ? null : v))}
                      onFocus={() => setSobre(u.id)} onBlur={() => setSobre((v) => (v === u.id ? null : v))}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (fueArrastre()) return;
                        onElegir(u.id === elegida ? null : u.id);
                      }}>
                      {/* Se levanta la imagen, no el botón. Si se moviera el
                          botón, con el cursor en su orilla se saldría de
                          debajo de él, bajaría, volvería a entrar… y la
                          unidad y su lámpara temblarían sin parar. El área
                          que escucha al cursor se queda quieta. */}
                      <span className="garage-sube absolute inset-0 block">
                        {render ? (
                          <Foto src={render} w={1200} h={Math.round(((1200 * ALTO_AUTO) / ANCHO_AUTO) * suelo)} suelo={suelo}
                            className="garage-luz absolute inset-0 h-full w-full"
                            style={{ opacity: e === 'atenuada' ? 0.2 : u.activa ? 1 : 0.5 }} />
                        ) : (
                          <span className="garage-luz absolute left-0 top-0 block"
                            style={{ width: ANCHO_AUTO, height: ALTO_AUTO, opacity: e === 'atenuada' ? 0.2 : 1 }}>
                            <Silueta />
                          </span>
                        )}
                      </span>
                      <span aria-hidden className="garage-foco pointer-events-none absolute inset-x-6 bottom-0 h-px bg-acento" />
                    </button>
                    </div>
                  </div>

                  {/* La placa, parada en el piso delante de la unidad como en
                      una colección. Va en el mundo y no en una capa encima:
                      así se queda con su unidad cuando la cámara se mueve. */}
                  <div className="garage-pieza garage-fija" style={{ left: -150, top: -66, width: 300, transform: 'translateZ(170px)' }}>
                    {/* La entrada va un nivel adentro: una animación de
                        `transform` en la misma caja le quitaría su
                        profundidad mientras dura y la placa nacería en la
                        fila para saltar luego a su sitio. */}
                    <div className="garage-llega" style={{ animationDelay: `${420 + i * 110}ms` }}>
                    <div className="garage-placa flex h-[64px] flex-col items-center justify-center rounded-xl
                      border border-white/[0.14] bg-black/55 text-center"
                      style={{
                        opacity: e === 'normal' ? 0.86 : e === 'sobre' ? 1 : 0,
                        transform: e === 'sobre' ? 'translate3d(0,-4px,0)' : 'none',
                      }}>
                      <span className="text-[22px] font-medium leading-none tracking-tight text-ink">{u.nombre}</span>
                      <span className="cifra mt-1.5 text-[15px] leading-none text-ink-mute">{u.pie}</span>
                    </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="garage-vineta" />

      {/* Cuando la fila no cabe, se recorre: flechas a los lados y puntos. */}
      {!cam.cabe && !elegida && n > 1 && (
        <>
          <Flecha lado="izq" apagada={foco <= 0} onClick={() => mover(-1)} />
          <Flecha lado="der" apagada={foco >= n - 1} onClick={() => mover(1)} />
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
            {unidades.map((u, i) => (
              <span key={u.id} className={`h-1 rounded-full transition-all duration-300 ${
                i === foco ? 'w-5 bg-acento' : 'w-1 bg-white/25'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Lienzos

   Casi todo lo que se ve en el garage es un `<canvas>` y no una caja con
   degradados, y la razón no es estética.

   Cada pieza de un mundo 3D es una textura en la tarjeta de video. A una caja
   normal el navegador le escoge la resolución según cómo se vea en pantalla,
   la parte en baldosas y la vuelve a dibujar cuando cambia de tamaño — que
   aquí es en cada cuadro, porque basta mover el cursor para que la mirada
   gire. Con el piso, el muro y el techo midiendo miles de píxeles, en una
   pantalla de doble densidad eso pasaba del presupuesto de memoria de video,
   y el navegador empezaba a tirar baldosas: camionetas a medias, lámparas sin
   disco, la madera cortada en rectángulos. Solo mientras algo se movía.

   Un lienzo no negocia. Mide lo que dice su `width` y su `height`, se pinta
   una vez y de ahí en adelante la tarjeta solo lo coloca. La escena entera
   cabe en unas decenas de megas en cualquier pantalla, y mover la cámara no
   le pide a nadie que dibuje nada.

   Para probar un cambio aquí: Chrome con `--force-gpu-mem-available-mb=128`.
   Con memoria de sobra el problema no aparece y todo parece estar bien.
   ══════════════════════════════════════════════════════════════════════════ */

type Pincel = (c: CanvasRenderingContext2D, w: number, h: number) => void;

/**
 * Un lienzo que se pinta una vez. `w` y `h` son sus píxeles de verdad; el
 * tamaño que ocupa en el mundo va en `style`, y casi siempre es mayor.
 *
 * Se vuelve a pintar cuando cambia `clave` —no `pinta`, que es una función
 * nueva en cada render— y otra vez cuando terminan de llegar las fuentes: el
 * número del piso se dibuja con la tipografía de la app, y si se pinta antes
 * de que cargue sale con la de reserva y así se queda.
 */
function Lienzo({ w, h, pinta, clave, className, style }: {
  w: number; h: number; pinta: Pincel; clave: string;
  className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pincel = useRef(pinta);
  pincel.current = pinta;

  useEffect(() => {
    let vivo = true;
    const pintar = () => {
      const c = ref.current?.getContext('2d');
      if (!c || !vivo) return;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, w, h);
      pincel.current(c, w, h);
    };
    pintar();
    document.fonts?.ready.then(pintar);
    return () => { vivo = false; };
  }, [w, h, clave]);

  return <canvas ref={ref} width={w} height={h} aria-hidden className={className} style={style} />;
}

/**
 * Una luz: un lienzo dentro de una caja.
 *
 * Son dos niveles porque la luz tiene dos opacidades que se multiplican: la
 * caja lleva el parpadeo de encendido al entrar, y el lienzo lleva qué tan
 * prendida está según su unidad. En una sola caja, la animación de entrada
 * pisaría el brillo.
 */
function Luz({ espera, nivel, w, h, pinta, style }: {
  espera: string; nivel: number; w: number; h: number; pinta: Pincel; style: React.CSSProperties;
}) {
  return (
    <div className="garage-pieza garage-enciende" style={{ ...style, '--espera': espera } as React.CSSProperties}>
      <Lienzo w={w} h={h} clave="luz" pinta={pinta} className="garage-luz block h-full w-full" style={{ opacity: nivel }} />
    </div>
  );
}

/** Las fotos ya pedidas, para que la unidad y su reflejo compartan una. */
const FOTOS = new Map<string, Promise<HTMLImageElement>>();
function pedirFoto(src: string): Promise<HTMLImageElement> {
  let p = FOTOS.get(src);
  if (!p) {
    p = new Promise((ok, mal) => {
      const img = new window.Image();
      img.decoding = 'async';
      img.onload = () => ok(img);
      img.onerror = mal;
      // El optimizador de Next la entrega a 1200 de ancho y en un formato
      // ligero; el PNG original pesa un mega por unidad.
      img.src = `/_next/image?url=${encodeURIComponent(src)}&w=1200&q=90`;
    });
    FOTOS.set(src, p);
  }
  return p;
}

/**
 * El render de una unidad, pintado en un lienzo.
 *
 * `h` recorta por abajo: el lienzo termina en la línea donde pisan las
 * llantas. Con `reflejo`, se pinta volteada sobre esa línea y desvanecida
 * hacia abajo.
 */
function Foto({ src, w, h, suelo, reflejo = false, className, style }: {
  src: string; w: number; h: number; suelo: number; reflejo?: boolean;
  className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let vivo = true;
    pedirFoto(src).then((img) => {
      const c = ref.current?.getContext('2d');
      if (!c || !vivo) return;
      const alto = (w * 787) / 1400;   // la foto entera, a este ancho
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, w, h);
      c.imageSmoothingQuality = 'high';
      if (!reflejo) { c.drawImage(img, 0, 0, w, alto); return; }
      c.save();
      c.scale(1, -1);
      c.drawImage(img, 0, -alto * suelo, w, alto);
      c.restore();
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.92, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }).catch(() => { /* sin foto no hay nada que pintar: queda el hueco */ });
    return () => { vivo = false; };
  }, [src, w, h, suelo, reflejo]);

  return <canvas ref={ref} width={w} height={h} aria-hidden className={className} style={style} />;
}

/* ── Los pinceles ── */

const pintaMuro: Pincel = (c, w, h) => {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#070708'); g.addColorStop(0.45, '#0d0d10');
  g.addColorStop(0.8, '#131316'); g.addColorStop(1, '#0b0b0d');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
};

function pintaPiso(c: CanvasRenderingContext2D, w: number, h: number, n: number, anchoMundo: number) {
  // Se pinta en medidas del mundo; la escala lo baja a los píxeles del lienzo.
  const k = w / anchoMundo;
  c.scale(k, k);
  const W = anchoMundo, H = HONDO;
  const x0 = W / 2, z0 = H / 2 - CENTRO_Z;          // el (0, 0) del mundo, en la hoja
  const xDe = (i: number) => (i - (n - 1) / 2) * BAHIA;

  const base = c.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, 'rgba(8,8,10,0.86)');
  base.addColorStop(1, 'rgba(19,19,23,0.74)');
  c.fillStyle = base;
  c.fillRect(0, 0, W, H);

  // Juntas del concreto.
  c.fillStyle = 'rgba(255,255,255,0.045)';
  for (let x = (x0 % 270); x < W; x += 270) c.fillRect(x, 0, 2, H);
  for (let y = (z0 % 260); y < H; y += 260) c.fillRect(0, y, W, 2);

  // Rayas entre cajones.
  for (let i = 0; i <= n; i++) {
    const x = x0 + xDe(i) - BAHIA / 2;
    const g = c.createLinearGradient(0, z0 - 260, 0, z0 + 340);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0.1)');
    c.fillStyle = g;
    c.fillRect(x - 1.5, z0 - 260, 3, 600);
  }

  for (let i = 0; i < n; i++) {
    const x = x0 + xDe(i);
    // La sombra de contacto: lo que pega la unidad al piso.
    c.save();
    c.translate(x, z0 + 7);
    c.scale(1, 170 / 430);
    const s = c.createRadialGradient(0, 0, 0, 0, 0, 215);
    s.addColorStop(0, 'rgba(0,0,0,0.9)'); s.addColorStop(0.55, 'rgba(0,0,0,0.55)'); s.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = s;
    c.fillRect(-215, -215, 430, 430);
    c.restore();
    // El número pintado en el piso.
    c.font = `700 150px ${getComputedStyle(c.canvas).fontFamily}`;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillStyle = 'rgba(255,255,255,0.055)';
    c.fillText(String(i + 1).padStart(2, '0'), x, z0 + 180);
  }

  // La orilla de enfrente se desvanece: el piso no se acaba, se pierde en lo
  // oscuro.
  const f = c.createLinearGradient(0, 0, 0, H);
  f.addColorStop(0, 'rgba(0,0,0,1)'); f.addColorStop(0.62, 'rgba(0,0,0,1)'); f.addColorStop(0.86, 'rgba(0,0,0,0.35)'); f.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = f;
  c.fillRect(0, 0, W, H);
}

const pintaTecho: Pincel = (c, w, h) => {
  c.fillStyle = '#070708';
  c.fillRect(0, 0, w, h);
  // Vigas. El lienzo va a un cuarto: 196 del mundo son 49 de aquí.
  for (let x = 0; x < w; x += 49) {
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x + 43, 0, 1, h);
    c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x + 44, 0, 5, h);
  }
  // Arriba de la hoja es lo más cercano a la cámara: se desvanece.
  const f = c.createLinearGradient(0, 0, 0, h);
  f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.3, 'rgba(0,0,0,1)'); f.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = f;
  c.fillRect(0, 0, w, h);
};

/** Un degradado redondo que llena el lienzo aunque no sea cuadrado. */
function ovalo(c: CanvasRenderingContext2D, w: number, h: number, paradas: [number, string][]) {
  c.save();
  c.translate(w / 2, h / 2);
  c.scale(w / 2, h / 2);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [p, color] of paradas) g.addColorStop(p, color);
  c.fillStyle = g;
  c.fillRect(-1, -1, 2, 2);
  c.restore();
}

const pintaCharco: Pincel = (c, w, h) =>
  ovalo(c, w, h, [[0, 'rgba(255,250,240,0.26)'], [0.55, 'rgba(255,250,240,0.07)'], [1, 'rgba(255,250,240,0)']]);

const pintaResplandor: Pincel = (c, w, h) =>
  ovalo(c, w, h, [[0, 'rgba(255,248,235,0.3)'], [0.55, 'rgba(255,248,235,0.08)'], [1, 'rgba(255,248,235,0)']]);

const pintaMadera: Pincel = (c, w, h) => {
  // Tablillas: a media resolución, 13 del mundo son 6.5 de aquí.
  for (let x = 0; x < w; x += 6.5) {
    c.fillStyle = 'rgba(204,126,62,0.62)'; c.fillRect(x, 0, 4.5, h);
    c.fillStyle = 'rgba(38,20,9,0.9)'; c.fillRect(x + 4.5, 0, 2, h);
  }
  // Solo se ve donde le pega la luz.
  c.globalCompositeOperation = 'destination-in';
  c.save();
  c.translate(w / 2, h * 0.42);
  c.scale(w * 0.62, h * 0.78);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0.18, 'rgba(0,0,0,1)'); g.addColorStop(0.74, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(-2, -2, 4, 4);
  c.restore();
};

const pintaHaz: Pincel = (c, w, h) => {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,250,240,0.22)'); g.addColorStop(0.5, 'rgba(255,250,240,0.06)'); g.addColorStop(0.97, 'rgba(255,250,240,0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(w * 0.31, 0); c.lineTo(w * 0.69, 0); c.lineTo(w, h); c.lineTo(0, h);
  c.closePath();
  c.fill();
};

/** El disco de la lámpara con su halo alrededor. El disco mide 250 de 470. */
const pintaDisco: Pincel = (c, w) => {
  const m = w / 2, r = (125 / 235) * m;
  const halo = c.createRadialGradient(m, m, r * 0.9, m, m, m);
  halo.addColorStop(0, 'rgba(255,248,235,0.4)'); halo.addColorStop(1, 'rgba(255,248,235,0)');
  c.fillStyle = halo;
  c.fillRect(0, 0, w, w);
  const d = c.createRadialGradient(m, m, 0, m, m, r);
  d.addColorStop(0, '#ffffff'); d.addColorStop(0.64, '#ffffff'); d.addColorStop(0.82, '#f3efe6'); d.addColorStop(1, 'rgba(243,239,230,0.55)');
  c.fillStyle = d;
  c.beginPath(); c.arc(m, m, r, 0, Math.PI * 2); c.fill();
};

function pintaAnillo(c: CanvasRenderingContext2D, w: number, color: string, rayas: boolean, radio = w / 2 - 2) {
  c.strokeStyle = color;
  c.lineWidth = 2;
  if (rayas) c.setLineDash([9, 7]);
  c.beginPath(); c.arc(w / 2, w / 2, radio, 0, Math.PI * 2); c.stroke();
  c.setLineDash([]);
}

function Flecha({ lado, apagada, onClick }: { lado: 'izq' | 'der'; apagada: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={apagada} aria-label={lado === 'izq' ? 'Unidad anterior' : 'Unidad siguiente'}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`vidrio-pastilla pulsable absolute top-[62%] z-10 flex h-10 w-10 items-center justify-center
        text-ink-soft transition-opacity disabled:opacity-0 ${lado === 'izq' ? 'left-3' : 'right-3'}`}>
      <span aria-hidden className="text-lg leading-none">{lado === 'izq' ? '‹' : '›'}</span>
    </button>
  );
}

/**
 * La unidad que todavía no tiene render: su contorno, en línea.
 *
 * No un hueco ni un "sin imagen": en un garage, un cajón vacío con el nombre
 * de una camioneta se lee como que no está. La silueta dice que sí está y que
 * lo que falta es su foto.
 */
function Silueta() {
  return (
    <svg viewBox="0 0 460 259" className="h-full w-full" aria-hidden>
      <g fill="rgba(20,160,143,0.06)" stroke="rgba(20,160,143,0.8)" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M44 204 V150 H206 L236 96 H330 L352 150 H420 V204 H376 A30 30 0 0 0 316 204 H150 A30 30 0 0 0 90 204 Z" />
        <circle cx="120" cy="208" r="26" />
        <circle cx="346" cy="208" r="26" />
        <path d="M250 150 L266 112 H322 L338 150 Z" fill="none" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
