import { db } from '@/lib/db';
import Rutas from './Rutas';
import type { RutaPnl, Vehiculo, Contacto } from '@/types';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const sb = db();
  const [rutas, veh, cont] = await Promise.all([
    sb.from('v_ruta_pnl_full').select('*').order('fecha', { ascending: false }).limit(500),
    sb.from('vehiculos').select('*').eq('activo', true).order('nombre'),
    sb.from('contactos').select('*').eq('activo', true).order('nombre'),
  ]);

  const contactos = (cont.data ?? []) as Contacto[];
  const choferes = contactos.filter((c) => c.roles?.includes('chofer'));
  const clientes = contactos.filter(
    (c) => c.roles?.includes('cliente_b2b') || c.roles?.includes('cliente_b2c')
  );

  return (
    <Rutas
      rutas={(rutas.data ?? []) as RutaPnl[]}
      vehiculos={(veh.data ?? []) as Vehiculo[]}
      choferes={choferes}
      clientes={clientes}
    />
  );
}
