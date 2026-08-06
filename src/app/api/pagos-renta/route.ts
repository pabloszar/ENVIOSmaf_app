import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const CAMPOS = ['fecha', 'monto', 'concepto', 'vehiculo_id', 'metodo', 'referencia', 'notas'];
const CONCEPTOS = ['entrega', 'mantenimiento', 'legal', 'otro'];

/**
 * Salidas del fondo de renta.
 *
 * La renta que se le retiene a cada flete es de Tiendas MAF, no de Envíos MAF.
 * Aquí se registra cuándo sale de la bolsa: como entrega directa o como
 * mantenimiento y trámites pagados por su cuenta.
 *
 * Deliberadamente NO son `gastos`: la renta ya está descontada en
 * `v_ruta_pnl.utilidad`, así que registrarla otra vez como gasto operativo la
 * restaría dos veces y hundiría el margen sin motivo.
 */
export async function GET() {
  return conManejo(async () => {
    const { data, error } = await db()
      .from('pagos_renta').select('*').order('fecha', { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), ['monto']);
    const fila = soloCampos(cuerpo, CAMPOS);

    const monto = Number(fila.monto ?? 0);
    if (!(monto > 0)) throw new Error('El monto debe ser mayor a cero.');
    fila.concepto ??= 'entrega';
    if (!CONCEPTOS.includes(String(fila.concepto))) {
      throw new Error(`Concepto inválido. Usa: ${CONCEPTOS.join(', ')}.`);
    }
    fila.fecha ??= new Date().toISOString().slice(0, 10);

    const sb = db();

    // Un pago no puede ser mayor a lo que hay guardado: el fondo no presta.
    // Se avisa en vez de bloquear —puede haber un adelanto acordado— pero el
    // saldo negativo tiene que quedar visible y no como un descuadre mudo.
    const { data: fondo } = await sb.from('v_fondo_renta').select('saldo').maybeSingle();
    const saldo = Number(fondo?.saldo ?? 0);

    const { data, error } = await sb.from('pagos_renta').insert(fila).select().single();
    if (error) throw new Error(error.message);

    return { ...data, saldo_previo: saldo, saldo_nuevo: saldo - monto };
  });
}

export async function DELETE(req: Request) {
  return conManejo(async () => {
    const { id } = (await req.json()) as { id?: string };
    if (!id) throw new Error('Falta el id.');
    const { error } = await db().from('pagos_renta').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { eliminado: id };
  });
}
