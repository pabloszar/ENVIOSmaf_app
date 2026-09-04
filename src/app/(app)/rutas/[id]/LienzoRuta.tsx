'use client';

import { mxn, ORIGEN } from '@/lib/pricing';
import type { Envio } from '@/types';

/**
 * El fondo de una ruta que no tiene ni una misión ubicada.
 *
 * Son casi todas las viejas: los 60 registros del Excel y todo lo que se
 * capturó antes de que existiera el mapa. Ahí no hay coordenadas que dibujar,
 * y dibujarlas de todos modos sería lo peor que se puede hacer — buscar
 * "Toluca" daría un punto plausible y equivocado, y un dato inventado en el
 * mapa es peor que un hueco porque nadie vuelve a revisarlo.
 *
 * Así que esto NO es un mapa y no lo aparenta: son curvas de nivel abstractas
 * y el viaje contado como lo que sí se sabe con certeza —de dónde salió, en
 * qué orden entregó, cuánto cobró cada entrega y si volvió—. Alude al viaje
 * sin afirmar dónde ocurrió.
 */
export default function LienzoRuta({
  envios, roundtrip, onUbicar,
}: {
  envios: Envio[];
  roundtrip: boolean;
  /** Ubicar la primera misión sin punto. Sin esto el lienzo es de solo mirar. */
  onUbicar: (envio: Envio) => void;
}) {
  // Con más de seis eslabones la cadena se sale de cualquier pantalla. Se
  // recortan los de en medio y no los del final: el primero y el último son
  // los que dan la forma del viaje.
  const CABEN = 6;
  const recortadas = envios.length > CABEN;
  const visibles = recortadas
    ? [...envios.slice(0, CABEN - 1), ...envios.slice(-1)]
    : envios;
  const ocultas = envios.length - visibles.length;
  const primeraSinUbicar = envios.find((e) => e.lat == null || e.lng == null) ?? null;

  return (
    <div className="lienzo-topo absolute inset-0 overflow-hidden">
      <div className="flex h-full items-center justify-center px-6 py-10">
        <div className="w-full max-w-[24rem]">
          <Eslabon icono="⌂" titulo={ORIGEN.nombre} pie={ORIGEN.direccion} origen />

          {visibles.map((e, i) => (
            <div key={e.id}>
              <Hilo />
              {recortadas && i === visibles.length - 1 && (
                <>
                  <p className="py-1 text-center text-xs text-ink-mute">
                    y {ocultas} {ocultas === 1 ? 'misión más' : 'misiones más'}
                  </p>
                  <Hilo />
                </>
              )}
              <Eslabon
                icono={String(e.secuencia)}
                titulo={e.destino}
                pie={e.zona || null}
                monto={mxn(Number(e.precio))} />
            </div>
          ))}

          {roundtrip && envios.length > 0 && (
            <>
              <Hilo />
              <Eslabon icono="⌂" titulo="De regreso a la bodega" origen atenuado />
            </>
          )}

          {envios.length === 0 && (
            <>
              <Hilo />
              <p className="py-2 text-center text-sm leading-relaxed text-ink-mute">
                Esta ruta todavía no tiene misiones. Sin ellas no hay ingreso.
              </p>
            </>
          )}

          {primeraSinUbicar && (
            <p className="mt-7 text-center text-xs leading-relaxed text-ink-mute">
              Este viaje se capturó sin ubicaciones, así que no hay recorrido que trazar.
              <br />
              <button type="button" onClick={() => onUbicar(primeraSinUbicar)}
                className="mt-2.5 rounded-full border border-white/[0.12] bg-white/[0.05] px-3.5 py-1.5
                  text-xs text-ink-soft transition hover:border-brand hover:text-ink">
                Ubicar “{primeraSinUbicar.destino}” en el mapa
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Un eslabón de la cadena: el número, a dónde y cuánto dejó. */
function Eslabon({ icono, titulo, pie, monto, origen, atenuado }: {
  icono: string; titulo: string; pie?: string | null; monto?: string;
  origen?: boolean; atenuado?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3.5 ${atenuado ? 'opacity-50' : ''}`}>
      <span className={`cifra flex h-8 w-8 shrink-0 items-center justify-center rounded-full
        text-xs font-medium ${origen
          ? 'border-2 border-acento/60 bg-surface text-acento'
          : 'bg-brand/25 text-brand'}`}>
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{titulo}</span>
        {pie && <span className="block truncate text-xs text-ink-mute">{pie}</span>}
      </span>
      {monto && <span className="cifra shrink-0 text-sm text-ink-soft">{monto}</span>}
    </div>
  );
}

/** El tramo entre dos eslabones. Punteado: nadie sabe por dónde fue. */
function Hilo() {
  return <span aria-hidden className="ml-4 block h-6 w-px border-l border-dashed border-white/20" />;
}
