import { db } from '@/lib/db';
import { conManejo, limpiarNumericos, soloCampos } from '@/lib/api';

export const dynamic = 'force-dynamic';

const NUM = [
  'pct_venta', 'pct_chofer', 'pct_ayudante', 'pct_admon',
  'pct_renta_propia', 'pct_renta_rentada', 'rendimiento_default_kml', 'precio_litro',
];
const CAMPOS = [...NUM, 'vigente_desde', 'params_pricing', 'notas'];

export async function GET() {
  return conManejo(async () => {
    const { data, error } = await db()
      .from('config_negocio').select('*').order('vigente_desde', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });
}

/**
 * Guardar configuración crea SIEMPRE una fila nueva con su fecha de vigencia,
 * nunca sobrescribe. Así el histórico conserva los porcentajes con que se cerró
 * cada ruta. Si ya existe una fila con esa misma fecha, esa sí se actualiza.
 */
export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = limpiarNumericos(await req.json(), NUM);
    const fila = soloCampos(cuerpo, CAMPOS);
    fila.vigente_desde ??= new Date().toISOString().slice(0, 10);

    const sb = db();
    const { data: existe } = await sb
      .from('config_negocio').select('id').eq('vigente_desde', fila.vigente_desde).maybeSingle();

    if (existe) {
      const { data, error } = await sb
        .from('config_negocio').update(fila).eq('id', existe.id).select().single();
      if (error) throw new Error(error.message);
      return data;
    }

    const { data, error } = await sb.from('config_negocio').insert(fila).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}
