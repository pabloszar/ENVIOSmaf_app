import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const CAMPOS = [
  'fecha', 'contacto_id', 'nombre_otro', 'monto', 'direccion', 'metodo', 'referencia', 'notas',
];

/**
 * Entregas de efectivo entre bolsillos.
 *
 *   recibo   alguien te entrega lo que traía cobrado. Su saldo baja, tu caja sube.
 *   entrego  le adelantas dinero para gastos. Su saldo sube, tu caja baja.
 *
 * No son gastos: el dinero no sale del negocio, solo cambia de mano. Meterlo
 * como gasto lo restaría del margen dos veces, igual que pasaría con los pagos
 * del fondo de renta.
 */
export async function GET() {
  return conManejo(async () => {
    const { data, error } = await db()
      .from('entregas_efectivo').select('*').order('fecha', { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), ['monto']);
    const fila = soloCampos(cuerpo, CAMPOS);

    if (!(Number(fila.monto ?? 0) > 0)) throw new Error('El monto debe ser mayor a cero.');
    if (!fila.contacto_id && !String(fila.nombre_otro ?? '').trim()) {
      throw new Error('Di de quién es la entrega.');
    }
    fila.direccion ??= 'recibo';
    if (!['recibo', 'entrego'].includes(String(fila.direccion))) {
      throw new Error('La dirección debe ser recibo o entrego.');
    }
    fila.fecha ??= new Date().toISOString().slice(0, 10);
    // Un nombre suelto define un bolsillo: si se escribe distinto cada vez, el
    // saldo se parte en dos personas que en realidad son la misma.
    if (fila.nombre_otro) fila.nombre_otro = String(fila.nombre_otro).trim();

    const { data, error } = await db().from('entregas_efectivo').insert(fila).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function DELETE(req: Request) {
  return conManejo(async () => {
    const { id } = (await req.json()) as { id?: string };
    if (!id) throw new Error('Falta el id.');
    const { error } = await db().from('entregas_efectivo').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { eliminado: id };
  });
}
