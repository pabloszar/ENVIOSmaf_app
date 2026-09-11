import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { exigirChofer, rutasDelChofer } from '@/lib/sesion';
import type { MisionChofer } from '@/types';
import Misiones from './Misiones';

export const dynamic = 'force-dynamic';

/**
 * Lo que el chofer trae hoy.
 *
 * Carga en el servidor, como el resto de la app: la pantalla llega con los
 * datos puestos en vez de pintarse vacía y luego pedirlos, que en una calle
 * con mala señal es la diferencia entre ver el viaje y ver un cargando.
 *
 * El filtro por chofer sale de la sesión firmada, nunca de la URL. Es la
 * segunda mitad del candado del middleware: aquel comprueba el camino, este
 * comprueba de quién es el viaje.
 */
export default async function ChoferHoy() {
  const { contactoId, nombre } = await exigirChofer().catch(() => {
    redirect('/chofer/entrar');
  });

  const mias = await rutasDelChofer(contactoId);
  if (mias.length === 0) return <Misiones nombre={nombre} misiones={[]} />;

  const { data, error } = await db()
    .from('v_mision_chofer')
    .select('*')
    .in('ruta_id', mias)
    // Cerradas fuera: eso es histórico, y vive en su propia pantalla.
    .neq('estado', 'entregada')
    .order('fecha')
    .order('secuencia');

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-6 text-center">
        <p className="text-sm leading-relaxed text-ink-mute">
          No se pudieron cargar tus misiones. Si esto sigue, avísale al
          administrador: puede faltar correr <code>supabase/fase8.sql</code>.
        </p>
      </main>
    );
  }

  return <Misiones nombre={nombre} misiones={(data ?? []) as MisionChofer[]} />;
}
