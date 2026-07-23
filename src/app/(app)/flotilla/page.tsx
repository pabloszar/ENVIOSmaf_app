import { db } from '@/lib/db';
import { configVigente } from '@/lib/config';
import Flotilla from './Flotilla';
import type { Vehiculo } from '@/types';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const sb = db();
  const [veh, rent, cfg] = await Promise.all([
    sb.from('vehiculos').select('*').order('activo', { ascending: false }).order('nombre'),
    sb.from('v_rentabilidad_vehiculo').select('*'),
    configVigente(),
  ]);

  return (
    <Flotilla
      vehiculos={(veh.data ?? []) as Vehiculo[]}
      rentabilidad={rent.data ?? []}
      pctPropia={cfg.pct_renta_propia}
      pctRentada={cfg.pct_renta_rentada}
    />
  );
}
