'use client';

import Image from 'next/image';
import { ilustracionCarga } from '@/lib/imagenes';
import type { TamanoCarga } from '@/types';

const TAMANOS: TamanoCarga[] = ['Chico', 'Mediano', 'Grande', 'Extra Grande'];

/**
 * Tamaño de la carga con dibujo: el volumen se reconoce antes de leer la
 * palabra, y evita el desplegable que obliga a abrir para saber qué hay.
 * Volver a tocar el activo lo deselecciona — no siempre se sabe el tamaño.
 */
export default function SelectorTamano({ valor, onCambio }: {
  valor: '' | TamanoCarga;
  onCambio: (t: '' | TamanoCarga) => void;
}) {
  return (
    <div>
      <span className="etiqueta">Tamaño de la carga</span>
      <div className="mt-1.5 grid grid-cols-4 gap-2">
        {TAMANOS.map((t) => {
          const activo = valor === t;
          return (
            <button key={t} type="button" onClick={() => onCambio(activo ? '' : t)}
              aria-pressed={activo}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] transition
                ${activo
                  ? 'border-acento/40 bg-acento/10 text-acento'
                  : 'border-white/[0.07] bg-white/[0.03] text-ink-mute hover:border-white/20 hover:text-ink'}`}>
              <Image src={ilustracionCarga(t)} alt="" width={36} height={36} aria-hidden
                className={activo ? 'opacity-100' : 'opacity-50'} />
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
