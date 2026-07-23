import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const NUM = ['pct_renta', 'rendimiento_kml'];
const CAMPOS = ['nombre', 'placas', 'tipo', 'propiedad', ...NUM, 'capacidad', 'activo', 'notas'];

export async function GET() {
  return conManejo(async () => {
    const { data, error } = await db()
      .from('vehiculos').select('*').order('activo', { ascending: false }).order('nombre');
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const fila = soloCampos(cuerpo, CAMPOS);
    if (!fila.nombre) throw new Error('El nombre de la unidad es obligatorio.');
    const { data, error } = await db().from('vehiculos').insert(fila).select().single();
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
    const { data, error } = await db().from('vehiculos').update(fila).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}
