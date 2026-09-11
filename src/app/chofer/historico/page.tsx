import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { exigirChofer, rutasDelChofer } from '@/lib/sesion';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import type { MisionChofer } from '@/types';

export const dynamic = 'force-dynamic';

/** Un año hacia atrás. Más que eso ya no se consulta desde un teléfono. */
const CUANTAS = 300;

/**
 * Lo que ya entregó.
 *
 * De referencia y nada más: dónde fue, qué día y cuánto. Sin botones y sin
 * detalle — un viaje cerrado ya no se toca desde aquí, y llenar la pantalla de
 * cosas que no se pueden hacer solo estorba para lo único que se viene a
 * hacer, que es acordarse de si ya fue a esa dirección.
 */
export default async function Historico() {
  const { contactoId } = await exigirChofer().catch(() => {
    redirect('/chofer/entrar');
  });

  const mias = await rutasDelChofer(contactoId);
  const { data } = mias.length
    ? await db()
        .from('v_mision_chofer')
        .select('*')
        .in('ruta_id', mias)
        .eq('estado', 'entregada')
        .order('fecha', { ascending: false })
        .order('secuencia')
        .limit(CUANTAS)
    : { data: [] };

  const misiones = (data ?? []) as MisionChofer[];
  const porMes = agruparPorMes(misiones);

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.07]
        bg-surface-sunk/85 px-5 py-4 backdrop-blur-xl">
        <Link href="/chofer" className="text-sm text-ink-mute transition active:text-ink">
          ← Hoy
        </Link>
        <h1 className="text-base font-medium">Entregas anteriores</h1>
      </header>

      <main className="flex-1 px-5 py-5">
        {misiones.length === 0 && (
          <p className="pt-16 text-center text-sm text-ink-mute">
            Todavía no tienes viajes cerrados.
          </p>
        )}

        {porMes.map(([mes, suyas]) => (
          <section key={mes} className="mb-6">
            <h2 className="px-1 pb-2 text-xs uppercase tracking-[0.08em] text-ink-mute">
              {mes} · {suyas.length}
            </h2>
            <ul className="lamina divide-y divide-white/[0.05] overflow-hidden">
              {suyas.map((m) => (
                <li key={m.envio_id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-12 shrink-0 text-xs text-ink-mute">
                    {fechaCorta(m.fecha, false)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{m.destino}</span>
                    {m.cliente && (
                      <span className="block truncate text-xs text-ink-mute">{m.cliente}</span>
                    )}
                  </span>
                  <span className="cifra shrink-0 text-sm text-ink-soft">
                    {mxn(Number(m.precio))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Por mes, que es como se acuerda uno de un viaje: "el de marzo". */
function agruparPorMes(misiones: MisionChofer[]): [string, MisionChofer[]][] {
  const meses = new Map<string, MisionChofer[]>();
  for (const m of misiones) {
    const [a, mm] = m.fecha.slice(0, 7).split('-');
    const etiqueta = `${MESES[Number(mm) - 1]} ${a}`;
    meses.set(etiqueta, [...(meses.get(etiqueta) ?? []), m]);
  }
  return [...meses.entries()];
}
