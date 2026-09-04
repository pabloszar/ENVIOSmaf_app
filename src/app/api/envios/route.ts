import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';
import { borrarEvidencias } from '@/lib/evidencias';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const NUM = ['secuencia', 'lat', 'lng', 'distancia_km', 'num_articulos', 'num_pisos', 'precio', 'precio_sugerido_cotizador', 'calificacion'];
const CAMPOS = [
  'ruta_id', 'secuencia', 'cliente_id', 'vendedor_id', 'orden_venta', 'destino',
  'lat', 'lng', 'zona', 'distancia_km', 'tamano_carga', 'num_articulos', 'num_pisos',
  'precio', 'precio_sugerido_cotizador', 'uso_cotizador', 'calificacion', 'a_credito', 'notas',
  // Quién recibió el dinero. Vacío = la caja de Envíos MAF, que es lo normal.
  'cobrado_por', 'cobrado_por_otro',
];

/**
 * Ajusta el kilometraje de la ruta cuando una parada entra, cambia o sale.
 *
 * `envios.distancia_km` son los km que ESA parada le agrega al viaje, no la
 * distancia desde la base. Así el total de la ruta es la suma de lo que aporta
 * cada parada, y agregar una cuarta entrega no obliga a recalcular el viaje
 * entero a mano.
 *
 * Es una solución temporal a propósito: cuando el cotizador tenga la ubicación
 * y la distancia real de cada destino, esos km vendrán de ahí en vez de
 * escribirse. La estructura ya queda lista para ese cambio — solo cambia quién
 * llena `distancia_km`.
 *
 * Nunca deja el total en negativo: un dato mal capturado no debe convertir el
 * kilometraje de la ruta en un número imposible.
 */
async function ajustarKm(sb: SupabaseClient, rutaId: string, delta: number) {
  if (!delta) return;
  const { data: ruta } = await sb.from('rutas').select('km_total').eq('id', rutaId).single();
  if (!ruta) return;
  const total = Math.max(0, Number(ruta.km_total ?? 0) + delta);
  await sb.from('rutas').update({ km_total: total || null }).eq('id', rutaId);
}

/**
 * Cierra los huecos en la numeración de las paradas.
 *
 * Al borrar la segunda de tres, las que quedan son la 1 y la 3, y esa 3 parece
 * decir que falta una entrega. La secuencia es el orden de visita, no un
 * identificador: se puede reescribir sin perder nada.
 */
async function renumerar(sb: SupabaseClient, rutaId: string) {
  const { data } = await sb
    .from('envios').select('id, secuencia').eq('ruta_id', rutaId).order('secuencia');
  await Promise.all((data ?? [])
    .map((e, i) => (e.secuencia === i + 1
      ? null
      : sb.from('envios').update({ secuencia: i + 1 }).eq('id', e.id)))
    .filter(Boolean));
}

export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const fila = soloCampos(cuerpo, CAMPOS);
    if (!fila.ruta_id) throw new Error('Falta la ruta.');
    if (!fila.destino) throw new Error('El destino es obligatorio.');

    const sb = db();

    // Secuencia automática: va después de la última parada. Se usa el máximo y
    // no el conteo porque con un hueco en la numeración —tres paradas que son
    // la 1, la 3 y la 4— contar daría 4 y repetiría una que ya existe.
    if (fila.secuencia == null) {
      const { data: ultima } = await sb
        .from('envios').select('secuencia').eq('ruta_id', fila.ruta_id)
        .order('secuencia', { ascending: false }).limit(1).maybeSingle();
      fila.secuencia = (ultima?.secuencia ?? 0) + 1;
    }
    const { data, error } = await sb.from('envios').insert(fila).select().single();
    if (error) throw new Error(error.message);

    await ajustarKm(sb, String(fila.ruta_id), Number(data.distancia_km ?? 0));
    return data;
  });
}

export async function PATCH(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const { id } = cuerpo as { id?: string };
    if (!id) throw new Error('Falta el id.');
    const fila = soloCampos(cuerpo, CAMPOS);

    const sb = db();
    // Se guarda el kilometraje anterior para mover la ruta solo por la
    // diferencia, no por el valor completo.
    const { data: antes } = await sb
      .from('envios').select('ruta_id, distancia_km').eq('id', id).single();

    const { data, error } = await sb.from('envios').update(fila).eq('id', id).select().single();
    if (error) throw new Error(error.message);

    if (antes && 'distancia_km' in fila) {
      await ajustarKm(sb, antes.ruta_id, Number(data.distancia_km ?? 0) - Number(antes.distancia_km ?? 0));
    }
    return data;
  });
}

export async function DELETE(req: Request) {
  return conManejo(async () => {
    const { id } = (await req.json()) as { id?: string };
    if (!id) throw new Error('Falta el id.');

    const sb = db();
    // Se lee antes de borrar: después ya no hay de dónde sacar los km a restar.
    const { data: antes } = await sb
      .from('envios').select('ruta_id, distancia_km').eq('id', id).single();

    await borrarEvidencias(sb, { envio_id: id });
    const { error } = await sb.from('envios').delete().eq('id', id);
    if (error) throw new Error(error.message);

    if (antes) {
      await ajustarKm(sb, antes.ruta_id, -Number(antes.distancia_km ?? 0));
      await renumerar(sb, antes.ruta_id);
    }
    return { eliminado: id };
  });
}
