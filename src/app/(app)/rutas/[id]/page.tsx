import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { configVigente } from '@/lib/config';
import { calcularComisiones } from '@/lib/negocio';
import Detalle from './Detalle';
import type {
  Ruta, Envio, Gasto, Tripulante, Comision, Vehiculo, Contacto, RutaPnl,
  Cobro, SubcategoriaGasto,
} from '@/types';

/**
 * Lo que trae una migración que quizá todavía no se ha corrido. La pantalla
 * abre igual y el dato simplemente no aparece, en vez de tronar entera.
 */
async function opcional<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await p;
    return error ? null : data;
  } catch { return null; }
}

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  const sb = db();
  const [ruta, envios, gastos, tripulacion, comisiones, veh, cont, pnl] = await Promise.all([
    sb.from('rutas').select('*').eq('id', params.id).maybeSingle(),
    sb.from('envios').select('*').eq('ruta_id', params.id).order('secuencia'),
    sb.from('gastos').select('*').eq('ruta_id', params.id).order('fecha'),
    sb.from('ruta_tripulacion').select('*').eq('ruta_id', params.id),
    sb.from('comisiones').select('*').eq('ruta_id', params.id),
    sb.from('vehiculos').select('*').eq('activo', true).order('nombre'),
    sb.from('contactos').select('*').order('nombre'),
    // El P&L sale de la misma vista que alimenta la tabla de rutas. Antes esta
    // pantalla lo recalculaba a mano y se saltaba la renta de la unidad, así
    // que la utilidad nunca coincidía con la de la lista.
    sb.from('v_ruta_pnl_full').select('*').eq('ruta_id', params.id).maybeSingle(),
  ]);

  if (!ruta.data) notFound();

  const idsEnvio = (envios.data ?? []).map((e) => e.id);
  const idsGasto = (gastos.data ?? []).map((g) => g.id);

  const [cobro, cobros, subcats, adjEnvio, adjGasto] = await Promise.all([
    // Cuánto de lo vendido en esta ruta ya entró (fase4).
    opcional<{ por_cobrar: number }>(
      sb.from('v_ruta_cobro').select('*').eq('ruta_id', params.id).maybeSingle()),
    // El desglose de cómo se pagó cada misión (fase6).
    idsEnvio.length
      ? opcional<Cobro[]>(sb.from('cobros').select('*').in('envio_id', idsEnvio))
      : Promise.resolve([] as Cobro[]),
    opcional<SubcategoriaGasto[]>(sb.from('subcategorias_gasto').select('*').eq('activa', true)
      .order('categoria').order('orden').order('nombre')),
    // Solo el conteo de evidencias: la lista se pide al abrir cada renglón,
    // que es cuando de verdad se necesita.
    idsEnvio.length
      ? opcional<{ envio_id: string }[]>(
          sb.from('adjuntos').select('envio_id').in('envio_id', idsEnvio))
      : Promise.resolve([]),
    idsGasto.length
      ? opcional<{ gasto_id: string }[]>(
          sb.from('adjuntos').select('gasto_id').in('gasto_id', idsGasto))
      : Promise.resolve([]),
  ]);

  const contar = (filas: Record<string, string>[] | null, campo: string) => {
    const n: Record<string, number> = {};
    for (const f of filas ?? []) {
      const k = f[campo];
      if (k) n[k] = (n[k] ?? 0) + 1;
    }
    return n;
  };

  const contactos = (cont.data ?? []) as Contacto[];
  const activos = contactos.filter((c) => c.activo);
  // El mapa de nombres incluye a los dados de baja: una ruta vieja tiene que
  // seguir diciendo quién la manejó.
  const nombrePorId: Record<string, string> = Object.fromEntries(contactos.map((c) => [c.id, c.nombre]));

  // Mientras la ruta está abierta no hay comisiones en la base todavía. Se
  // calculan aquí solo para mostrar a cuánto ascenderían al cerrarla; no se
  // guardan ni entran en el P&L, que sigue siendo el de la vista.
  const listaEnvios = (envios.data ?? []) as Envio[];
  let comisionesEstimadas = 0;
  if (ruta.data.estado !== 'entregada') {
    const cfg = await configVigente(ruta.data.fecha);
    const mapa = new Map(contactos.map((c) => [c.id, c]));
    comisionesEstimadas = calcularComisiones({
      cfg,
      envios: listaEnvios.map((e) => ({ id: e.id, precio: Number(e.precio), vendedor_id: e.vendedor_id })),
      tripulacion: (tripulacion.data ?? []) as { contacto_id: string; rol: 'chofer' | 'ayudante' }[],
      contactos: mapa,
    }).reduce((s, c) => s + Number(c.monto), 0);
  }

  return (
    <Detalle
      datos={{
        ruta: ruta.data as Ruta,
        envios: listaEnvios,
        gastos: (gastos.data ?? []) as Gasto[],
        tripulacion: (tripulacion.data ?? []) as Tripulante[],
        comisiones: (comisiones.data ?? []) as Comision[],
      }}
      pnl={(pnl.data ?? null) as RutaPnl | null}
      porCobrar={cobro ? Number(cobro.por_cobrar) : null}
      cobros={(cobros ?? []) as Cobro[]}
      subcategorias={(subcats ?? []) as SubcategoriaGasto[]}
      evidenciasEnvio={contar(adjEnvio, 'envio_id')}
      evidenciasGasto={contar(adjGasto, 'gasto_id')}
      fase6={subcats != null}
      comisionesEstimadas={comisionesEstimadas}
      vehiculos={(veh.data ?? []) as Vehiculo[]}
      choferes={activos.filter((c) => c.roles?.includes('chofer'))}
      ayudantes={activos.filter((c) => c.roles?.includes('ayudante'))}
      vendedores={activos.filter((c) => c.roles?.includes('vendedor'))}
      clientes={activos.filter((c) => c.roles?.includes('cliente_b2b') || c.roles?.includes('cliente_b2c'))}
      nombrePorId={nombrePorId}
    />
  );
}
