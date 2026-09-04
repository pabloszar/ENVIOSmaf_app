import { db } from '@/lib/db';
import { configVigente } from '@/lib/config';
import Configuracion from './Configuracion';
import Subcategorias from './Subcategorias';
import type { SubcategoriaGasto } from '@/types';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const cfg = await configVigente();

  // La tabla llega con fase6. Si todavía no se corre, la pantalla abre igual y
  // el bloque de subcategorías dice qué falta, en vez de tronar entera.
  const subcategorias = await (async () => {
    try {
      const { data, error } = await db().from('subcategorias_gasto').select('*')
        .order('categoria').order('orden').order('nombre');
      return error ? null : (data as SubcategoriaGasto[]);
    } catch { return null; }
  })();

  return (
    <div className="space-y-6">
      <Configuracion inicial={cfg} />
      <Subcategorias subcategorias={subcategorias ?? []} disponible={subcategorias != null} />
    </div>
  );
}
