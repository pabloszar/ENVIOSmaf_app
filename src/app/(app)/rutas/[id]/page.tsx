import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import Detalle from './Detalle';
import type { Ruta, Envio, Gasto, Tripulante, Comision, Vehiculo, Contacto } from '@/types';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  const sb = db();
  const [ruta, envios, gastos, tripulacion, comisiones, veh, cont] = await Promise.all([
    sb.from('rutas').select('*').eq('id', params.id).maybeSingle(),
    sb.from('envios').select('*').eq('ruta_id', params.id).order('secuencia'),
    sb.from('gastos').select('*').eq('ruta_id', params.id).order('fecha'),
    sb.from('ruta_tripulacion').select('*').eq('ruta_id', params.id),
    sb.from('comisiones').select('*').eq('ruta_id', params.id),
    sb.from('vehiculos').select('*').eq('activo', true).order('nombre'),
    sb.from('contactos').select('*').eq('activo', true).order('nombre'),
  ]);

  if (!ruta.data) notFound();

  const contactos = (cont.data ?? []) as Contacto[];
  const nombrePorId: Record<string, string> = Object.fromEntries(contactos.map((c) => [c.id, c.nombre]));

  return (
    <Detalle
      datos={{
        ruta: ruta.data as Ruta,
        envios: (envios.data ?? []) as Envio[],
        gastos: (gastos.data ?? []) as Gasto[],
        tripulacion: (tripulacion.data ?? []) as Tripulante[],
        comisiones: (comisiones.data ?? []) as Comision[],
      }}
      vehiculos={(veh.data ?? []) as Vehiculo[]}
      choferes={contactos.filter((c) => c.roles?.includes('chofer'))}
      ayudantes={contactos.filter((c) => c.roles?.includes('ayudante'))}
      vendedores={contactos.filter((c) => c.roles?.includes('vendedor'))}
      clientes={contactos.filter((c) => c.roles?.includes('cliente_b2b') || c.roles?.includes('cliente_b2c'))}
      nombrePorId={nombrePorId}
    />
  );
}
