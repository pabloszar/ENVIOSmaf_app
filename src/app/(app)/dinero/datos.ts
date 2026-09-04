import { db } from '@/lib/db';
import type { Vehiculo, Gasto, Contacto, Comision, Ruta, SubcategoriaGasto } from '@/types';
import type {
  CxC, ComPorPagar, ComDetalle, CajaMes, MovVenta, MovGasto, MovCobro, MovComision,
  SaldoCustodia, Entrega, Fondo, FondoUnidad, RentaRuta, PagoRenta, CuentaTienda,
} from './tipos';

/**
 * Todo lo que necesita la sección Dinero, en una sola carga.
 *
 * Las tres páginas —Entra, Sale y Dónde está— piden lo mismo porque las tres
 * muestran arriba el mismo resumen del periodo, y ese resumen solo cuadra si
 * las tres suman sobre los mismos renglones. Partir la consulta por página
 * ahorraría poco (son cientos de filas, no millones) y abriría la puerta a que
 * dos pantallas den cifras distintas del mismo dinero, que es exactamente el
 * problema que esta sección existe para resolver.
 */

/** Fila cruda de v_saldo_custodia, antes de pasarla a camelCase. */
interface FilaCustodia {
  custodio: string; contacto_id: string | null; nombre_otro: string | null; nombre: string;
  cobrado: number; pagado: number; saldo: number; movimientos: number;
  ultimo_movimiento: string | null;
}

/**
 * Lo que trae una migración que quizá no se ha corrido. La pantalla abre igual
 * y el dato no aparece, en vez de que un `relation does not exist` tumbe toda
 * la sección.
 */
async function opcional<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await p;
    return error ? null : data;
  } catch { return null; }
}

export interface DatosDinero {
  cxc: CxC[];
  comisiones: ComPorPagar[];
  comisionesDetalle: ComDetalle[];
  gastosFijos: Gasto[];
  caja: CajaMes[];
  vehiculos: Vehiculo[];
  subcategorias: SubcategoriaGasto[];
  nombrePorId: Record<string, string>;
  folioPorRuta: Record<string, number>;
  contactos: { id: string; nombre: string }[];
  fondo: Fondo | null;
  fondoUnidad: FondoUnidad[];
  rentas: RentaRuta[];
  pagosRenta: PagoRenta[];
  enviosCobro: MovVenta[];
  gastosTodos: MovGasto[];
  cobrosTodos: MovCobro[];
  comisionesPagadas: MovComision[];
  custodia: SaldoCustodia[];
  entregas: Entrega[];
  cuentaTienda: CuentaTienda | null;
  /** Cuántas evidencias trae cada gasto, para poder marcarlo en la lista. */
  evidenciasGasto: Record<string, number>;
  fase5: boolean;
  fase6: boolean;
}

