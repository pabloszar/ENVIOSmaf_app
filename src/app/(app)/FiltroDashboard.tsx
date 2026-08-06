'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import FiltroPeriodo, { type Preset, type Rango } from '@/components/FiltroPeriodo';

/**
 * El filtro del tablero. Va a la URL y no a un estado local porque el tablero
 * se arma en el servidor: cambiar el periodo es pedir otros datos, no esconder
 * los que ya están. De paso el periodo queda en la dirección y se puede
 * compartir o volver a él con el botón de atrás.
 */
export default function FiltroDashboard({
  preset, rango,
}: {
  preset: Preset;
  rango: Rango;
}) {
  const router = useRouter();
  // Copia local para que los campos de fecha respondan de inmediato mientras
  // el servidor rearma la página.
  const [local, setLocal] = useState(rango);

  function navegar(p: Preset, r: Rango) {
    setLocal(r);
    if (p === 'rango') {
      // Un rango a medias no sirve para consultar: se espera a la otra punta.
      if (!r.desde || !r.hasta) return;
      router.push(`/?p=rango&d=${r.desde}&h=${r.hasta}`);
      return;
    }
    router.push(p === '3m' ? '/' : `/?p=${p}`);
  }

  return <FiltroPeriodo preset={preset} rango={local} onCambio={navegar} />;
}
