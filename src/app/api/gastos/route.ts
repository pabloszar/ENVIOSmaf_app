import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const NUM = ['monto'];
const CAMPOS = [
  'fecha', 'categoria', 'tipo', 'monto', 'ruta_id', 'vehiculo_id', 'contacto_id',
  'descripcion', 'metodo_pago', 'comprobante_url',
  // Quién puso el dinero. Vacío = la caja de Envíos MAF, que es lo normal.
  'pagado_por', 'pagado_por_otro',
];

export async function GET(req: Request) {
  return conManejo(async () => {
    const url = new URL(req.url);
    const rutaId = url.searchParams.get('ruta_id');
    const soloFijos = url.searchParams.get('fijos') === '1';

    let q = db().from('gastos').select('*').order('fecha', { ascending: false });
    if (rutaId) q = q.eq('ruta_id', rutaId);
    if (soloFijos) q = q.is('ruta_id', null);

    const { data, error } = await q.limit(1000);
    if (error) throw new Error(error.message);
    return data;
  });
}

/**
 * Acepta un gasto suelto o una lista. Capturar el viaje —gasolina, casetas,
 * comida— es una sola operación para quien la vive, así que se guarda de un jalón.
 */
export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = await req.json();
    const entradas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    if (entradas.length === 0) throw new Error('No hay gastos que guardar.');

    const hoy = new Date().toISOString().slice(0, 10);
    const filas = entradas.map((entrada, i) => {
      const fila = soloCampos(limpiarNumericos(entrada, NUM), CAMPOS);
      fila.fecha ??= hoy;
      fila.tipo ??= 'operativo';
      const cual = entradas.length > 1 ? ` de la línea ${i + 1}` : '';
      if (!fila.categoria) throw new Error(`Elige la categoría del gasto${cual}.`);
      if (fila.monto == null) throw new Error(`Falta el monto${cual}.`);
      return fila;
    });

    const { data, error } = await db().from('gastos').insert(filas).select();
    if (error) throw new Error(error.message);
    return Array.isArray(cuerpo) ? data : data?.[0];
  });
}

export async function PATCH(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const { id } = cuerpo as { id?: string };
    if (!id) throw new Error('Falta el id.');
    const fila = soloCampos(cuerpo, CAMPOS);
    const { data, error } = await db().from('gastos').update(fila).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function DELETE(req: Request) {
  return conManejo(async () => {
    const { id } = (await req.json()) as { id?: string };
    if (!id) throw new Error('Falta el id.');
    const { error } = await db().from('gastos').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { eliminado: id };
  });
}
