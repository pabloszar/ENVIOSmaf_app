'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Sidebar de iconos. El activo es un círculo sólido claro, como en las
 * referencias: sobre negro, un relleno claro pesa más que cualquier borde.
 * El nombre aparece al pasar el cursor para no comerse ancho útil.
 */
const SECCIONES = [
  { href: '/', label: 'Rentabilidad', icono: <IconoGrafica /> },
  { href: '/rutas', label: 'Rutas y envíos', icono: <IconoRuta /> },
  { href: '/dinero', label: 'Dinero', icono: <IconoDinero /> },
  { href: '/flotilla', label: 'Flotilla', icono: <IconoCamion /> },
  { href: '/contactos', label: 'Contactos', icono: <IconoPersonas /> },
  { href: '/cotizador', label: 'Cotizador', icono: <IconoMapa /> },
];

export default function Navegacion() {
  const ruta = usePathname();
  const router = useRouter();

  async function salir() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col items-center
      border-r border-white/[0.06] bg-surface/60 py-4 backdrop-blur-xl">
      <Link href="/" aria-label="Envíos MAF"
        className="mb-6 flex h-9 w-9 items-center justify-center rounded-xl bg-acento
          text-sm font-bold text-surface-sunk">
        M
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-2">
        {SECCIONES.map((s) => {
          const activa = s.href === '/' ? ruta === '/' : ruta.startsWith(s.href);
          return (
            <Link key={s.href} href={s.href} aria-current={activa ? 'page' : undefined}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition ${
                activa
                  ? 'bg-ink text-surface-sunk'
                  : 'text-ink-mute hover:bg-white/[0.06] hover:text-ink'
              }`}>
              {s.icono}
              <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg
                border border-white/[0.08] bg-surface-raised px-2.5 py-1 text-xs text-ink opacity-0
                shadow-panel transition group-hover:opacity-100">
                {s.label}
              </span>
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
        <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg
          border border-white/[0.08] bg-surface-raised px-2.5 py-1 text-xs text-ink opacity-0
          shadow-panel transition group-hover:opacity-100">
          Configuración
        </span>
      </Link>

      <button onClick={salir} aria-label="Salir"
        className="group relative mt-2 flex h-10 w-10 items-center justify-center rounded-full
          text-ink-mute transition hover:bg-white/[0.06] hover:text-bad">
        <IconoSalir />
        <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg
          border border-white/[0.08] bg-surface-raised px-2.5 py-1 text-xs text-ink opacity-0
          shadow-panel transition group-hover:opacity-100">
          Salir
        </span>
      </button>
    </aside>
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
