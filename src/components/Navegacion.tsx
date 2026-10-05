'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

/**
 * La navegación, en sus dos formas.
 *
 * En escritorio es la columna de iconos de siempre, pegada a la izquierda: hay
 * ancho de sobra y el borde de la pantalla es el sitio muerto, el que no le
 * quita nada al contenido.
 *
 * En un teléfono ese mismo carril se come 64 px de los 375 que hay —un sexto
 * del ancho— y encima queda lejos del pulgar. Ahí baja al pie, que es donde la
 * mano ya está. Es la barra de siempre de una app de teléfono, y no hace falta
 * explicarla.
 *
 * Las dos salen del mismo `SECCIONES`. Duplicar la lista sería garantizar que
 * un día la app tenga una pantalla a la que solo se llega desde el escritorio.
 */
const SECCIONES = [
  { href: '/', label: 'Rentabilidad', corto: 'Resumen', icono: <IconoGrafica /> },
  { href: '/rutas', label: 'Rutas y envíos', corto: 'Rutas', icono: <IconoRuta /> },
  { href: '/dinero', label: 'Dinero', corto: 'Dinero', icono: <IconoDinero /> },
  { href: '/flotilla', label: 'Flotilla', corto: 'Flotilla', icono: <IconoCamion /> },
  { href: '/contactos', label: 'Contactos', corto: 'Gente', icono: <IconoPersonas /> },
  { href: '/cotizador', label: 'Cotizador', corto: 'Cotizar', icono: <IconoMapa /> },
];

/** Si la sección de la barra es la que se está viendo. */
function esActiva(href: string, ruta: string) {
  return href === '/' ? ruta === '/' : ruta.startsWith(href);
}

/** Cerrar la sesión. Lo usan el carril y el menú del teléfono. */
function useSalir() {
  const router = useRouter();
  return async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };
}

