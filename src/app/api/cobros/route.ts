import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const NUM = ['monto'];
const CAMPOS = ['envio_id', 'fecha', 'monto', 'metodo', 'notas', 'recibido_por', 'recibido_por_otro'];

export async function GET(req: Request) {
  return conManejo(async () => {
    const envioId = new URL(req.url).searchParams.get('envio_id');
    let q = db().from('cobros').select('*').order('fecha', { ascending: false });
    if (envioId) q = q.eq('envio_id', envioId);
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
    if (!fila.envio_id) throw new Error('Falta el envío.');
    if (fila.monto == null || Number(fila.monto) <= 0) throw new Error('El monto debe ser mayor a cero.');
    const { data, error } = await db().from('cobros').insert(fila).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function DELETE(req: Request) {
  return conManejo(async () => {
    const { id } = (await req.json()) as { id?: string };
    if (!id) throw new Error('Falta el id.');
    const { error } = await db().from('cobros').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { eliminado: id };
  });
}
