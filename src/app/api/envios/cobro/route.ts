import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';
import { esMetodo } from '@/lib/cobro';

export const dynamic = 'force-dynamic';

interface Linea {
  metodo?: unknown; monto?: unknown;
  recibido_por?: unknown; recibido_por_otro?: unknown;
}

/**
 * Deja asentado cómo se pagó una parada.
 *
 * Reemplaza el desglose entero en vez de agregarle renglones, y por eso es un
 * PUT y no un POST: esto es "así se pagó", no "aquí va otro abono". Sumar
 * llevaría a cobrar dos veces la misma entrega en cuanto se corrigiera dos
 * veces, que fue justo el error que hubo que arreglar en `cobros/ajustar`.
 *
 * Para los abonos de un crédito —el cliente paga hoy una parte y el mes que
 * entra otra— está `POST /api/cobros`, que sí suma.
 *
 * Al guardar se prende `cobro_detallado`: de esta parada ya no hay que
 * suponer nada. Y se recalcula `a_credito`, que deja de ser algo que alguien
 * marca a mano y pasa a ser lo que sobra sin pagar.
 */
export async function PUT(req: Request) {
  return conManejo(async () => {
    const cuerpo = (await req.json()) as {
      envio_id?: string; fecha?: string; lineas?: Linea[];
    };
    const envioId = cuerpo.envio_id;
    if (!envioId) throw new Error('Falta el envío.');

    const sb = db();
    const { data: envio, error: e0 } = await sb
      .from('envios').select('id, precio, ruta_id').eq('id', envioId).single();
    if (e0) throw new Error(e0.message);

    const precio = Number(envio.precio);
    const { data: ruta } = await sb.from('rutas').select('fecha').eq('id', envio.ruta_id).single();
    const fecha = cuerpo.fecha ?? ruta?.fecha ?? new Date().toISOString().slice(0, 10);

    const lineas = (cuerpo.lineas ?? []).map((l, i) => {
      const monto = Number(l.monto ?? 0);
      if (!esMetodo(l.metodo)) throw new Error(`La línea ${i + 1} no dice cómo se pagó.`);
      if (!(monto > 0)) throw new Error(`El monto de la línea ${i + 1} debe ser mayor a cero.`);
      return {
        envio_id: envioId,
        fecha,
        monto,
        metodo: l.metodo,
        recibido_por: (l.recibido_por as string) || null,
        recibido_por_otro: String(l.recibido_por_otro ?? '').trim() || null,
      };
    });

    // Se compara en centavos: con coma flotante, 2000 + 1500 contra 3500 puede
    // salir sobrado por una diezmilésima de peso y rechazar un pago correcto.
    const suma = Math.round(lineas.reduce((s, l) => s + l.monto, 0) * 100);
    if (suma > Math.round(precio * 100)) {
      throw new Error(`El desglose suma más que el flete (${precio}).`);
    }

    const { error: e1 } = await sb.from('cobros').delete().eq('envio_id', envioId);
    if (e1) throw new Error(e1.message);

    if (lineas.length > 0) {
      const { error: e2 } = await sb.from('cobros').insert(lineas);
      if (e2) throw new Error(e2.message);
    }

    const cobrado = suma / 100;
    const { error: e3 } = await sb.from('envios').update({
      cobro_detallado: true,
      a_credito: cobrado < precio,
      // El desglose manda: quien cobró el efectivo ya viaja en cada línea, y
      // dejar el dato viejo en el envío lo contaría por segunda vez.
      cobrado_por: null,
      cobrado_por_otro: null,
    }).eq('id', envioId);
    if (e3) throw new Error(e3.message);

    return {
      envio_id: envioId, precio, cobrado,
      por_cobrar: Math.max(0, Math.round((precio - cobrado) * 100) / 100),
      lineas: lineas.length,
    };
  });
}
