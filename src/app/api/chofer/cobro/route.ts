import { conManejo } from '@/lib/api';
import { envioDelChofer, exigirChofer } from '@/lib/sesion';
import { guardarDesglose, type LineaCobro } from '@/lib/cobro-servidor';

export const dynamic = 'force-dynamic';

/**
 * Cómo le pagaron al chofer esta entrega.
 *
 * Guarda con `guardarDesglose`, el mismo que usa el detalle de la ruta: la
 * misma entrega tiene que quedar asentada igual venga del escritorio o de la
 * calle. Lo único que cambia aquí es la puerta — se comprueba que la misión
 * sea de un viaje suyo antes de dejarlo escribir.
 *
 * Esto es lo que cierra el hueco de siempre: hasta hoy casi todo decía "se
 * supone cobrado en efectivo al entregar", porque el que estaba ahí cuando el
 * dinero cambió de mano no tenía dónde anotarlo.
 *
 * Quien recibió el dinero se pone aquí y no se pide: fue él. Ese dato es el
 * que después dice cuánto trae en la bolsa y cuánto te tiene que entregar.
 */
export async function PUT(req: Request) {
  return conManejo(async () => {
    const { contactoId } = await exigirChofer();
    const cuerpo = (await req.json()) as { envio_id?: string; lineas?: LineaCobro[] };
    if (!cuerpo.envio_id) throw new Error('Falta la misión.');

    await envioDelChofer(cuerpo.envio_id, contactoId);

    const lineas = (cuerpo.lineas ?? []).map((l) => ({
      ...l,
      // El efectivo que recibe se queda con él hasta que te lo entregue, y de
      // ahí sale su saldo en custodia. Lo cobrado en tienda o por
      // transferencia no pasa por su bolsillo: nunca lo tuvo.
      recibido_por: l.metodo === 'efectivo' ? contactoId : null,
      recibido_por_otro: null,
    }));

    return guardarDesglose(cuerpo.envio_id, lineas);
  });
}
