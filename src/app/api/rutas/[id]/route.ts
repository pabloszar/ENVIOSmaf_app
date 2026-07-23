import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const NUM = ['km_total', 'km_osrm'];
const CAMPOS = ['fecha', 'estado', 'vehiculo_id', 'km_total', 'km_osrm', 'roundtrip', 'orden_optimo', 'notas'];

/** Detalle completo de una ruta: envíos, gastos y tripulación. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return conManejo(async () => {
    const sb = db();
    const [ruta, envios, gastos, tripulacion, comisiones] = await Promise.all([
      sb.from('rutas').select('*').eq('id', params.id).single(),
      sb.from('envios').select('*').eq('ruta_id', params.id).order('secuencia'),
      sb.from('gastos').select('*').eq('ruta_id', params.id).order('fecha'),
      sb.from('ruta_tripulacion').select('*').eq('ruta_id', params.id),
      sb.from('comisiones').select('*').eq('ruta_id', params.id),
    ]);
    const err = ruta.error ?? envios.error ?? gastos.error ?? tripulacion.error ?? comisiones.error;
    if (err) throw new Error(err.message);
    return {
      ruta: ruta.data,
      envios: envios.data,
      gastos: gastos.data,
      tripulacion: tripulacion.data,
      comisiones: comisiones.data,
    };
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const fila = soloCampos(cuerpo, CAMPOS);
    const { data, error } = await db().from('rutas').update(fila).eq('id', params.id).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return conManejo(async () => {
    // envíos, gastos, tripulación y comisiones caen por ON DELETE CASCADE.
    const { error } = await db().from('rutas').delete().eq('id', params.id);
    if (error) throw new Error(error.message);
    return { eliminada: params.id };
  });
}
