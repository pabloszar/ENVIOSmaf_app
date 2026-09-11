import { db } from '@/lib/db';
import { conManejo, faltaColumna, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const NUM = ['dias_credito', 'limite_credito', 'calificacion'];
const CAMPOS = [
  'nombre', 'roles', 'telefono', 'email', 'pct_override',
  'dias_credito', 'limite_credito', 'calificacion', 'activo', 'notas',
];

/** Las columnas que sí salen al navegador. `pin_hash` no está, y es a propósito. */
const VISIBLES =
  'id, nombre, roles, telefono, email, pct_override, dias_credito, limite_credito, '
  + 'calificacion, activo, notas, creado_en';

export async function GET() {
  return conManejo(async () => {
    // Lista explícita y no `*`: con `*`, la huella del PIN viajaría al
    // navegador nada más por existir la columna. No sirve para entrar, pero no
    // tiene por qué salir de la base.
    const pedir = (cols: string) => db()
      .from('contactos').select(cols)
      .order('activo', { ascending: false }).order('nombre');

    // `pin_hash` llega con fase8; sin esa migración se pide solo lo que existe,
    // para no tumbar la pantalla de Contactos entera por una columna nueva.
    let { data, error } = await pedir(`${VISIBLES}, pin_hash`);
    if (error && faltaColumna(error.message)) ({ data, error } = await pedir(VISIBLES));
    if (error) throw new Error(error.message);

    // Del PIN solo sale si lo tiene o no, que es lo único que la pantalla
    // necesita para decidir entre "Poner PIN" y "Cambiar PIN".
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((fila) => {
      const { pin_hash: hash, ...c } = fila;
      return { ...c, tiene_pin: !!hash };
    });
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
