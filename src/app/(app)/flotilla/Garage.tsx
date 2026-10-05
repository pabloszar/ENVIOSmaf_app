'use client';

import Image from 'next/image';
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
const FRENTE = 760;
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
      const s = limitar((ancho - 2 * 372) / ANCHO_AUTO, 0.95, 1.7);
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

  useEffect(() => () => cancelAnimationFrame(cuadro.current), []);

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
  const ANCHO_MUNDO = Math.max(n, 1) * BAHIA + 4400;
  const xDe = (i: number) => (i - (n - 1) / 2) * BAHIA;
  /** De coordenadas del mundo a las de la hoja del piso y a las del techo. */
  const enPiso = (x: number, z: number) => ({ left: x + ANCHO_MUNDO / 2, top: z - CENTRO_Z + HONDO / 2 });

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

            {/* ── Muro del fondo ── */}
            <div className="garage-pieza" style={{
              left: -ANCHO_MUNDO / 2, top: -TECHO, width: ANCHO_MUNDO, height: TECHO,
              transform: `translateZ(${FONDO}px)`,
              background: 'linear-gradient(to bottom, #070708, #0d0d10 45%, #131316 80%, #0b0b0d)',
            }}>
              {unidades.map((u, i) => (
                /* Paneles de madera detrás de cada cajón, encendidos por su
                   lámpara. Es lo único cálido de la escena y por eso es lo
                   que dice dónde hay una unidad aun con todo lo demás negro. */
                <div key={u.id} className="garage-pieza garage-enciende"
                  style={{ left: xDe(i) + ANCHO_MUNDO / 2 - 210, top: TECHO - 440, width: 420, height: 440,
                    '--espera': `${260 + i * 110}ms` } as React.CSSProperties}>
                  <div className="garage-luz h-full w-full" style={{
                    opacity: brilloDe(u) * 0.75,
                    background: 'repeating-linear-gradient(90deg, rgba(204,126,62,0.62) 0 9px, rgba(38,20,9,0.9) 9px 13px)',
                    WebkitMaskImage: 'radial-gradient(ellipse 62% 78% at 50% 42%, #000 18%, transparent 74%)',
                    maskImage: 'radial-gradient(ellipse 62% 78% at 50% 42%, #000 18%, transparent 74%)',
                  }} />
                </div>
              ))}
            </div>

            {/* ── Piso ──
                Va un poco translúcido a propósito: debajo de él está el
                reflejo de cada unidad, que es la unidad misma volteada. Con
                el piso opaco no se vería; así se ve como en un concreto
                pulido. Las juntas no son adorno: son las líneas que fugan
                al fondo y le dicen al ojo que esto tiene profundidad. */}
            <div className="garage-pieza" style={{
              left: -ANCHO_MUNDO / 2, top: -HONDO / 2, width: ANCHO_MUNDO, height: HONDO,
              transform: `translateZ(${CENTRO_Z}px) rotateX(90deg)`,
              background: [
                'repeating-linear-gradient(90deg, transparent 0 269px, rgba(255,255,255,0.04) 269px 270px)',
                'repeating-linear-gradient(0deg, transparent 0 259px, rgba(255,255,255,0.035) 259px 260px)',
                'linear-gradient(to bottom, rgba(8,8,10,0.86), rgba(19,19,23,0.74))',
              ].join(', '),
            }}>
              {unidades.map((u, i) => {
                const e = estadoDe(u);
                const c = enPiso(xDe(i), 0);
                return (
                  <div key={u.id}>
                    {/* El charco de luz. */}
                    <div className="garage-pieza garage-enciende"
                      style={{ left: c.left - 330, top: c.top - 300, width: 660, height: 600,
                        '--espera': `${200 + i * 110}ms` } as React.CSSProperties}>
                      <div className="garage-luz h-full w-full rounded-full" style={{
                        opacity: brilloDe(u),
                        background: 'radial-gradient(closest-side, rgba(255,250,240,0.26), rgba(255,250,240,0.07) 55%, transparent)',
                      }} />
                    </div>
                    {/* La sombra de contacto: lo que pega la unidad al piso. */}
                    <div className="garage-pieza rounded-full" style={{
                      left: c.left - 215, top: c.top - 78, width: 430, height: 170,
                      background: 'radial-gradient(closest-side, rgba(0,0,0,0.9), rgba(0,0,0,0.55) 55%, transparent)',
                    }} />
                    {/* El anillo del cajón. Lima solo en la elegida: el lima
                        marca lo activo y nada más, aquí también. */}
                    <div className="garage-pieza garage-luz rounded-full"
                      style={{ left: c.left - 262, top: c.top - 250, width: 524, height: 500,
                        border: `2px solid ${e === 'elegida' ? 'rgba(215,240,0,0.55)' : 'rgba(255,255,255,0.13)'}`,
                        opacity: e === 'atenuada' ? 0.15 : 1 }}>
                      {e === 'elegida' && (
                        <span className="garage-giro absolute -inset-[14px] rounded-full"
                          style={{ border: '2px dashed rgba(215,240,0,0.35)' }} />
                      )}
                    </div>
                    {/* El número pintado en el piso. */}
                    <span className="garage-pieza cifra text-center font-bold leading-none"
                      style={{ ...enPiso(xDe(i) - 140, 250), width: 280, fontSize: 150,
                        color: `rgba(255,255,255,${e === 'atenuada' ? 0.02 : 0.055})` }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                );
              })}
              {/* Las rayas entre cajones. */}
              {Array.from({ length: n + 1 }, (_, i) => (
                <span key={i} className="garage-pieza"
                  style={{ ...enPiso(xDe(i) - BAHIA / 2 - 1.5, -260), width: 3, height: 600,
                    background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.1) 30%, rgba(255,255,255,0.1))' }} />
              ))}
            </div>

            {/* ── Techo ── */}
            <div className="garage-pieza" style={{
              left: -ANCHO_MUNDO / 2, top: -TECHO - HONDO / 2, width: ANCHO_MUNDO, height: HONDO,
              transform: `translateZ(${CENTRO_Z}px) rotateX(-90deg)`,
              background: [
                'repeating-linear-gradient(90deg, transparent 0 176px, rgba(255,255,255,0.05) 176px 178px, rgba(0,0,0,0.7) 178px 196px)',
                'repeating-linear-gradient(0deg, transparent 0 338px, rgba(255,255,255,0.035) 338px 340px)',
                'linear-gradient(#070708, #070708)',
              ].join(', '),
            }}>
            </div>

            {/* ── Columnas ──
                Están a medio camino entre la fila y el muro, y eso es todo
                su trabajo: al deslizar la cámara se mueven a otra velocidad
                que lo de adelante y lo de atrás. */}
            {Array.from({ length: n + 1 }, (_, i) => (
              <div key={i} className="garage-pieza" style={{
                left: xDe(i) - BAHIA / 2 - 22, top: -TECHO, width: 44, height: TECHO,
                transform: 'translateZ(-330px)',
                background: 'linear-gradient(90deg, #19191d, #0c0c0e 55%, #151518)',
                boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.05)',
              }} />
            ))}

            {/* ── Las unidades ── */}
            {unidades.map((u, i) => {
              const e = estadoDe(u);
              const render = renderUnidad(u.nombre);
              const suelo = sueloUnidad(render ? u.nombre : null);
              const arriba = -ALTO_AUTO * suelo;
              const espera = { '--espera': `${200 + i * 110}ms` } as React.CSSProperties;
              return (
                <div key={u.id} className="garage-pieza" style={{ transform: `translate3d(${xDe(i)}px, 0, 0)`, transformStyle: 'preserve-3d' }}>
                  {/* El haz. Detrás de la unidad, del disco al piso. */}
                  <div className="garage-pieza garage-enciende"
                    style={{ left: -330, top: -LAMPARA, width: 660, height: LAMPARA, transform: 'translateZ(-24px)', ...espera }}>
                    <div className="garage-luz h-full w-full" style={{
                      opacity: brilloDe(u),
                      clipPath: 'polygon(31% 0, 69% 0, 100% 100%, 0 100%)',
                      background: 'linear-gradient(to bottom, rgba(255,250,240,0.22), rgba(255,250,240,0.06) 50%, transparent 97%)',
                    }} />
                  </div>

                  {/* La lámpara: un disco colgado de su cable, como los del
                      garage de referencia y los del dibujo. Va acostado —es
                      una hoja horizontal— y por eso se ve como una elipse que
                      se abre o se cierra según desde dónde se mire. */}
                  <span className="garage-pieza" style={{ left: -1, top: -TECHO, width: 2, height: TECHO - LAMPARA,
                    background: 'rgba(255,255,255,0.14)' }} />
                  <div className="garage-pieza garage-enciende"
                    style={{ left: -125, top: -LAMPARA - 125, width: 250, height: 250, transform: 'rotateX(-90deg)', ...espera }}>
                    <div className="garage-luz h-full w-full rounded-full" style={{
                      opacity: brilloDe(u),
                      background: 'radial-gradient(closest-side, #ffffff 64%, #f3efe6 82%, rgba(243,239,230,0.55))',
                      boxShadow: '0 0 70px 26px rgba(255,248,235,0.36)',
                    }} />
                  </div>
                  {/* Su resplandor, de frente a la cámara: el disco solo es
                      una raya de canto y no alcanza a decir "esto alumbra". */}
                  <div className="garage-pieza garage-enciende"
                    style={{ left: -260, top: -LAMPARA - 90, width: 520, height: 200, ...espera }}>
                    <div className="garage-luz h-full w-full" style={{
                      opacity: brilloDe(u) * 0.9,
                      background: 'radial-gradient(closest-side, rgba(255,248,235,0.3), rgba(255,248,235,0.08) 55%, transparent)',
                    }} />
                  </div>

                  {/* El reflejo: la misma imagen volteada sobre la línea
                      donde pisan las llantas, debajo del piso. */}
                  {render && (
                    <div aria-hidden className="garage-pieza garage-luz"
                      style={{ left: -ANCHO_AUTO / 2, top: arriba + 2, width: ANCHO_AUTO, height: ALTO_AUTO,
                        transformOrigin: `50% ${suelo * 100}%`, transform: 'scaleY(-1)',
                        opacity: e === 'atenuada' ? 0.1 : 0.85, filter: 'blur(1.2px)',
                        WebkitMaskImage: `linear-gradient(to bottom, transparent ${(suelo - 0.42) * 100}%, #000 ${suelo * 100}%)`,
                        maskImage: `linear-gradient(to bottom, transparent ${(suelo - 0.42) * 100}%, #000 ${suelo * 100}%)` }}>
                      <Image src={render} alt="" fill sizes="460px" className="object-contain" />
                    </div>
                  )}

                  <div className="garage-pieza garage-llega" style={{ left: -ANCHO_AUTO / 2, top: arriba, ...espera,
                    animationDelay: `${320 + i * 110}ms` }}>
                    <button type="button" aria-label={`${u.nombre}. ${u.pie}`} aria-pressed={e === 'elegida'}
                      className="garage-auto relative block"
                      style={{ width: ANCHO_AUTO, height: ALTO_AUTO, opacity: e === 'atenuada' ? 0.2 : u.activa ? 1 : 0.5 }}
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
                          <Image src={render} alt="" fill priority={i < 4} draggable={false}
                            sizes="(min-width: 1024px) 800px, 460px" className="object-contain" />
                        ) : (
                          <Silueta />
                        )}
                      </span>
                      <span aria-hidden className="garage-foco pointer-events-none absolute inset-x-6 -bottom-1 h-px bg-acento" />
                    </button>
                  </div>

                  {/* La placa, parada en el piso delante de la unidad como en
                      una colección. Va en el mundo y no en una capa encima:
                      así se queda con su unidad cuando la cámara se mueve. */}
                  <div className="garage-pieza" style={{ left: -150, top: -66, width: 300, transform: 'translateZ(170px)' }}>
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
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 10px 30px rgba(0,0,0,0.6)',
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
