'use client';

import { useState } from 'react';

/** Campo de formulario con etiqueta. */
export function Campo({
  label, children, hint,
}: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="etiqueta">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-ink-mute">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-surface-line bg-surface px-3 py-2 text-sm ' +
  'outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Boton({
  children, variante = 'primario', className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'suave' | 'peligro' | 'fantasma';
}) {
  const estilos = {
    primario: 'bg-brand text-white hover:bg-brand/90',
    suave: 'bg-brand-soft text-brand hover:bg-brand-soft/70',
    peligro: 'bg-bad/10 text-bad hover:bg-bad/20',
    fantasma: 'text-ink-mute hover:bg-surface-sunk hover:text-ink',
  }[variante];
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${estilos} ${className}`}
    >
      {children}
    </button>
  );
}

export function Etiqueta({ children, tono = 'neutro' }: { children: React.ReactNode; tono?: 'neutro' | 'bueno' | 'aviso' | 'malo' | 'info' }) {
  const c = {
    neutro: 'bg-surface-sunk text-ink-soft',
    bueno: 'bg-good/10 text-good',
    aviso: 'bg-warn/10 text-warn',
    malo: 'bg-bad/10 text-bad',
    info: 'bg-brand-soft text-brand',
  }[tono];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

/** Panel deslizante lateral para formularios de crear/editar. */
export function Panel({
  abierto, onCerrar, titulo, children,
}: { abierto: boolean; onCerrar: () => void; titulo: string; children: React.ReactNode }) {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onCerrar} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-surface-line px-5 py-4">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <button onClick={onCerrar} className="text-ink-mute hover:text-ink" aria-label="Cerrar">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/** Muestra un mensaje de error de una acción, si lo hay. */
export function Aviso({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>;
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
