import { conManejo } from '@/lib/api';
import { guardarDesglose, type LineaCobro } from '@/lib/cobro-servidor';

export const dynamic = 'force-dynamic';

/**
 * Deja asentado cómo se pagó una parada, desde el detalle de la ruta.
 *
 * Es un PUT y no un POST porque reemplaza el desglose entero: esto es "así se
 * pagó", no "aquí va otro abono". El cómo está en `guardarDesglose`, que
 * comparte con el endpoint del chofer — la misma entrega cobrada desde el
 * escritorio o desde la calle tiene que quedar asentada igual.
 */
export async function PUT(req: Request) {
  return conManejo(async () => {
    const cuerpo = (await req.json()) as {
      envio_id?: string; fecha?: string; lineas?: LineaCobro[];
    };
    if (!cuerpo.envio_id) throw new Error('Falta el envío.');
    return guardarDesglose(cuerpo.envio_id, cuerpo.lineas ?? [], cuerpo.fecha);
  });
}
