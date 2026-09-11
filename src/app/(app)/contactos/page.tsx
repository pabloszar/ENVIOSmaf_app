import { db } from '@/lib/db';
import Contactos from './Contactos';
import type { Contacto } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Se piden las columnas por nombre y no con `*` para que la huella del PIN no
 * viaje al navegador. De ella solo sale `tiene_pin`, que es lo único que la
 * pantalla necesita para decidir entre "Poner PIN" y "Cambiarlo".
 */
const VISIBLES =
  'id, nombre, roles, telefono, email, pct_override, dias_credito, limite_credito, '
  + 'calificacion, activo, notas';

export default async function Page() {
  const pedir = (cols: string) => db()
    .from('contactos').select(cols)
    .order('activo', { ascending: false }).order('nombre');

  // `pin_hash` llega con fase8; sin la migración se pide solo lo que existe.
  let { data, error } = await pedir(`${VISIBLES}, pin_hash`);
  if (error) ({ data } = await pedir(VISIBLES));

  const contactos = ((data ?? []) as unknown as Record<string, unknown>[]).map((fila) => {
    const { pin_hash: hash, ...c } = fila;
    return { ...c, tiene_pin: !!hash } as Contacto & { tiene_pin: boolean };
  });

  return <Contactos contactos={contactos} />;
}
