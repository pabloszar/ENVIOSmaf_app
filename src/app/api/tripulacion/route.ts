import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return conManejo(async () => {
    const { ruta_id, contacto_id, rol } = (await req.json()) as {
      ruta_id?: string; contacto_id?: string; rol?: 'chofer' | 'ayudante';
    };
    if (!ruta_id || !contacto_id || !rol) throw new Error('Faltan datos de la tripulación.');
    const { data, error } = await db()
      .from('ruta_tripulacion')
      .upsert({ ruta_id, contacto_id, rol }, { onConflict: 'ruta_id,contacto_id,rol' })
      .select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function DELETE(req: Request) {
  return conManejo(async () => {
    const { id } = (await req.json()) as { id?: string };
    if (!id) throw new Error('Falta el id.');
    const { error } = await db().from('ruta_tripulacion').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { eliminado: id };
  });
}
