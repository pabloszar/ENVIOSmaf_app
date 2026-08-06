import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return conManejo(async () => {
    const url = new URL(req.url);
    const estado = url.searchParams.get('estado');
    const contactoId = url.searchParams.get('contacto_id');
    let q = db().from('comisiones').select('*').order('creado_en', { ascending: false });
    if (estado) q = q.eq('estado', estado);
    if (contactoId) q = q.eq('contacto_id', contactoId);
    const { data, error } = await q.limit(2000);
    if (error) throw new Error(error.message);
    return data;
  });
}

/**
 * Marca comisiones como pagadas (o las regresa a devengadas).
 * Acepta `ids` explícitos, o `contacto_id` para liquidar todo lo devengado de
 * una persona de un jalón — que es el caso normal de la quincena.
 */
export async function PATCH(req: Request) {
  return conManejo(async () => {
    const body = (await req.json()) as {
      ids?: string[];
      contacto_id?: string;
      marcar?: 'pagada' | 'devengada';
      fecha_pago?: string;
    };
    const marcar = body.marcar ?? 'pagada';
    const nuevoEstado = marcar;
    const fechaPago = marcar === 'pagada' ? (body.fecha_pago ?? new Date().toISOString().slice(0, 10)) : null;

    const sb = db();
    let q = sb.from('comisiones').update({ estado: nuevoEstado, fecha_pago: fechaPago });

    if (body.ids?.length) {
      q = q.in('id', body.ids);
    } else if (body.contacto_id) {
      // Solo mover lo que está en el estado opuesto, para no pisar historial.
      q = q.eq('contacto_id', body.contacto_id).eq('estado', marcar === 'pagada' ? 'devengada' : 'pagada');
    } else {
      throw new Error('Indica ids o contacto_id.');
    }

    const { data, error } = await q.select();
    if (error) throw new Error(error.message);
    return { actualizadas: data?.length ?? 0 };
  });
}
