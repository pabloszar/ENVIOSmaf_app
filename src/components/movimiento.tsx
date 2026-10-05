'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mxn } from '@/lib/pricing';

/* ══════════════════════════════════════════════════════════════════════════
   Movimiento

   Las piezas que animan por JavaScript, que son las pocas que CSS no puede:
   contar un número y medir dónde está algo. Todo lo demás —entradas,
   cascadas, pulsaciones— vive en `globals.css`, porque una transición que el
   compositor resuelve solo no tiene por qué pasar por React.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ¿Pidieron que nada se mueva?
 *
 * Se mide con `matchMedia` en un efecto y no al renderizar, para que el
 * servidor y el navegador pinten lo mismo la primera vez. Arranca en `false`
 * —moviéndose— y se corrige en el primer frame: al revés, todo el mundo vería
 * la versión quieta durante un instante.
 */
export function useSinMovimiento(): boolean {
  const [quieto, setQuieto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const leer = () => setQuieto(mq.matches);
    leer();
    mq.addEventListener('change', leer);
    return () => mq.removeEventListener('change', leer);
  }, []);
  return quieto;
}

/** Igual que la curva `--curva-entrada`: arranca rápido y frena largo. */
const frenar = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

const useIsomorfico = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Un número que llega contando.
 *
 * No es un adorno. Un total que aparece ya puesto es un dato; un total que
 * sube hasta su sitio es un dato que se está CALCULANDO, y esa diferencia es
 * la que hace que la pantalla se sienta un instrumento y no una tabla. Además
 * hace algo útil: la vista sigue el movimiento, así que el ojo aterriza en la
 * cifra sin buscarla.
 *
 * Cuando el valor cambia después —se registró un cobro y la utilidad se
 * movió— cuenta desde el anterior y no desde cero. Ver el número recorrer la
 * distancia ES la noticia: se entiende cuánto cambió sin leer dos cifras.
 *
 * El servidor pinta el valor final. Sin eso, la página llegaría con ceros a
 * quien no tenga JavaScript y el buscador indexaría un cero.
 */
/**
 * Cómo se escribe una cifra, por NOMBRE y no como función.
 *
 * `Cifra` corre en el navegador y casi siempre la pinta una pantalla de
 * servidor, y Next no deja pasar funciones de un lado al otro: `formato={mxn}`
 * tronaba el tablero entero. Un nombre sí viaja, y la función se busca aquí.
 */
const FORMATOS = {
  mxn,
  entero: (n: number) => Math.round(n).toLocaleString('es-MX'),
} as const;
export type Formato = keyof typeof FORMATOS;

export function Cifra({
  valor, formato = 'mxn', duracion = 560, className = '',
}: {
  valor: number;
  formato?: Formato;
  duracion?: number;
  className?: string;
}) {
  const quieto = useSinMovimiento();
  const [pintado, setPintado] = useState(valor);
  const desde = useRef(valor);
  // Primera vez se cuenta desde cero; después, desde donde estaba.
  const estrenando = useRef(true);

  useIsomorfico(() => {
    if (quieto) { setPintado(valor); desde.current = valor; estrenando.current = false; return; }

    const inicio = estrenando.current ? 0 : desde.current;
    if (inicio === valor) { setPintado(valor); estrenando.current = false; return; }

    const t0 = performance.now();
    let vivo = true;
    let ultimo = inicio;

    const paso = (ahora: number) => {
      if (!vivo) return;
      const avance = Math.min(1, (ahora - t0) / duracion);
      ultimo = inicio + (valor - inicio) * frenar(avance);
      setPintado(ultimo);
      if (avance < 1) { requestAnimationFrame(paso); return; }
      // El último frame se fija exacto: el redondeo de la curva puede dejar
      // 74280.9997, y un peso de menos en un total es un error, no un detalle.
      setPintado(valor);
      desde.current = valor;
      estrenando.current = false;
    };
    requestAnimationFrame(paso);

    return () => {
      vivo = false;
      /*
       * Se guarda DÓNDE SE QUEDÓ, no a dónde iba — y `estrenando` solo se
       * apaga al llegar, allá arriba.
       *
       * Esto no es quisquillosería. En desarrollo, React monta cada
       * componente dos veces a propósito para cachar efectos mal escritos:
       * corre el efecto, lo limpia y lo vuelve a correr. Si la limpieza
       * anotara el destino, la segunda pasada arrancaría ya en la meta y la
       * cifra no contaría NUNCA en desarrollo —y en producción sí—, que es la
       * peor clase de error: el que solo aparece donde no lo estás mirando.
       */
      desde.current = ultimo;
    };
  }, [valor, duracion, quieto]);

  /* `tabular-nums` no es opcional aquí: sin él, cada dígito que cambia tiene
     otro ancho y la cifra tiembla sesenta veces por segundo. */
  return <span className={`cifra ${className}`}>{FORMATOS[formato](pintado)}</span>;
}

/**
 * Una barra que se llena al llegar.
 *
 * Crece con `scaleX` desde el origen izquierdo y no animando el ancho: el
 * ancho obliga a recalcular la página en cada frame; la escala la resuelve el
 * compositor sin tocar nada más.
 */
export function Barra({ pct, className = '' }: { pct: number; className?: string }) {
  const quieto = useSinMovimiento();
  const [llena, setLlena] = useState(quieto);

  useEffect(() => {
    if (quieto) { setLlena(true); return; }
    // Un frame de margen: si se pinta ya llena, no hay transición que ver.
    const id = requestAnimationFrame(() => setLlena(true));
    return () => cancelAnimationFrame(id);
  }, [quieto]);

  return (
    <span
      className={`block h-full origin-left rounded-full ${className}`}
      style={{
        transform: `scaleX(${llena ? Math.min(1, Math.max(0, pct / 100)) : 0})`,
        transition: 'transform var(--t-lento) var(--curva-entrada)',
      }}
    />
  );
}
