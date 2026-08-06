import { db } from '@/lib/db';
import Dinero, {
  CxC, ComPorPagar, ComDetalle, CajaMes,
  MovVenta, MovGasto, MovSimple, MovComision,
} from './Dinero';
import type { Fondo, FondoUnidad, RentaRuta, PagoRenta } from './FondoRenta';
import type { Entrega } from './EnManosDe';

/** Fila cruda de v_saldo_custodia (fase5.sql). */
interface FilaCustodia {
  custodio: string; contacto_id: string | null; nombre_otro: string | null; nombre: string;
  cobrado: number; pagado: number; saldo: number; movimientos: number;
  ultimo_movimiento: string | null;
}
import type { Vehiculo, Gasto, Contacto, Comision, Ruta } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Lo que vive en fase4.sql se consulta con red: la pantalla tiene que abrir
 * aunque la migración todavía no se haya corrido. Sin esto, un solo
 * `relation does not exist` tumbaría toda la vista de Dinero.
 */
async function opcional<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await p;
    return error ? null : data;
  } catch {
    return null;
  }
}

export default async function Page() {
  const sb = db();
  const [cxc, coms, comsDet, rutas, fijos, caja, veh, cont,
    fondo, fondoUnidad, rentas, pagos,
    enviosCobro, gastosTodos, cobrosTodos, comisionesPagadas,
    custodia, entregas] = await Promise.all([
    sb.from('v_cuentas_por_cobrar').select('*').order('vencido', { ascending: false }).order('fecha'),
    sb.from('v_comisiones_por_pagar').select('*').order('total_devengado', { ascending: false }),
    sb.from('comisiones').select('*').eq('estado', 'devengada'),
    sb.from('rutas').select('id, folio, fecha'),
    sb.from('gastos').select('*').is('ruta_id', null).order('fecha', { ascending: false }).limit(500),
    sb.from('v_caja_mensual').select('*').limit(36),
    sb.from('vehiculos').select('*').order('nombre'),
    sb.from('contactos').select('id, nombre'),
    opcional(sb.from('v_fondo_renta').select('*').maybeSingle()),
    opcional(sb.from('v_fondo_renta_unidad').select('*').order('vehiculo')),
    opcional(sb.from('v_renta_por_ruta').select('*').order('fecha', { ascending: false }).limit(500)),
    opcional(sb.from('pagos_renta').select('*').order('fecha', { ascending: false }).limit(200)),
    // Movimientos crudos con su fecha: el panorama filtra por día, y el corte
    // mensual de v_caja_mensual no alcanza para un rango que empieza el 12.
    opcional(sb.from('v_envio_cobro').select('*')),
    sb.from('gastos').select('id, fecha, tipo, monto, categoria, descripcion, ruta_id').limit(2000),
    sb.from('cobros').select('id, envio_id, fecha, monto, metodo').limit(2000),
    sb.from('comisiones').select('id, contacto_id, rol, ruta_id, fecha_pago, monto')
      .eq('estado', 'pagada').limit(2000),
    // Fase 5: en manos de quién está el dinero.
    opcional(sb.from('v_saldo_custodia').select('*')),
    opcional(sb.from('entregas_efectivo').select('*').order('fecha', { ascending: false }).limit(300)),
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

  return (
    <Dinero
      cxc={(cxc.data ?? []) as CxC[]}
      comisiones={(coms.data ?? []) as ComPorPagar[]}
      comisionesDetalle={comisionesDetalle}
      gastosFijos={(fijos.data ?? []) as Gasto[]}
      caja={(caja.data ?? []) as CajaMes[]}
      vehiculos={(veh.data ?? []) as Vehiculo[]}
      nombrePorId={nombrePorId}
      folioPorRuta={Object.fromEntries(
        ((rutas.data ?? []) as Pick<Ruta, 'id' | 'folio'>[]).map((r) => [r.id, r.folio])
      )}
      fondo={fondo as Fondo | null}
      fondoUnidad={(fondoUnidad ?? []) as FondoUnidad[]}
      rentas={(rentas ?? []) as RentaRuta[]}
      pagosRenta={(pagos ?? []) as PagoRenta[]}
      enviosCobro={(enviosCobro ?? []) as MovVenta[]}
      gastosTodos={(gastosTodos.data ?? []) as MovGasto[]}
      cobrosTodos={(cobrosTodos.data ?? []) as MovSimple[]}
      comisionesPagadas={(comisionesPagadas.data ?? []) as MovComision[]}
      custodia={((custodia ?? []) as FilaCustodia[]).map((c) => ({
        custodio: c.custodio,
        contactoId: c.contacto_id,
        nombreOtro: c.nombre_otro,
        nombre: c.nombre,
        cobrado: Number(c.cobrado),
        pagado: Number(c.pagado),
        saldo: Number(c.saldo),
        movimientos: Number(c.movimientos),
        ultimo: c.ultimo_movimiento,
      }))}
      entregas={(entregas ?? []) as Entrega[]}
      fase5={custodia != null}
      contactos={(cont.data ?? []) as { id: string; nombre: string }[]}
    />
  );
}
