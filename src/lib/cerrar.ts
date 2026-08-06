import type { SupabaseClient } from '@supabase/supabase-js';
import { configVigente } from '@/lib/config';
import { calcularComisiones, pctComisionDe } from '@/lib/negocio';
import type { Contacto } from '@/types';

/**
 * Cerrar y reabrir una ruta.
 *
 * Vive aquí y no dentro de la API route porque hay dos caminos para cerrar una
 * ruta: el botón "Cerrar ruta" y el selector de estado. Antes solo el botón
 * generaba comisiones, así que marcar "entregada" desde el selector dejaba la
 * ruta cerrada de mentiras: sin config_snapshot y sin una sola comisión.
 * Con la lógica en un solo lugar, cualquier camino hace lo mismo.
 */

/**
 * Cierra la ruta:
 *   1. Congela el snapshot de la configuración vigente a la fecha del viaje.
 *   2. Genera las comisiones de chofer, ayudantes y vendedores.
 *   3. Marca la ruta como entregada.
 *
 * Idempotente: si ya estaba cerrada, borra las comisiones devengadas antes de
 * regenerarlas. Las ya pagadas no se tocan — ese dinero ya salió.
 */
export async function cerrarRuta(sb: SupabaseClient, rutaId: string) {
  const { data: ruta, error: eR } = await sb.from('rutas').select('*').eq('id', rutaId).single();
  if (eR) throw new Error(eR.message);

  const [{ data: envios, error: eE }, { data: tripulacion, error: eT }] = await Promise.all([
    sb.from('envios').select('id, precio, vendedor_id').eq('ruta_id', rutaId),
    sb.from('ruta_tripulacion').select('contacto_id, rol').eq('ruta_id', rutaId),
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

  await sb.from('comisiones').delete().eq('ruta_id', rutaId).eq('estado', 'devengada');

  if (comisiones.length) {
    const filas = comisiones.map((c) => ({ ...c, ruta_id: rutaId, estado: 'devengada' as const }));
    const { error } = await sb.from('comisiones').insert(filas);
    if (error) throw new Error(error.message);
  }

  // Congela el % aplicado a cada tripulante, para el registro.
  for (const t of tripulacion ?? []) {
    const pct = pctComisionDe(contactos.get(t.contacto_id) ?? null, t.rol as 'chofer' | 'ayudante', cfg);
    await sb.from('ruta_tripulacion').update({ pct_aplicado: pct })
      .eq('ruta_id', rutaId).eq('contacto_id', t.contacto_id).eq('rol', t.rol);
  }

  const { data, error } = await sb
    .from('rutas')
    .update({ estado: 'entregada', config_snapshot: cfg, cerrada_en: new Date().toISOString() })
    .eq('id', rutaId).select().single();
  if (error) throw new Error(error.message);

  return { ruta: data, comisiones_generadas: comisiones.length };
}

/**
 * Reabre la ruta: borra las comisiones devengadas y limpia el cierre.
 *
 * `estado` es a dónde va la ruta al reabrirse. Viene del selector cuando el
 * usuario mueve una ruta entregada a "en_curso", por ejemplo; el botón
 * "Reabrir" la manda a 'agendada'.
 *
 * El config_snapshot NO se borra: es el registro de con qué porcentajes se
 * cerró. Al volver a cerrar se sobrescribe con los vigentes a esa fecha.
 */
export async function reabrirRuta(sb: SupabaseClient, rutaId: string, estado = 'agendada') {
  const { error: e1 } = await sb
    .from('comisiones').delete().eq('ruta_id', rutaId).eq('estado', 'devengada');
  if (e1) throw new Error(e1.message);

  const { data, error } = await sb
    .from('rutas').update({ estado, cerrada_en: null }).eq('id', rutaId).select().single();
  if (error) throw new Error(error.message);

  return { reabierta: true, ruta: data };
}
