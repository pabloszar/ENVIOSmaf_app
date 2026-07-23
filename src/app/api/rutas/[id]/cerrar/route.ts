import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';
import { configVigente } from '@/lib/config';
import { calcularComisiones, pctComisionDe } from '@/lib/negocio';
import type { Contacto } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Cierra una ruta:
 *   1. Congela un snapshot de la configuración vigente a la fecha de la ruta.
 *   2. Genera las comisiones de chofer, ayudantes y vendedores.
 *   3. Marca la ruta como entregada.
 *
 * Es reversible con ?reabrir=1: borra las comisiones devengadas (no las ya
 * pagadas) y limpia el cierre, por si hay que corregir algo.
 *
 * Idempotente: si ya estaba cerrada, primero limpia las comisiones devengadas
 * para no duplicarlas.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const reabrir = url.searchParams.get('reabrir') === '1';

  return conManejo(async () => {
    const sb = db();

    if (reabrir) {
      const { error: e1 } = await sb
        .from('comisiones').delete().eq('ruta_id', params.id).eq('estado', 'devengada');
      if (e1) throw new Error(e1.message);
      const { data, error } = await sb
        .from('rutas').update({ estado: 'agendada', cerrada_en: null }).eq('id', params.id).select().single();
      if (error) throw new Error(error.message);
      return { reabierta: true, ruta: data };
    }

    const { data: ruta, error: eR } = await sb.from('rutas').select('*').eq('id', params.id).single();
    if (eR) throw new Error(eR.message);

    const [{ data: envios, error: eE }, { data: tripulacion, error: eT }] = await Promise.all([
      sb.from('envios').select('id, precio, vendedor_id').eq('ruta_id', params.id),
      sb.from('ruta_tripulacion').select('contacto_id, rol').eq('ruta_id', params.id),
    ]);
    if (eE) throw new Error(eE.message);
    if (eT) throw new Error(eT.message);

    const cfg = await configVigente(ruta.fecha);

    // Contactos involucrados, para respetar sus porcentajes propios.
    const ids = new Set<string>();
    tripulacion?.forEach((t) => ids.add(t.contacto_id));
    envios?.forEach((e) => e.vendedor_id && ids.add(e.vendedor_id));
    const contactos = new Map<string, Contacto>();
    if (ids.size) {
      const { data: cs } = await sb.from('contactos').select('*').in('id', [...ids]);
      cs?.forEach((c) => contactos.set(c.id, c as Contacto));
    }

    const comisiones = calcularComisiones({
      cfg,
      envios: (envios ?? []).map((e) => ({ id: e.id, precio: Number(e.precio), vendedor_id: e.vendedor_id })),
      tripulacion: (tripulacion ?? []) as { contacto_id: string; rol: 'chofer' | 'ayudante' }[],
      contactos,
    });

    // Limpia comisiones devengadas previas (no las pagadas) antes de regenerar.
    await sb.from('comisiones').delete().eq('ruta_id', params.id).eq('estado', 'devengada');

    if (comisiones.length) {
      const filas = comisiones.map((c) => ({ ...c, ruta_id: params.id, estado: 'devengada' as const }));
      const { error } = await sb.from('comisiones').insert(filas);
      if (error) throw new Error(error.message);
    }

    // Congela el % de renta aplicado a cada tripulante, para el registro.
    for (const t of tripulacion ?? []) {
      const pct = pctComisionDe(contactos.get(t.contacto_id) ?? null, t.rol as 'chofer' | 'ayudante', cfg);
      await sb.from('ruta_tripulacion').update({ pct_aplicado: pct })
        .eq('ruta_id', params.id).eq('contacto_id', t.contacto_id).eq('rol', t.rol);
    }

    const { data, error } = await sb
      .from('rutas')
      .update({ estado: 'entregada', config_snapshot: cfg, cerrada_en: new Date().toISOString() })
      .eq('id', params.id).select().single();
    if (error) throw new Error(error.message);

    return { ruta: data, comisiones_generadas: comisiones.length };
  });
}
