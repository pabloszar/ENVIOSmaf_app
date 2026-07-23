import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const NUM = ['secuencia', 'lat', 'lng', 'distancia_km', 'num_articulos', 'num_pisos', 'precio', 'precio_sugerido_cotizador', 'calificacion'];
const CAMPOS = [
  'ruta_id', 'secuencia', 'cliente_id', 'vendedor_id', 'orden_venta', 'destino',
  'lat', 'lng', 'zona', 'distancia_km', 'tamano_carga', 'num_articulos', 'num_pisos',
  'precio', 'precio_sugerido_cotizador', 'uso_cotizador', 'calificacion', 'notas',
];

export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const fila = soloCampos(cuerpo, CAMPOS);
    if (!fila.ruta_id) throw new Error('Falta la ruta.');
    if (!fila.destino) throw new Error('El destino es obligatorio.');

    // Secuencia automática: siguiente parada de la ruta.
    if (fila.secuencia == null) {
      const { count } = await db()
        .from('envios').select('*', { count: 'exact', head: true }).eq('ruta_id', fila.ruta_id);
      fila.secuencia = (count ?? 0) + 1;
    }
    const { data, error } = await db().from('envios').insert(fila).select().single();
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
    const { data, error } = await db().from('envios').update(fila).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function DELETE(req: Request) {
  return conManejo(async () => {
    const { id } = (await req.json()) as { id?: string };
    if (!id) throw new Error('Falta el id.');
    const { error } = await db().from('envios').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { eliminado: id };
  });
}
