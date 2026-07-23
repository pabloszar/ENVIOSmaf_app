import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const NUM = ['km_total', 'km_osrm'];
const CAMPOS = ['fecha', 'estado', 'vehiculo_id', 'km_total', 'km_osrm', 'roundtrip', 'orden_optimo', 'notas'];

export async function GET() {
  return conManejo(async () => {
    // La lista se arma sobre la vista de P&L para traer ya calculada la utilidad.
    const { data, error } = await db()
      .from('v_ruta_pnl_full').select('*').order('fecha', { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data;
  });
}

/**
 * Crea una ruta. Puede venir con su primer envío incluido (`envio`) para el
 * caso de captura rápida: una pantalla, un viaje de una parada.
 */
export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const fila = soloCampos(cuerpo, CAMPOS);
    fila.fecha ??= new Date().toISOString().slice(0, 10);
    fila.estado ??= 'agendada';

    const sb = db();
    const { data: ruta, error } = await sb.from('rutas').insert(fila).select().single();
    if (error) throw new Error(error.message);

    const envio = (cuerpo as { envio?: Record<string, unknown> }).envio;
    if (envio) {
      const e = limpiarNumericos(envio, ['precio', 'distancia_km', 'num_articulos', 'num_pisos', 'precio_sugerido_cotizador']);
      const filaEnvio = soloCampos(e, [
        'cliente_id', 'vendedor_id', 'orden_venta', 'destino', 'lat', 'lng', 'zona',
        'distancia_km', 'tamano_carga', 'num_articulos', 'num_pisos', 'precio',
        'precio_sugerido_cotizador', 'uso_cotizador', 'calificacion', 'notas',
      ]);
      filaEnvio.ruta_id = ruta.id;
      filaEnvio.secuencia = 1;
      const { error: e2 } = await sb.from('envios').insert(filaEnvio);
      if (e2) throw new Error(e2.message);
    }

    return ruta;
  });
}
