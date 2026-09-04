'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Boton, Aviso, Modal, AccionesModal } from '@/components/ui';
import BuscadorLugar from '@/app/(app)/cotizador/BuscadorLugar';
import type { Lugar } from '@/lib/geo';

const Mapa = dynamic(() => import('@/components/Mapa'), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-full animate-pulse rounded-xl border border-white/[0.08] bg-surface-sunk" />
  ),
});

/**
 * Ponerle ubicación a una misión.
 *
 * Sirve para las misiones viejas —las que se capturaron cuando el destino era
 * solo un texto— y para corregir una mal ubicada. Nada se ubica solo: buscar
 * "Bodega" o "Sucursal" habría dado coordenadas plausibles y equivocadas, y un
 * dato inventado en el mapa es peor que un hueco, porque nadie vuelve a
 * revisarlo.
 */
export default function ModalUbicar({
  abierto, onCerrar, destino, inicial, onGuardar, cargando, error,
}: {
  abierto: boolean;
  onCerrar: () => void;
  destino: string;
  /** Dónde estaba, si ya tenía ubicación. */
  inicial?: { lat: number; lng: number } | null;
  onGuardar: (l: Lugar) => void;
  cargando: boolean;
  error: string | null;
}) {
  if (!abierto) return null;
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Ubicar la misión" ancho="ancho"
      descripcion={destino}>
      <Cuerpo destino={destino} inicial={inicial} onGuardar={onGuardar}
        onCerrar={onCerrar} cargando={cargando} error={error} />
    </Modal>
  );
}

function Cuerpo({
  destino, inicial, onGuardar, onCerrar, cargando, error,
}: {
  destino: string;
  inicial?: { lat: number; lng: number } | null;
  onGuardar: (l: Lugar) => void;
  onCerrar: () => void;
  cargando: boolean;
  error: string | null;
}) {
  const [elegido, setElegido] = useState<Lugar | null>(
    inicial ? { nombre: destino, descripcion: 'Ubicación actual', zona: '', ...inicial } : null);
  const [leyendo, setLeyendo] = useState(false);

  async function ponerPin(lat: number, lng: number) {
    setLeyendo(true);
    try {
      const res = await fetch(`/api/geo/buscar?lat=${lat}&lng=${lng}`);
      const json = await res.json();
      const l = (json.data ?? [])[0] as Lugar | undefined;
      // Aunque el servicio no sepa qué hay ahí, la coordenada ya sirve: es el
      // dato que hace falta para el recorrido.
      setElegido(l ?? { nombre: destino, descripcion: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        zona: '', lat, lng });
    } catch {
      setElegido({ nombre: destino, descripcion: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        zona: '', lat, lng });
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <div className="space-y-4">
      <BuscadorLugar onElegir={setElegido} ocupado={leyendo} />

      <div className="h-[320px] overflow-hidden rounded-xl border border-white/[0.08]">
        <Mapa alto="100%" onClic={ponerPin}
          paradas={elegido ? [{ lat: elegido.lat, lng: elegido.lng, etiqueta: '📍' }] : []} />
      </div>

      {elegido ? (
        <div className="rounded-xl border border-brand/25 bg-brand/[0.06] px-3.5 py-2.5">
          <p className="text-sm font-medium">{elegido.nombre}</p>
          <p className="mt-0.5 text-xs text-ink-mute">
            {elegido.descripcion || `${elegido.lat.toFixed(5)}, ${elegido.lng.toFixed(5)}`}
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-mute">
          Busca la dirección o toca el mapa donde se entregó.
        </p>
      )}

      <Aviso error={error} />

      <AccionesModal>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={cargando || !elegido} onClick={() => elegido && onGuardar(elegido)}>
          {cargando ? 'Guardando…' : 'Guardar ubicación'}
        </Boton>
      </AccionesModal>
    </div>
  );
}
