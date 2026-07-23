import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const NUM = ['monto'];
const CAMPOS = [
  'fecha', 'categoria', 'tipo', 'monto', 'ruta_id', 'vehiculo_id', 'contacto_id',
  'descripcion', 'metodo_pago', 'comprobante_url',
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

export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const fila = soloCampos(cuerpo, CAMPOS);
    fila.fecha ??= new Date().toISOString().slice(0, 10);
    fila.tipo ??= 'operativo';
    if (!fila.categoria) throw new Error('Elige la categoría del gasto.');
    if (fila.monto == null) throw new Error('Falta el monto.');
    const { data, error } = await db().from('gastos').insert(fila).select().single();
    if (error) throw new Error(error.message);
    return data;
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
