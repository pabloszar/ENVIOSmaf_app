import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';
import { cerrarRuta, reabrirRuta } from '@/lib/cerrar';

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

/**
 * Actualiza la ruta.
 *
 * Corregir la fecha tiene una consecuencia que no se ve: el ingreso se agrupa
 * por `rutas.fecha`, pero los gastos por su propia `gastos.fecha`. Si solo se
 * moviera la ruta, un viaje quedaría con el ingreso en un mes y la gasolina en
 * otro, y el margen mensual del tablero saldría mal en los dos.
 *
 * Por eso los gastos del viaje siguen a la ruta — pero solo los que traían
 * exactamente la fecha anterior, que son los que la app estampó sola. Un gasto
 * que se fechó a propósito en otro día (una caseta pagada al regreso) se queda
 * donde está: eso lo decidió una persona y no nos toca moverlo.
 *
 * Mover el estado a 'entregada' NO es un cambio de columna: es cerrar la ruta.
 * Congela la configuración y genera las comisiones, igual que el botón. Sacarla
 * de 'entregada' la reabre y borra las comisiones devengadas. Antes esto se
 * guardaba como texto y la ruta quedaba cerrada de mentiras.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const fila = soloCampos(cuerpo, CAMPOS);
    const sb = db();

    // Se lee el estado anterior junto con la fecha: los dos se necesitan antes
    // de tocar nada.
    const { data: antes, error: e0 } = await sb
      .from('rutas').select('fecha, estado').eq('id', params.id).single();
    if (e0) throw new Error(e0.message);
    const fechaPrevia = antes.fecha as string;
    const estadoPrevio = antes.estado as string;

    // El estado se saca del update plano: lo maneja cerrar/reabrir.
    const nuevoEstado = fila.estado as string | undefined;
    delete fila.estado;

    let cerroAhora = false;
    let comisionesGeneradas = 0;
    if (nuevoEstado && nuevoEstado !== estadoPrevio) {
      if (nuevoEstado === 'entregada') {
        const r = await cerrarRuta(sb, params.id);
        comisionesGeneradas = r.comisiones_generadas;
        cerroAhora = true;
      } else if (estadoPrevio === 'entregada') {
        await reabrirRuta(sb, params.id, nuevoEstado);
      } else {
        fila.estado = nuevoEstado;
      }
    }

    // Cerrar o reabrir ya escribió la fila; un update vacío no tiene nada que
    // hacer y Supabase lo rechaza.
    const q = sb.from('rutas');
    const { data, error } = Object.keys(fila).length
      ? await q.update(fila).eq('id', params.id).select().single()
      : await q.select('*').eq('id', params.id).single();
    if (error) throw new Error(error.message);

    let gastosMovidos = 0;
    if (fechaPrevia && fila.fecha && fila.fecha !== fechaPrevia) {
      const { data: movidos, error: e2 } = await sb
        .from('gastos')
        .update({ fecha: fila.fecha })
        .eq('ruta_id', params.id)
        .eq('fecha', fechaPrevia)
        .select('id');
      if (e2) throw new Error(e2.message);
      gastosMovidos = movidos?.length ?? 0;
    }

    return { ...data, gastos_movidos: gastosMovidos, cerro: cerroAhora, comisiones_generadas: comisionesGeneradas };
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
