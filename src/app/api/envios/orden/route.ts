import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Reordena las paradas de una ruta.
 *
 * La secuencia es el orden de visita, no un identificador: se puede reescribir
 * entera sin perder nada. Por eso se recibe la lista completa y no un
 * "sube esta una posición" — mandar la lista tal como quedó en pantalla evita
 * que dos cambios seguidos se pisen y dejen dos paradas con el mismo número.
 *
 * Los kilómetros no se tocan: `envios.distancia_km` es lo que esa parada le
 * agrega al viaje, y cambiar el orden de las entregas no cambia el total.
 */
export async function POST(req: Request) {
  return conManejo(async () => {
    const { ruta_id: rutaId, ids } = (await req.json()) as { ruta_id?: string; ids?: string[] };
    if (!rutaId) throw new Error('Falta la ruta.');
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('Falta el orden.');

    const sb = db();
    const { data: actuales, error } = await sb
      .from('envios').select('id').eq('ruta_id', rutaId);
    if (error) throw new Error(error.message);

    // Se valida contra la ruta antes de escribir: una lista incompleta dejaría
    // paradas fuera con su número viejo, repetido con el de otra.
    const suyos = new Set((actuales ?? []).map((e) => e.id));
    if (ids.length !== suyos.size || !ids.every((id) => suyos.has(id))) {
      throw new Error('El orden no coincide con las misiones de la ruta. Recarga y vuelve a intentar.');
    }

    await Promise.all(ids.map((id, i) =>
      sb.from('envios').update({ secuencia: i + 1 }).eq('id', id)));

    return { ruta_id: rutaId, paradas: ids.length };
  });
}
