import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const NUM = ['dias_credito', 'limite_credito', 'calificacion'];
const CAMPOS = [
  'nombre', 'roles', 'telefono', 'email', 'pct_override',
  'dias_credito', 'limite_credito', 'calificacion', 'activo', 'notas',
];

export async function GET() {
  return conManejo(async () => {
    const { data, error } = await db()
      .from('contactos').select('*').order('activo', { ascending: false }).order('nombre');
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const fila = soloCampos(cuerpo, CAMPOS);
    if (!fila.nombre) throw new Error('El nombre es obligatorio.');
    if (!Array.isArray(fila.roles) || fila.roles.length === 0) {
      throw new Error('Asigna al menos un rol.');
    }
    const { data, error } = await db().from('contactos').insert(fila).select().single();
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
    const { data, error } = await db().from('contactos').update(fila).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}
