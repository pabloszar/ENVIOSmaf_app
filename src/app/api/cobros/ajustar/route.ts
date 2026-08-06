import { db } from '@/lib/db';
import { conManejo, limpiarNumericos } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Corrige cuánto se cobró de verdad en un envío.
 *
 * La app da por cobrado todo flete de contado en cuanto la ruta se entrega,
 * porque así es como pasa casi siempre: el chofer trae el dinero. Pero ese
 * supuesto es justo donde el sistema se separa de la cuenta de banco cuando el
 * cliente pagó de menos, hubo descuento o quedó a deber una parte.
 *
 * Aquí se aterriza el dato real sin inventar tablas nuevas:
 *
 *   cobrado = precio  → contado limpio. Se marca sin crédito y se borran los
 *                       cobros parciales que hubiera, porque ya no aplican.
 *   cobrado < precio  → pasa a crédito y se deja UN cobro por lo que sí entró.
 *                       La diferencia aparece sola en cuentas por cobrar.
 *
 * Se reemplazan los cobros en vez de sumar uno nuevo: esto es una corrección,
 * no un abono. Sumarlo llevaría a cobrar dos veces la misma entrega si se
 * ajusta dos veces.
 */
export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), ['cobrado']);
    const { envio_id: envioId, fecha, metodo } = cuerpo as {
      envio_id?: string; fecha?: string; metodo?: string;
    };
    const cobrado = Number(cuerpo.cobrado ?? 0);

    if (!envioId) throw new Error('Falta el envío.');
    if (!(cobrado >= 0)) throw new Error('Lo cobrado no puede ser negativo.');

    const sb = db();
    const { data: envio, error: e0 } = await sb
      .from('envios').select('id, precio, ruta_id').eq('id', envioId).single();
    if (e0) throw new Error(e0.message);

    const precio = Number(envio.precio);
    if (cobrado > precio) {
      throw new Error(`No puedes cobrar más que el flete (${precio}).`);
    }

    // La corrección reemplaza lo que hubiera: se limpia primero.
    const { error: e1 } = await sb.from('cobros').delete().eq('envio_id', envioId);
    if (e1) throw new Error(e1.message);

    const completo = cobrado >= precio;
    const { error: e2 } = await sb
      .from('envios').update({ a_credito: !completo }).eq('id', envioId);
    if (e2) throw new Error(e2.message);

    if (!completo && cobrado > 0) {
      const { data: ruta } = await sb.from('rutas').select('fecha').eq('id', envio.ruta_id).single();
      const { error: e3 } = await sb.from('cobros').insert({
        envio_id: envioId,
        fecha: fecha ?? ruta?.fecha ?? new Date().toISOString().slice(0, 10),
        monto: cobrado,
        metodo: metodo ?? null,
        notas: 'Ajuste de lo cobrado',
      });
      if (e3) throw new Error(e3.message);
    }

    return { envio_id: envioId, precio, cobrado, por_cobrar: Math.max(0, precio - cobrado) };
  });
}
