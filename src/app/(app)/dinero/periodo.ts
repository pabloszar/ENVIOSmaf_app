'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { rangoDe, type Preset, type Rango } from '@/components/FiltroPeriodo';
import { fechaCorta } from '@/lib/fechas';

/**
 * El periodo vive en la URL y no en un estado local.
 *
 * Ahora que Dinero son tres páginas, un estado local se perdería al pasar de
 * Entra a Sale y cada pantalla mostraría un mes distinto — el peor error
 * posible aquí, porque las cifras dejarían de cuadrar entre sí sin decir por
 * qué. En la dirección viaja con la navegación, sobrevive al botón de atrás y
 * se puede compartir tal cual.
 */
const PRESETS: Preset[] = ['mes', '3m', 'ano', 'todo', 'rango'];

export interface Periodo {
  preset: Preset;
  rango: Rango;
  /** El rango ya resuelto: los atajos convertidos a fechas concretas. */
  activo: Rango;
  etiqueta: string;
  hayFiltro: boolean;
  navegar: (p: Preset, r: Rango) => void;
}

export function usePeriodo(): Periodo {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();

  const crudo = params.get('p');
  const preset: Preset = PRESETS.includes(crudo as Preset) ? (crudo as Preset) : 'mes';
  const rango: Rango = { desde: params.get('d'), hasta: params.get('h') };
  const activo = rangoDe(preset, rango);

  function navegar(p: Preset, r: Rango) {
    const q = new URLSearchParams();
    if (p === 'rango') {
      // Un rango a medias no sirve para consultar: se espera a la otra punta.
      if (!r.desde || !r.hasta) return;
      q.set('p', 'rango'); q.set('d', r.desde); q.set('h', r.hasta);
    } else if (p !== 'mes') {
      q.set('p', p);
    }
    const cadena = q.toString();
    router.push(cadena ? `${ruta}?${cadena}` : ruta);
  }

  return {
    preset, rango, activo, navegar,
    etiqueta: etiquetaDe(preset, rango),
    hayFiltro: activo.desde != null || activo.hasta != null,
  };
}

/** El periodo en palabras, para poner en los encabezados. */
export function etiquetaDe(preset: Preset, rango: Rango): string {
  if (preset === 'rango') {
    if (!rango.desde && !rango.hasta) return 'todo';
    return `${rango.desde ? fechaCorta(rango.desde) : 'el inicio'} – ${rango.hasta ? fechaCorta(rango.hasta) : 'hoy'}`;
  }
  return { mes: 'este mes', '3m': 'últimos 3 meses', ano: 'este año', todo: 'todo el histórico' }[preset];
}

/** Enlaza a otra página de Dinero conservando el periodo elegido. */
export function conPeriodo(destino: string, params: URLSearchParams): string {
  const q = params.toString();
  return q ? `${destino}?${q}` : destino;
}
