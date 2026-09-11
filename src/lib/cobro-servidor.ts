import { db } from '@/lib/db';
import { esMetodo } from '@/lib/cobro';

export interface LineaCobro {
  metodo?: unknown;
  monto?: unknown;
  recibido_por?: unknown;
  recibido_por_otro?: unknown;
}

/**
 * Deja asentado cómo se pagó una misión.
 *
 * Vive aquí y no dentro de un endpoint porque lo llaman dos: el admin desde el
 * detalle de la ruta y el chofer desde la calle. Escrito dos veces, la primera
 * corrección que se le hiciera a uno dejaría al otro cobrando distinto por el
 * mismo flete — el mismo motivo por el que las tres páginas de Dinero suman
 * con `calculos.ts` y no cada una por su cuenta.
 *
 * Reemplaza el desglose entero en vez de agregarle renglones: esto es "así se
 * pagó", no "aquí va otro abono". Sumar llevaría a cobrar dos veces la misma
 * entrega en cuanto se corrigiera dos veces. Para los abonos de un crédito
 * está `POST /api/cobros`, que sí suma.
 *
 * Al guardar se prende `cobro_detallado`: de esta misión ya no hay que suponer
 * nada. Y `a_credito` deja de ser algo que alguien marca a mano y pasa a ser
 * lo que sobra sin pagar.
 */
export async function guardarDesglose(
  envioId: string,
  lineasCrudas: LineaCobro[],
  fechaPedida?: string
) {
  const sb = db();

  const { data: envio, error: e0 } = await sb
    .from('envios').select('id, precio, ruta_id').eq('id', envioId).single();
  if (e0) throw new Error(e0.message);

  const precio = Number(envio.precio);
  const { data: ruta } = await sb.from('rutas').select('fecha').eq('id', envio.ruta_id).single();
  const fecha = fechaPedida ?? ruta?.fecha ?? new Date().toISOString().slice(0, 10);

  const lineas = lineasCrudas.map((l, i) => {
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
    envio_id: envioId,
    precio,
    cobrado,
    por_cobrar: Math.max(0, Math.round((precio - cobrado) * 100) / 100),
    lineas: lineas.length,
  };
}
