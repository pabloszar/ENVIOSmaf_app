import { db } from '@/lib/db';
import type { ConfigNegocio } from '@/types';
import { PARAMS_DEFAULT } from '@/lib/pricing';

/**
 * La configuración vigente a una fecha: la fila de mayor `vigente_desde` que no
 * sea futura. Solo servidor.
 */
export async function configVigente(fecha?: string): Promise<ConfigNegocio> {
  const hasta = fecha ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await db()
    .from('config_negocio')
    .select('*')
    .lte('vigente_desde', hasta)
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`config_negocio: ${error.message}`);
  if (data) return normalizar(data as ConfigNegocio);

  // Sin filas: valores por defecto en memoria, para que la app no truene.
  return {
    id: 'default',
    vigente_desde: '2026-01-01',
    pct_venta: 5,
    pct_chofer: 12,
    pct_ayudante: 8,
    pct_admon: 8,
    pct_renta_propia: 25,
    pct_renta_rentada: 35,
    rendimiento_default_kml: 8,
    precio_litro: 25,
    params_pricing: PARAMS_DEFAULT,
    notas: null,
    creado_en: new Date().toISOString(),
  };
}

/** Postgres devuelve numeric como string; los volvemos números. */
function normalizar(c: ConfigNegocio): ConfigNegocio {
  const n = (v: unknown) => Number(v);
  return {
    ...c,
    pct_venta: n(c.pct_venta),
    pct_chofer: n(c.pct_chofer),
    pct_ayudante: n(c.pct_ayudante),
    pct_admon: n(c.pct_admon),
    pct_renta_propia: n(c.pct_renta_propia),
    pct_renta_rentada: n(c.pct_renta_rentada),
    rendimiento_default_kml: n(c.rendimiento_default_kml),
    precio_litro: n(c.precio_litro),
    params_pricing: { ...PARAMS_DEFAULT, ...(c.params_pricing ?? {}) },
  };
}
