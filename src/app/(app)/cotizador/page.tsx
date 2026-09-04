import { db } from '@/lib/db';
import { configVigente } from '@/lib/config';
import Cotizador from './Cotizador';
import type { Contacto, Vehiculo } from '@/types';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [cfg, veh, cont] = await Promise.all([
    configVigente(),
    db().from('vehiculos').select('*').eq('activo', true).order('nombre'),
    db().from('contactos').select('*').eq('activo', true).order('nombre'),
  ]);

  const contactos = (cont.data ?? []) as Contacto[];
  return (
    <Cotizador
      cfg={cfg}
      vehiculos={(veh.data ?? []) as Vehiculo[]}
      clientes={contactos.filter((c) =>
        c.roles?.includes('cliente_b2b') || c.roles?.includes('cliente_b2c'))}
      vendedores={contactos.filter((c) => c.roles?.includes('vendedor'))}
    />
  );
}
