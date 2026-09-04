'use client';

import { useState } from 'react';
import { Input } from '@/components/ui';
import type { Lugar } from '@/lib/geo';

/**
 * Buscar a dónde va el flete.
 *
 * Busca al dar Enter y no mientras se escribe. No es pereza: el servicio de
 * direcciones de OpenStreetMap admite una consulta por segundo y sus
 * condiciones prohíben el autocompletado, que dispararía una por tecla. A
 * cambio, tocar el mapa pone el pin donde uno quiera, que es lo que de verdad
 * hace falta cuando la entrega es "la bodega de atrás" y no tiene dirección.
 */
export default function BuscadorLugar({
  onElegir, ocupado,
}: {
  onElegir: (l: Lugar) => void;
  /** El mapa está resolviendo un pin puesto a mano. */
  ocupado?: boolean;
}) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Lugar[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    const consulta = q.trim();
    if (consulta.length < 3) { setError('Escribe al menos tres letras.'); return; }
    setBuscando(true);
    setError(null);
    try {
      const res = await fetch(`/api/geo/buscar?q=${encodeURIComponent(consulta)}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `Error ${res.status}`);
      const lugares = (json.data ?? []) as Lugar[];
      setResultados(lugares);
      if (lugares.length === 0) setError('No encontré ese lugar. Prueba con el municipio, o tócalo en el mapa.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar.');
      setResultados(null);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex gap-1.5">
        <Input value={q} autoFocus placeholder="Metepec centro, Av. Tecnológico 100…"
          className="!py-2 !text-sm"
          onChange={(e) => { setQ(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }} />
        <button type="button" onClick={buscar} disabled={buscando || q.trim().length < 3}
          className="shrink-0 rounded-xl border border-white/[0.09] bg-white/[0.05] px-3 text-xs
            font-medium text-ink-soft transition hover:border-white/25 hover:text-ink
            disabled:opacity-40">
          {buscando ? '…' : 'Buscar'}
        </button>
      </div>

      <p className="mt-1.5 text-[10px] leading-tight text-ink-mute">
        {ocupado ? 'Leyendo el punto del mapa…' : 'Enter para buscar, o toca el mapa para poner el pin.'}
      </p>

      {error && <p className="mt-1.5 text-[11px] leading-tight text-warn">{error}</p>}

      {/* Los resultados flotan encima en vez de empujar: el panel vive sobre un
          mapa y crecerle de golpe le taparía justo la zona que se está mirando. */}
      {resultados && resultados.length > 0 && (
        <ul className="vidrio absolute inset-x-0 top-full z-10 mt-1.5 max-h-64 divide-y
          divide-white/[0.06] overflow-y-auto">
          {resultados.map((l, i) => (
            <li key={`${l.lat}-${l.lng}-${i}`}>
              <button type="button"
                onClick={() => { onElegir(l); setResultados(null); setQ(''); }}
                className="w-full px-3 py-2 text-left transition hover:bg-white/[0.06]">
                <p className="truncate text-xs font-medium">{l.nombre}</p>
                <p className="truncate text-[10px] text-ink-mute">{l.descripcion}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