export async function cargarDinero(): Promise<DatosDinero> {
  const sb = db();
  const [cxc, coms, comsDet, rutas, fijos, caja, veh, cont,
    fondo, fondoUnidad, rentas, pagos,
    enviosCobro, gastosTodos, cobrosTodos, comisionesPagadas,
    custodia, entregas, cuentaTienda, subcats, adjuntos] = await Promise.all([
    sb.from('v_cuentas_por_cobrar').select('*').order('vencido', { ascending: false }).order('fecha'),
    sb.from('v_comisiones_por_pagar').select('*').order('total_devengado', { ascending: false }),
    sb.from('comisiones').select('*').eq('estado', 'devengada'),
    sb.from('rutas').select('id, folio, fecha'),
    sb.from('gastos').select('*').is('ruta_id', null).order('fecha', { ascending: false }).limit(500),
    sb.from('v_caja_mensual').select('*').limit(36),
    sb.from('vehiculos').select('*').order('nombre'),
    sb.from('contactos').select('id, nombre'),
    opcional<Fondo>(sb.from('v_fondo_renta').select('*').maybeSingle()),
    opcional<FondoUnidad[]>(sb.from('v_fondo_renta_unidad').select('*').order('vehiculo')),
    opcional<RentaRuta[]>(sb.from('v_renta_por_ruta').select('*')
      .order('fecha', { ascending: false }).limit(500)),
    opcional<PagoRenta[]>(sb.from('pagos_renta').select('*')
      .order('fecha', { ascending: false }).limit(200)),
    // Movimientos crudos con su fecha: el resumen filtra por día, y el corte
    // mensual de v_caja_mensual no alcanza para un rango que empieza el 12.
    opcional<MovVenta[]>(sb.from('v_envio_cobro').select('*')),
    sb.from('gastos')
      .select('id, fecha, tipo, monto, categoria, descripcion, ruta_id, metodo_pago, pagado_por, pagado_por_otro')
      .limit(2000),
    sb.from('cobros').select('*').limit(2000),
    sb.from('comisiones').select('id, contacto_id, rol, ruta_id, fecha_pago, monto')
      .eq('estado', 'pagada').limit(2000),
    opcional<FilaCustodia[]>(sb.from('v_saldo_custodia').select('*')),
    opcional<Entrega[]>(sb.from('entregas_efectivo').select('*')
      .order('fecha', { ascending: false }).limit(300)),
    opcional<CuentaTienda>(sb.from('v_cuenta_tienda').select('*').maybeSingle()),
    opcional<SubcategoriaGasto[]>(sb.from('subcategorias_gasto').select('*').eq('activa', true)
      .order('categoria').order('orden').order('nombre')),
    // Solo el conteo: la lista de cada gasto se pide al abrir su renglón.
    opcional<{ gasto_id: string | null }[]>(
      sb.from('adjuntos').select('gasto_id').not('gasto_id', 'is', null).limit(2000)),
  ]);

  // vehiculos y contactos comparten el mapa de nombres para gastos por unidad.
  const nombrePorId: Record<string, string> = {};
  for (const v of (veh.data ?? []) as Vehiculo[]) nombrePorId[v.id] = v.nombre;
  for (const c of (cont.data ?? []) as Pick<Contacto, 'id' | 'nombre'>[]) nombrePorId[c.id] = c.nombre;

  // El detalle de cada comisión se muestra con el folio de su ruta, para que
  // pagar por partes no obligue a adivinar de qué viaje viene cada monto.
  const rutaPorId = new Map(
    ((rutas.data ?? []) as Pick<Ruta, 'id' | 'folio' | 'fecha'>[]).map((r) => [r.id, r])
  );
  const comisionesDetalle: ComDetalle[] = ((comsDet.data ?? []) as Comision[])
    .map((c) => ({
      id: c.id, contacto_id: c.contacto_id, ruta_id: c.ruta_id, rol: c.rol, monto: c.monto,
      folio: rutaPorId.get(c.ruta_id)?.folio ?? null,
      fecha: rutaPorId.get(c.ruta_id)?.fecha ?? null,
    }))
    .sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));

  return {
    cxc: (cxc.data ?? []) as CxC[],
    comisiones: (coms.data ?? []) as ComPorPagar[],
    comisionesDetalle,
    gastosFijos: (fijos.data ?? []) as Gasto[],
    caja: (caja.data ?? []) as CajaMes[],
    vehiculos: (veh.data ?? []) as Vehiculo[],
    subcategorias: (subcats ?? []) as SubcategoriaGasto[],
    nombrePorId,
    folioPorRuta: Object.fromEntries(
      ((rutas.data ?? []) as Pick<Ruta, 'id' | 'folio'>[]).map((r) => [r.id, r.folio])
    ),
    contactos: (cont.data ?? []) as { id: string; nombre: string }[],
    fondo: fondo ?? null,
    fondoUnidad: fondoUnidad ?? [],
    rentas: rentas ?? [],
    pagosRenta: pagos ?? [],
    enviosCobro: enviosCobro ?? [],
    gastosTodos: (gastosTodos.data ?? []) as MovGasto[],
    cobrosTodos: (cobrosTodos.data ?? []) as MovCobro[],
    comisionesPagadas: (comisionesPagadas.data ?? []) as MovComision[],
    custodia: ((custodia ?? []) as FilaCustodia[]).map((c) => ({
      custodio: c.custodio,
      contactoId: c.contacto_id,
      nombreOtro: c.nombre_otro,
      nombre: c.nombre,
      cobrado: Number(c.cobrado),
      pagado: Number(c.pagado),
      saldo: Number(c.saldo),
      movimientos: Number(c.movimientos),
      ultimo: c.ultimo_movimiento,
    })),
    entregas: entregas ?? [],
    cuentaTienda: cuentaTienda ?? null,
    evidenciasGasto: (adjuntos ?? []).reduce<Record<string, number>>((n, a) => {
      if (a.gasto_id) n[a.gasto_id] = (n[a.gasto_id] ?? 0) + 1;
      return n;
    }, {}),
    fase5: custodia != null,
    fase6: subcats != null,
  };
}
