import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';
import { cerrarRuta, reabrirRuta } from '@/lib/cerrar';

export const dynamic = 'force-dynamic';

/**
 * Cierra una ruta: congela la configuración, genera comisiones y la marca
 * entregada. Con ?reabrir=1 hace lo contrario.
 *
 * La lógica vive en `@/lib/cerrar` porque el selector de estado del detalle
 * también la usa: cerrar por un camino y por otro tiene que dar lo mismo.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const reabrir = new URL(req.url).searchParams.get('reabrir') === '1';
  return conManejo(async () =>
    reabrir ? reabrirRuta(db(), params.id) : cerrarRuta(db(), params.id));
}
