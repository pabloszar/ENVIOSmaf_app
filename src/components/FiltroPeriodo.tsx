'use client';

import { useState } from 'react';
import { Chip } from '@/components/ui';

/**
 * Filtro de periodo: los atajos de siempre y un rango a mano.
 *
 * Trabaja con fechas en texto `YYYY-MM-DD` porque así vienen de Postgres y así
 * se comparan sin zona horaria de por medio: convertirlas a Date para volver a
 * compararlas solo abre la puerta a que un viaje se corra un día.
 *
 * "Todo" no es un adorno. Con datos que empiezan en enero, un filtro que por
 * omisión recorta a este mes deja la pantalla en blanco y parece un error.
 */
export type Preset = 'mes' | '3m' | 'ano' | 'todo' | 'rango';

export interface Rango { desde: string | null; hasta: string | null }

const ATAJOS: { id: Preset; label: string }[] = [
  { id: 'mes', label: 'Este mes' },
  { id: '3m', label: '3 meses' },
  { id: 'ano', label: 'Este año' },
  { id: 'todo', label: 'Todo' },
];

/** Traduce un atajo a un rango concreto. `rango` usa lo que el usuario escribió. */
export function rangoDe(preset: Preset, manual: Rango): Rango {
  const hoy = new Date();
  // Se arma con las partes locales y no con toISOString: esa convierte a UTC y
  // "el 1 del mes" se volvería el 30 del anterior en cuanto el navegador esté
  // en un huso al este de Greenwich.
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  switch (preset) {
    case 'mes':
      return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: null };
    case '3m': {
      const d = new Date(hoy);
      d.setMonth(d.getMonth() - 3);
      return { desde: iso(d), hasta: null };
    }
    case 'ano':
      return { desde: `${hoy.getFullYear()}-01-01`, hasta: null };
    case 'rango':
      return manual;
    default:
      return { desde: null, hasta: null };
  }
}

/** ¿Cae la fecha dentro del rango? Los extremos van incluidos. */
export function dentro(fecha: string, r: Rango): boolean {
  if (r.desde && fecha < r.desde) return false;
  if (r.hasta && fecha > r.hasta) return false;
  return true;
}

export default function FiltroPeriodo({
  preset, rango, onCambio,
}: {
  preset: Preset;
  rango: Rango;
  onCambio: (preset: Preset, rango: Rango) => void;
}) {
  const [abierto, setAbierto] = useState(preset === 'rango');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {ATAJOS.map((a) => (
          <Chip key={a.id} activo={preset === a.id}
            onClick={() => { setAbierto(false); onCambio(a.id, rango); }}>
            {a.label}
          </Chip>
        ))}
        <Chip activo={preset === 'rango'}
          onClick={() => { setAbierto((v) => !v || preset !== 'rango'); onCambio('rango', rango); }}>
          Fechas…
        </Chip>
      </div>

      {abierto && (
        <div className="flex items-center gap-1.5 rounded-full border border-acento/30 bg-acento/[0.07] px-2.5 py-1">
          <input type="date" value={rango.desde ?? ''} aria-label="Desde"
            onChange={(e) => onCambio('rango', { ...rango, desde: e.target.value || null })}
            className="bg-transparent text-xs text-ink outline-none" />
          <span className="text-xs text-ink-mute">→</span>
          <input type="date" value={rango.hasta ?? ''} aria-label="Hasta"
            onChange={(e) => onCambio('rango', { ...rango, hasta: e.target.value || null })}
            className="bg-transparent text-xs text-ink outline-none" />
          {(rango.desde || rango.hasta) && (
            <button onClick={() => onCambio('rango', { desde: null, hasta: null })}
              className="pl-1 text-xs text-ink-mute transition hover:text-ink" aria-label="Limpiar fechas">✕</button>
          )}
        </div>
      )}
    </div>
  );
}
