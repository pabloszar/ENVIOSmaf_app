import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Subcategorías de gasto.
 *
 * La categoría (gasolina, caseta, mantenimiento…) no se toca nunca: es un enum
 * y `v_ruta_pnl` separa la rentabilidad por ella. La subcategoría cuelga
 * debajo, es una tabla normal, y por eso se puede dar de alta desde
 * Configuración sin migrar la base ni pedirle nada a nadie.
 *
 * No se borran, se desactivan: un gasto viejo que apunta a "Llantas" tiene que
 * seguir diciendo "Llantas" aunque hoy ya no se use esa subcategoría.
 */
export async function GET(req: Request) {
  return conManejo(async () => {
    const todas = new URL(req.url).searchParams.get('todas') === '1';
    let q = db().from('subcategorias_gasto').select('*')
      .order('categoria').order('orden').order('nombre');
    if (!todas) q = q.eq('activa', true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(req: Request) {
  return conManejo(async () => {
    const { categoria, nombre } = (await req.json()) as { categoria?: string; nombre?: string };
    if (!categoria) throw new Error('Falta la categoría.');
    const limpio = String(nombre ?? '').trim();
    if (!limpio) throw new Error('Ponle nombre a la subcategoría.');

    const sb = db();
    // Si ya existía y estaba apagada, se revive en vez de chocar contra el
    // índice único: para quien la escribe es "agregarla", y volverla a ver es
    // exactamente lo que espera.
    const { data: previa } = await sb.from('subcategorias_gasto')
      .select('id, activa').eq('categoria', categoria).eq('nombre', limpio).maybeSingle();
    if (previa) {
      if (previa.activa) throw new Error(`"${limpio}" ya existe en esa categoría.`);
      const { data, error } = await sb.from('subcategorias_gasto')
        .update({ activa: true }).eq('id', previa.id).select().single();
      if (error) throw new Error(error.message);
      return data;
    }

    const { data, error } = await sb.from('subcategorias_gasto')
      .insert({ categoria, nombre: limpio, orden: 50 }).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function PATCH(req: Request) {
  return conManejo(async () => {
    const { id, nombre, activa } = (await req.json()) as
      { id?: string; nombre?: string; activa?: boolean };
    if (!id) throw new Error('Falta el id.');

    const fila: Record<string, unknown> = {};
    if (nombre !== undefined) {
      const limpio = String(nombre).trim();
      if (!limpio) throw new Error('El nombre no puede quedar vacío.');
      fila.nombre = limpio;
    }
    if (activa !== undefined) fila.activa = activa;
    if (Object.keys(fila).length === 0) throw new Error('No hay nada que cambiar.');

    const { data, error } = await db().from('subcategorias_gasto')
      .update(fila).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}
