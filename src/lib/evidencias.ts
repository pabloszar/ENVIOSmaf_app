import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET_EVIDENCIAS = 'evidencias';

/**
 * Borra del bucket los archivos de las evidencias que están por desaparecer.
 *
 * La llave foránea ya se lleva las filas de `adjuntos` en cascada, pero
 * Postgres no sabe nada de Storage: sin esto, cada gasto borrado dejaría su
 * foto ocupando espacio para siempre, sin ninguna fila que la nombre.
 *
 * Hay que llamarlo ANTES de borrar, porque después ya no hay dónde leer las
 * rutas de los archivos. Si falla, se deja pasar: perder un archivo huérfano
 * es molesto, no dejar borrar el gasto lo es más.
 */
export async function borrarEvidencias(
  sb: SupabaseClient,
  filtro: { gasto_id?: string; envio_id?: string; ruta_id?: string }
) {
  const rutas: string[] = [];

  const juntar = async (campo: string, valor: string) => {
    const { data } = await sb.from('adjuntos').select('ruta_archivo').eq(campo, valor);
    for (const a of data ?? []) rutas.push(a.ruta_archivo);
  };

  try {
    if (filtro.gasto_id) await juntar('gasto_id', filtro.gasto_id);
    if (filtro.envio_id) await juntar('envio_id', filtro.envio_id);

    if (filtro.ruta_id) {
      await juntar('ruta_id', filtro.ruta_id);
      // Borrar la ruta se lleva en cascada sus paradas y sus gastos, y con
      // ellos las evidencias que colgaban de cada uno. Hay que juntarlas aquí
      // porque en cuanto la ruta se vaya, ya no habrá cómo encontrarlas.
      const [{ data: envios }, { data: gastos }] = await Promise.all([
        sb.from('envios').select('id').eq('ruta_id', filtro.ruta_id),
        sb.from('gastos').select('id').eq('ruta_id', filtro.ruta_id),
      ]);
      for (const e of envios ?? []) await juntar('envio_id', e.id);
      for (const g of gastos ?? []) await juntar('gasto_id', g.id);
    }

    if (rutas.length > 0) await sb.storage.from(BUCKET_EVIDENCIAS).remove(rutas);
  } catch {
    /* un archivo huérfano no debe impedir borrar el registro */
  }
}
