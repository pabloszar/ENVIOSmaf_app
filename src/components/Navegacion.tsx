'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const SECCIONES = [
  { href: '/', label: 'Rentabilidad' },
  { href: '/rutas', label: 'Rutas y envíos' },
  { href: '/dinero', label: 'Dinero' },
  { href: '/flotilla', label: 'Flotilla' },
  { href: '/contactos', label: 'Contactos' },
  { href: '/cotizador', label: 'Cotizador' },
  { href: '/configuracion', label: 'Configuración' },
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
    <header className="border-b border-surface-line bg-surface">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6">
        <Link href="/" className="py-4 text-sm font-semibold tracking-tight">
          Envíos MAF
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {SECCIONES.map((s) => {
            const activa = s.href === '/' ? ruta === '/' : ruta.startsWith(s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={activa ? 'page' : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-4 text-sm transition ${
                  activa
                    ? 'border-brand font-medium text-brand'
                    : 'border-transparent text-ink-mute hover:text-ink'
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>

        <button onClick={salir} className="text-sm text-ink-mute transition hover:text-ink">
          Salir
        </button>
      </div>
    </header>
  );
}
