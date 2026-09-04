import { db } from '@/lib/db';
import Rutas, { type FilaRuta } from './Rutas';
import type { RutaPnl, Vehiculo, Contacto } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * La tabla necesita saber de un vistazo a dónde fue el viaje, para quién y con
 * quién. Eso vive en `envios` y `ruta_tripulacion`, no en la vista de P&L, así
 * que se arma aquí en vez de crear otra vista: son dos consultas planas y el
 * cruce en memoria cuesta nada para el volumen que maneja el negocio.
 */
export default async function Page() {
  const sb = db();
  const [rutas, veh, cont, envios, trip] = await Promise.all([
    sb.from('v_ruta_pnl_full').select('*').order('fecha', { ascending: false }).limit(500),
    sb.from('vehiculos').select('*').eq('activo', true).order('nombre'),
    sb.from('contactos').select('*').eq('activo', true).order('nombre'),
    sb.from('envios').select('ruta_id, secuencia, destino, cliente_id').order('secuencia'),
    sb.from('ruta_tripulacion').select('ruta_id, contacto_id, rol'),
  ]);

  // Cuánto de lo vendido ya entró. Vive en fase4.sql: si falta correrla, la
  // columna se apaga sola en vez de tumbar la pantalla.
  const cobros = await (async () => {
    try {
      const { data, error } = await sb.from('v_ruta_cobro').select('*');
      return error ? null : data;
    } catch { return null; }
  })();
  const cobroPorRuta = new Map(
    ((cobros ?? []) as { ruta_id: string; cobrado: number; por_cobrar: number }[])
      .map((c) => [c.ruta_id, c])
  );

  const contactos = (cont.data ?? []) as Contacto[];
  // Se consultan todos los contactos activos para los selectores, pero el
  // nombre de un chofer o cliente dado de baja también tiene que aparecer en
  // las rutas viejas; por eso el mapa se arma de una consulta sin filtro.
  const { data: todosContactos } = await sb.from('contactos').select('id, nombre');
  const nombrePorId: Record<string, string> = Object.fromEntries(
    (todosContactos ?? []).map((c) => [c.id, c.nombre])
  );

  // Misiones y tripulación agrupadas por ruta.
  const paradasPorRuta = new Map<string, { destino: string; cliente_id: string | null }[]>();
  for (const e of envios.data ?? []) {
    const lista = paradasPorRuta.get(e.ruta_id) ?? [];
    lista.push({ destino: e.destino, cliente_id: e.cliente_id });
    paradasPorRuta.set(e.ruta_id, lista);
  }
  const tripPorRuta = new Map<string, { chofer?: string; ayudantes: string[] }>();
  for (const t of trip.data ?? []) {
    const cur = tripPorRuta.get(t.ruta_id) ?? { ayudantes: [] };
    if (t.rol === 'chofer') cur.chofer = nombrePorId[t.contacto_id];
    else cur.ayudantes.push(nombrePorId[t.contacto_id] ?? '—');
    tripPorRuta.set(t.ruta_id, cur);
  }

  const filas: FilaRuta[] = ((rutas.data ?? []) as RutaPnl[]).map((r) => {
    const paradas = paradasPorRuta.get(r.ruta_id) ?? [];
    const clientes = [...new Set(paradas.map((p) => p.cliente_id).filter(Boolean))]
      .map((id) => nombrePorId[id as string]).filter(Boolean) as string[];
    const t = tripPorRuta.get(r.ruta_id);
    return {
      ...r,
      destinos: paradas.map((p) => p.destino),
      clientes,
      chofer: t?.chofer ?? null,
      ayudantes: t?.ayudantes ?? [],
      cobrado: cobroPorRuta.get(r.ruta_id)?.cobrado ?? null,
      porCobrar: cobroPorRuta.get(r.ruta_id)?.por_cobrar ?? null,
    };
  });

  return (
    <Rutas
      rutas={filas}
      vehiculos={(veh.data ?? []) as Vehiculo[]}
      choferes={contactos.filter((c) => c.roles?.includes('chofer'))}
      ayudantes={contactos.filter((c) => c.roles?.includes('ayudante'))}
      vendedores={contactos.filter((c) => c.roles?.includes('vendedor'))}
      clientes={contactos.filter(
        (c) => c.roles?.includes('cliente_b2b') || c.roles?.includes('cliente_b2c')
      )}
    />
  );
}
