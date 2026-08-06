import { db } from '@/lib/db';
import { configVigente } from '@/lib/config';
import Flotilla, { FilaRent } from './Flotilla';
import type { Vehiculo, RutaPnl } from '@/types';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const sb = db();
  const [veh, rent, viajes, cfg] = await Promise.all([
    sb.from('vehiculos').select('*').order('activo', { ascending: false }).order('nombre'),
    sb.from('v_rentabilidad_vehiculo').select('*'),
    // Los viajes alimentan el sparkline de cada tarjeta y la lista del panel.
    sb.from('v_ruta_pnl_full').select('*').order('fecha').limit(500),
    configVigente(),
  ]);

  return (
    <Flotilla
      vehiculos={(veh.data ?? []) as Vehiculo[]}
      rentabilidad={(rent.data ?? []) as FilaRent[]}
      viajes={(viajes.data ?? []) as RutaPnl[]}
      pctPropia={cfg.pct_renta_propia}
      pctRentada={cfg.pct_renta_rentada}
    />
  );
}