export default function Navegacion() {
  return (
    <>
      <Carril />
      <BarraInferior />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Escritorio
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El carril de iconos. El activo es un círculo sólido claro: sobre negro, un
 * relleno claro pesa más que cualquier borde. El nombre aparece al pasar el
 * cursor para no comerse ancho útil.
 */
function Carril() {
  const ruta = usePathname();
  const salir = useSalir();
  const { caja, marca } = useMarcaDeslizante(ruta);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col items-center
      border-r border-white/[0.06] bg-surface/60 py-4 backdrop-blur-xl md:flex">
      <Link href="/" aria-label="Envíos MAF"
        className="pulsable mb-6 flex h-9 w-9 items-center justify-center rounded-xl bg-acento
          text-sm font-bold text-surface-sunk">
        M
      </Link>

      <nav ref={caja} className="relative flex flex-1 flex-col items-center gap-2">
        {/*
          La pastilla del activo es UNA, y viaja.
          Seis pastillas que se prenden y apagan dicen "otra cosa está
          seleccionada". Una que se desliza dice "es la misma cosa, que se
          movió" — y de paso el ojo la sigue y aprende dónde quedó, que es
          continuidad de Gestalt hecha con tiempo en vez de con una línea.
        */}
        <span aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-10 w-10 -translate-x-1/2
            rounded-full bg-ink"
          style={{
            transform: `translate3d(-50%, ${marca.y}px, 0)`,
            opacity: marca.visible ? 1 : 0,
            transition: marca.estrenando
              ? 'opacity var(--t-medio) var(--curva-entrada)'
              : 'transform var(--t-medio) var(--curva-mando), opacity var(--t-rapido) linear',
          }} />

        {SECCIONES.map((s) => {
          const activa = esActiva(s.href, ruta);
          return (
            <Link key={s.href} href={s.href} data-activa={activa || undefined}
              aria-current={activa ? 'page' : undefined}
              className={`group relative z-10 flex h-10 w-10 items-center justify-center
                rounded-full transition-colors duration-200 ${
                activa
                  ? 'text-surface-sunk'
                  : 'text-ink-mute hover:bg-white/[0.06] hover:text-ink'
              }`}>
              {/* El icono se encoge un pelo al tocarlo. El contenedor no se
                  toca: mover la caja movería la pastilla que va debajo. */}
              <span className="transition-transform duration-[200ms] group-active:scale-90"
                style={{ transitionTimingFunction: 'var(--curva-mando)' }}>
                {s.icono}
              </span>
              <Globito>{s.label}</Globito>
            </Link>
          );
        })}
      </nav>

      <Link href="/configuracion" aria-label="Configuración"
        className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition ${
          ruta.startsWith('/configuracion')
            ? 'bg-ink text-surface-sunk'
            : 'text-ink-mute hover:bg-white/[0.06] hover:text-ink'
        }`}>
        <IconoEngrane />
        <Globito>Configuración</Globito>
      </Link>

      <button onClick={salir} aria-label="Salir"
        className="group relative mt-2 flex h-10 w-10 items-center justify-center rounded-full
          text-ink-mute transition hover:bg-white/[0.06] hover:text-bad">
        <IconoSalir />
        <Globito>Salir</Globito>
      </button>
    </aside>
  );
}

/** El nombre de un icono del carril, al pasar el cursor. */
function Globito({ children }: { children: React.ReactNode }) {
  /* Entra deslizándose desde el icono y no apareciendo en su sitio: así se lee
     como algo que SALE de ahí, y no como una etiqueta que estaba escondida. */
  return (
    <span className="pointer-events-none absolute left-full ml-3 origin-left -translate-x-1.5
      scale-95 whitespace-nowrap rounded-lg border border-white/[0.08] bg-surface-raised
      px-2.5 py-1 text-xs text-ink opacity-0 shadow-panel
      transition-all duration-[200ms] group-hover:translate-x-0 group-hover:scale-100
      group-hover:opacity-100"
      style={{ transitionTimingFunction: 'var(--curva-entrada)' }}>
      {children}
    </span>
  );
}

/**
 * Dónde tiene que estar la pastilla del activo.
 *
 * Se MIDE en vez de calcularse con el alto por el índice. La cuenta
 * funcionaría hoy y se rompería el día que alguien cambie un `gap` o meta un
 * separador, y se rompería en silencio: la pastilla quedaría media pulgada
 * arriba del icono y nadie sabría por qué.
 *
 * `estrenando` evita el deslizamiento de la primera vez. Sin eso, al cargar
 * cualquier pantalla la pastilla saldría volando desde arriba hasta su sitio,
 * que es llamar la atención sobre la navegación cuando lo que hay que mirar
 * es el contenido.
 */
function useMarcaDeslizante(ruta: string) {
  const caja = useRef<HTMLElement>(null);
  const [marca, setMarca] = useState({ y: 0, visible: false, estrenando: true });

  useLayoutEffect(() => {
    const cont = caja.current;
    const activa = cont?.querySelector<HTMLElement>('[data-activa]');
    if (!cont || !activa) {
      setMarca((m) => ({ ...m, visible: false }));
      return;
    }
    // `offsetTop` ya es relativo al contenedor: es `position: relative`.
    setMarca((m) => ({
      y: activa.offsetTop,
      visible: true,
      // Deja de estrenar en cuanto ya se pintó una vez con la pastilla puesta.
      estrenando: m.visible ? false : m.estrenando,
    }));
  }, [ruta]);

  // El segundo render apaga el estreno, para que el SIGUIENTE cambio de
  // sección sí se deslice.
  useEffect(() => {
    if (!marca.visible || !marca.estrenando) return;
    const id = requestAnimationFrame(() => setMarca((m) => ({ ...m, estrenando: false })));
    return () => cancelAnimationFrame(id);
  }, [marca.visible, marca.estrenando]);

  return { caja, marca };
}

/* ══════════════════════════════════════════════════════════════════════════
   Teléfono
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * La barra del pie.
 *
 * Lleva nombre debajo de cada icono, aunque el carril de escritorio no lo
 * necesite. Ahí el nombre sale al pasar el cursor; en una pantalla táctil no
 * existe "pasar por encima", así que sin la palabra el icono no se explica
 * nunca —y un camión, una tarjeta y un mapa no dicen solos "flotilla",
 * "dinero" y "cotizador"—.
 *
 * El alto lo declara `--barra-movil`, que es lo que el cascarón se aparta por
 * abajo. Si se cambia aquí, se cambia allá: la barra flota, no empuja.
 */
function BarraInferior() {
  const ruta = usePathname();

  return (
    <nav aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-[1100] border-t border-white/[0.07]
        bg-surface/85 backdrop-blur-2xl backdrop-saturate-150 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="flex items-stretch">
        {SECCIONES.map((s) => {
          const activa = esActiva(s.href, ruta);
          return (
            <li key={s.href} className="flex-1">
              <Link href={s.href} aria-current={activa ? 'page' : undefined}
                className="flex flex-col items-center gap-1 py-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                  activa ? 'bg-ink text-surface-sunk' : 'text-ink-mute'}`}>
                  {s.icono}
                </span>
                <span className={`text-[10px] leading-none ${activa ? 'text-ink' : 'text-ink-mute'}`}>
                  {s.corto}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * La M de arriba, que en el teléfono abre el menú.
 *
 * Al pie van las seis secciones que se visitan a diario; aquí quedan las dos
 * que no —ajustar el negocio y salir—. Meterlas también abajo habría dejado
 * ocho columnas de 47 px, y las dos que menos se tocan compitiendo por el
 * pulgar con las que sí.
 *
 * Sigue siendo la marca y no tres rayas: es lo que ya estaba arriba, y
 * cambiarla por un icono genérico se llevaría por delante lo único que
 * identifica la app en la pantalla.
 */
export function MenuMovil() {
  const [abierto, setAbierto] = useState(false);
  // El portal necesita el `body`, que en el servidor no existe.
  const [montado, setMontado] = useState(false);
  const ruta = usePathname();
  const salir = useSalir();

  useEffect(() => { setMontado(true); }, []);

  // Cambiar de pantalla cierra el menú. Sin esto se queda abierto encima de la
  // pantalla nueva, tapándola.
  useEffect(() => { setAbierto(false); }, [ruta]);

  // Escape cierra, como cualquier otra ventana de la app.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  return (
    <>
      <button type="button" onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto} aria-haspopup="menu" aria-label="Menú"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-acento
          text-sm font-bold text-surface-sunk md:hidden">
        M
      </button>

      {/*
        * Al `body` y no aquí mismo.
        *
        * El botón vive dentro de la cabecera, que es `sticky z-30` y lleva su
        * propio desenfoque. Las dos cosas encierran a sus hijos: el z-1110 del
        * menú no puede pasar del 30 de la cabecera, así que el velo no cubría
        * la página; y un `backdrop-filter` dentro de otro solo alcanza a ver
        * el fondo de su padre, así que el vidrio salía transparente sobre un
        * texto nítido. Sacándolo del árbol, las dos cosas se arreglan solas.
        */}
      {abierto && montado && createPortal(
        <>
          {/* El velo va por debajo del menú y por encima de todo lo demás,
              incluidos los paneles que flotan sobre el mapa (900). Un toque
              fuera cierra: en un teléfono es el gesto que se intenta primero. */}
          <div className="fixed inset-0 z-[1100] bg-black/55 md:hidden"
            onClick={() => setAbierto(false)} />
          <div role="menu"
            className="vidrio fixed left-3 top-[3.75rem] z-[1110] w-56 overflow-hidden p-1.5 md:hidden">
            <p className="px-2.5 pb-1.5 pt-1 text-[11px] text-ink-mute">Envíos MAF</p>
            <Link href="/configuracion" role="menuitem"
              className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm transition ${
                ruta.startsWith('/configuracion')
                  ? 'bg-white/[0.08] text-ink'
                  : 'text-ink-soft hover:bg-white/[0.05]'}`}>
              <IconoEngrane />
              Configuración
            </Link>
            <button type="button" role="menuitem" onClick={salir}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm
                text-ink-soft transition hover:bg-white/[0.05] hover:text-bad">
              <IconoSalir />
              Salir
            </button>
          </div>
        </>,
        document.body)}
    </>
  );
}

/* Iconos de línea, 20px, trazo 1.5 — el peso que usan las referencias. */
const svg = {
  width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const, 'aria-hidden': true,
};

function IconoGrafica() {
  return <svg {...svg}><path d="M3 20h18M7 16V9M12 16V4M17 16v-5" /></svg>;
}
function IconoRuta() {
  return <svg {...svg}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" />
    <path d="M8.5 6H14a3 3 0 010 6h-4a3 3 0 000 6h5.5" /></svg>;
}
function IconoDinero() {
  return <svg {...svg}><rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.5" /></svg>;
}
function IconoCamion() {
  return <svg {...svg}><path d="M2.5 16V7a1 1 0 011-1h9.5v10M13 10h4l4 3.5V16" />
    <circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></svg>;
}
function IconoPersonas() {
  return <svg {...svg}><circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0111 0M16 5.5a3 3 0 010 5.8M17.5 19a5.4 5.4 0 00-2-4.2" /></svg>;
}
function IconoMapa() {
  return <svg {...svg}><path d="M9 4.5L3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8z" />
    <path d="M9 4.5v12.7M15 6.8v12.7" /></svg>;
}
function IconoEngrane() {
  return <svg {...svg}><circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.5 1.5M6.8 17.2l-1.5 1.5M18.7 18.7l-1.5-1.5M6.8 6.8L5.3 5.3" /></svg>;
}
function IconoSalir() {
  return <svg {...svg}><path d="M15 4.5h3a2 2 0 012 2v11a2 2 0 01-2 2h-3M10 8l-4 4 4 4M6 12h9" /></svg>;
}
