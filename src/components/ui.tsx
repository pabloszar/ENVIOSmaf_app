'use client';

import { useEffect, useState } from 'react';

/** Campo de formulario con etiqueta. */
export function Campo({
  label, children, hint,
}: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="etiqueta">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1.5 block text-xs text-ink-mute">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl border border-surface-line bg-surface-raised px-3 py-2 text-sm text-ink ' +
  'outline-none transition placeholder:text-ink-mute focus:border-brand focus:ring-2 focus:ring-brand/25';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

/**
 * Botones. El primario es teal sólido con texto casi negro: sobre fondo oscuro
 * un relleno claro pesa más que cualquier borde. El lima NO se usa aquí — está
 * reservado para señalar lo activo.
 */
export function Boton({
  children, variante = 'primario', className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'suave' | 'peligro' | 'fantasma';
}) {
  const estilos = {
    primario: 'bg-brand text-surface-sunk hover:bg-brand/90',
    suave: 'border border-surface-line bg-surface-raised text-ink-soft hover:border-ink-mute hover:text-ink',
    peligro: 'bg-bad/12 text-bad hover:bg-bad/20',
    fantasma: 'text-ink-mute hover:bg-surface-raised hover:text-ink',
  }[variante];
  return (
    <button
      {...props}
      className={`rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${estilos} ${className}`}
    >
      {children}
    </button>
  );
}

/** Botón compacto para acciones dentro de una fila de tabla. */
export function BotonMini({
  className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full border border-surface-line bg-surface-raised px-3 py-1 text-xs
        font-medium text-ink-soft transition hover:border-brand hover:text-brand
        disabled:opacity-50 ${className}`}
    />
  );
}

/** Botón-píldora para filtros y atajos. Activo = lima. */
export function Chip({
  activo = false, className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { activo?: boolean }) {
  const estilo = activo
    ? 'border-acento/40 bg-acento/15 text-acento'
    : 'border-surface-line bg-surface-raised text-ink-soft hover:border-ink-mute hover:text-ink';
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${estilo} ${className}`}
    />
  );
}

