import { dentro, type Rango } from '@/components/FiltroPeriodo';
import { etiquetaMetodo, esMetodo } from '@/lib/cobro';
import type { DatosDinero } from './datos';
import type { Movimiento } from './Movimientos';

/**
 * El flujo desarmado en renglones, para poder conciliar contra el banco.
 *
 * Cada entrada dice cómo se pagó, quién la tuvo y si tiene comprobante o se
 * está asumiendo: un flete de contado sin desglose se da por cobrado al
 * entregarse, y ahí es donde el sistema se separa de la cuenta real cuando el
 * cliente pagó de menos o pagó por transferencia.
 */
export function construirMovimientos(d: DatosDinero, rango: Rango): Movimiento[] {
  const enRango = (f: string | null | undefined) => !!f && dentro(f, rango);
  const folio = (rutaId: string) => d.folioPorRuta[rutaId] ?? '—';
  // Vacío = la caja. Se resuelve a nombre para poder marcarlo en el renglón.
  const quien = (id?: string | null, otro?: string | null) =>
    id ? (d.nombrePorId[id] ?? 'otra persona') : (otro?.trim() || null);

  const ms: Movimiento[] = [];

  for (const e of d.enviosCobro) {
    // Con desglose, el dinero entra por las filas de `cobros` de más abajo;
    // contarlo también aquí sería contarlo dos veces.
    if (e.a_credito || e.cobro_detallado || Number(e.cobrado) <= 0 || !enRango(e.fecha)) continue;
    ms.push({
      id: `envio-${e.envio_id}`, fecha: e.fecha, tipo: 'entrada',
      concepto: `Flete #${folio(e.ruta_id)} · ${e.destino}`,
      detalle: `contado${e.cliente_id ? ` · ${d.nombrePorId[e.cliente_id] ?? ''}` : ''} · se da por cobrado al entregar`,
      monto: Number(e.cobrado), supuesto: true,
      rutaId: e.ruta_id, envioId: e.envio_id, precio: Number(e.venta),
      aCredito: e.a_credito, destino: e.destino,
      enManosDe: quien(e.cobrado_por, e.cobrado_por_otro),
    });
  }

  const envioPorId = new Map(d.enviosCobro.map((e) => [e.envio_id, e]));
  for (const c of d.cobrosTodos) {
    if (!enRango(c.fecha)) continue;
    const e = envioPorId.get(c.envio_id);
    ms.push({
      id: `cobro-${c.id}`, fecha: c.fecha, tipo: 'entrada',
      concepto: e ? `Cobro #${folio(e.ruta_id)} · ${e.destino}` : 'Cobro de flete',
      detalle: `${etiquetaMetodo(c.metodo)}${esMetodo(c.metodo) ? '' : ' · cobro registrado'}`,
      monto: Number(c.monto), rutaId: e?.ruta_id,
      envioId: c.envio_id, precio: e ? Number(e.venta) : undefined,
      aCredito: e?.a_credito ?? false, destino: e?.destino,
      metodo: c.metodo,
      enManosDe: quien(c.recibido_por, c.recibido_por_otro),
    });
  }

  for (const g of d.gastosTodos) {
    if (!enRango(g.fecha)) continue;
    ms.push({
      id: `gasto-${g.id}`, fecha: g.fecha, tipo: 'salida',
      concepto: `${g.categoria.charAt(0).toUpperCase()}${g.categoria.slice(1)}${g.ruta_id ? ` · #${folio(g.ruta_id)}` : ''}`,
      detalle: g.descripcion ?? (g.ruta_id ? 'gasto de viaje' : `${g.tipo} · fuera de ruta`),
      monto: Number(g.monto), rutaId: g.ruta_id ?? undefined,
      metodo: g.metodo_pago ?? null,
      enManosDe: quien(g.pagado_por, g.pagado_por_otro),
    });
  }

  for (const c of d.comisionesPagadas) {
    if (!enRango(c.fecha_pago)) continue;
    ms.push({
      id: `comision-${c.id}`, fecha: c.fecha_pago!, tipo: 'salida',
      concepto: `Comisión · ${d.nombrePorId[c.contacto_id] ?? '—'}`,
      detalle: `${c.rol} · ruta #${folio(c.ruta_id)}`,
      monto: Number(c.monto), rutaId: c.ruta_id,
    });
  }

  for (const p of d.pagosRenta) {
    if (!enRango(p.fecha)) continue;
    const enTienda = p.concepto === 'cobrado_en_tienda';
    ms.push({
      id: `renta-${p.id}`, fecha: p.fecha, tipo: 'salida',
      concepto: enTienda ? 'Fondo de renta · abono de la tienda' : `Fondo de renta · ${p.concepto}`,
      // El abono de lo cobrado en tienda no toca tu caja: ese dinero nunca
      // estuvo ahí. Va marcado para que al conciliar no se busque una salida
      // que el banco jamás va a mostrar.
      detalle: enTienda
        ? 'no sale de tu caja: la tienda ya tenía ese dinero'
        : [p.metodo, p.referencia].filter(Boolean).join(' · ') || 'salida del fondo',
      monto: Number(p.monto),
      metodo: enTienda ? 'tienda' : p.metodo,
      fueraDeCaja: enTienda,
    });
  }

  return ms;
}