/** Estado semántico. Lleva un punto para no depender solo del color. */
export function Etiqueta({
  children, tono = 'neutro',
}: { children: React.ReactNode; tono?: 'neutro' | 'bueno' | 'aviso' | 'malo' | 'info' | 'activo' }) {
  const c = {
    neutro: 'border-surface-line bg-surface-raised text-ink-soft',
    bueno: 'border-good/25 bg-good/10 text-good',
    aviso: 'border-warn/25 bg-warn/10 text-warn',
    malo: 'border-bad/25 bg-bad/10 text-bad',
    info: 'border-brand/30 bg-brand/10 text-brand',
    activo: 'border-acento/40 bg-acento/15 text-acento',
  }[tono];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${c}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

/**
 * Panel deslizante lateral. `ancho="inmersivo"` lo abre a dos tercios de
 * pantalla, para las vistas de detalle que llevan render e indicadores.
 */
export function Panel({
  abierto, onCerrar, titulo, children, ancho = 'normal',
}: {
  abierto: boolean; onCerrar: () => void; titulo: string;
  children: React.ReactNode; ancho?: 'normal' | 'inmersivo';
}) {
  if (!abierto) return null;
  const max = ancho === 'inmersivo' ? 'max-w-3xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCerrar} />
      <div className={`relative flex h-full w-full ${max} flex-col border-l border-white/[0.08] bg-surface shadow-panel`}>
        <div className="flex items-center justify-between border-b border-surface-line px-5 py-4">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <button onClick={onCerrar}
            className="rounded-full p-1 text-ink-mute transition hover:bg-surface-raised hover:text-ink"
            aria-label="Cerrar">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Ventana centrada. Para capturar algo corto sin perder de vista la pantalla
 * de atrás: aparece encima, se llena y se va.
 *
 * A diferencia del Panel lateral, no empuja la vista ni obliga a leer en una
 * columna angosta — un formulario de dos columnas cabe cómodo. Cierra con Esc
 * y con clic afuera, y bloquea el scroll del fondo mientras está abierta.
 *
 * Vive en z-1200 porque encima de un mapa a pantalla completa hay dos capas
 * más altas que cualquier otra de la app: los paneles de vidrio en 900 y los
 * controles de Leaflet en 1000. Una ventana modal por debajo de ellos sería
 * una ventana que no se puede usar.
 */
export function Modal({
  abierto, onCerrar, titulo, descripcion, children, ancho = 'normal',
}: {
  abierto: boolean; onCerrar: () => void; titulo: string; descripcion?: string;
  children: React.ReactNode; ancho?: 'chico' | 'normal' | 'ancho';
}) {
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alTeclear);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = previo;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;
  const max = { chico: 'max-w-md', normal: 'max-w-2xl', ancho: 'max-w-4xl' }[ancho];

  return (
    <div className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onCerrar} />
      <div role="dialog" aria-modal="true" aria-label={titulo}
        className={`relative my-auto w-full ${max} overflow-hidden rounded-2xl border border-white/[0.09]
          bg-surface/95 shadow-panel backdrop-blur-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-5">
          <div>
            <h2 className="text-lg font-medium tracking-tight">{titulo}</h2>
            {descripcion && <p className="mt-1 text-xs text-ink-mute">{descripcion}</p>}
          </div>
          {/* Sin autoFocus: el foco pertenece al primer campo del formulario,
              no al botón de cerrar. */}
          <button onClick={onCerrar}
            className="-mr-2 -mt-1 rounded-full p-2 text-ink-mute transition hover:bg-white/[0.06] hover:text-ink"
            aria-label="Cerrar">✕</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Fila de botones de un formulario en modal: la acción principal a la derecha,
 * donde termina la lectura y donde ya está el pulgar.
 */
export function AccionesModal({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-6 -mb-5 mt-6 flex items-center justify-end gap-2 border-t border-white/[0.06]
      bg-black/20 px-6 py-4">{children}</div>
  );
}

/**
 * Interruptor con su explicación al lado. Una casilla suelta obliga a adivinar
 * qué pasa al marcarla; aquí lo dice el propio control, y toda la tarjeta es
 * el área que se puede tocar.
 */
export function Interruptor({ activo, onCambio, titulo, detalle }: {
  activo: boolean; onCambio: (v: boolean) => void; titulo: string; detalle: string;
}) {
  return (
    <button type="button" onClick={() => onCambio(!activo)} aria-pressed={activo}
      className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition
        ${activo ? 'border-acento/40 bg-acento/[0.08]' : 'border-white/[0.07] bg-white/[0.03] hover:border-white/20'}`}>
      <span aria-hidden className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition
        ${activo ? 'bg-acento/80' : 'bg-white/[0.12]'}`}>
        <span className={`h-4 w-4 rounded-full bg-surface-sunk transition-transform
          ${activo ? 'translate-x-4' : ''}`} />
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${activo ? 'text-acento' : 'text-ink'}`}>{titulo}</span>
        <span className="block text-xs text-ink-mute">{detalle}</span>
      </span>
    </button>
  );
}

/** Sección numerada de un formulario: da orden de lectura sin explicarlo. */
export function Bloque({ titulo, paso, children }: {
  titulo: string; paso?: number; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2.5">
        {paso != null && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.07]
            text-[11px] font-medium text-ink-soft">{paso}</span>
        )}
        <h3 className="text-sm font-medium tracking-tight">{titulo}</h3>
        <span aria-hidden className="h-px flex-1 bg-white/[0.06]" />
      </div>
      {children}
    </section>
  );
}

/** Campo de dinero: el signo vive dentro, pegado a la cifra. */
export function CampoMonto({
  valor, onCambio, autoFocus, placeholder = '0',
}: {
  valor: string; onCambio: (v: string) => void; autoFocus?: boolean; placeholder?: string;
}) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-mute">$</span>
      <Input type="number" inputMode="decimal" placeholder={placeholder} value={valor} autoFocus={autoFocus}
        className="cifra !py-2.5 !pl-7 !text-base" onChange={(e) => onCambio(e.target.value)} />
    </div>
  );
}

/** Muestra un mensaje de error de una acción, si lo hay. */
export function Aviso({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="rounded-xl border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>
  );
}

/** Hook mínimo para acciones asíncronas con estado de carga y error. */
export function useAccion() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function correr(fn: () => Promise<void>) {
    setCargando(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setCargando(false);
    }
  }
  return { cargando, error, correr, setError };
}
