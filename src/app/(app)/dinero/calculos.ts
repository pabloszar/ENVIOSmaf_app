import { dentro, type Rango } from '@/components/FiltroPeriodo';
import { METODOS, type Metodo, esMetodo } from '@/lib/cobro';
import type { DatosDinero } from './datos';

/**
 * Las cifras del periodo, calculadas una sola vez y en un solo lugar.
 *
 * Vivían dentro de la pantalla de Dinero cuando era una sola. Al partirla en
 * tres, dejarlas ahí habría significado tres copias de la misma aritmética, y
 * la primera vez que una se corrigiera sin las otras, dos pantallas darían
 * cifras distintas del mismo dinero.
 */

export interface Flujo {
  vendiste: number;
  entro: number;
  salio: number;
  quedo: number;
  faltaEntrar: number;
}

export interface Saldos {
  teDeben: number;
  comisiones: number;
  fondoRenta: number;
  enOtrasManos: number;
  cuentasAbiertas: number;
  cuentasVencidas: number;
  cuentasTotales: number;
  personasConComision: number;
  /** Lo de antes del periodo: se declara aparte, nunca se esconde. */
  fuera: { teDeben: number; comisiones: number; fondoRenta: number; caja: number };
}

/** Cuánto quedó de cada forma de pago, dentro del periodo. */
export interface PorMetodo {
  metodo: Metodo | 'sin_especificar';
  entradas: number;
  salidas: number;
  saldo: number;
}

const enRango = (f: string | null | undefined, r: Rango) => !!f && dentro(f, r);
const suma = <T,>(xs: T[], n: (x: T) => number) => xs.reduce((s, x) => s + n(x), 0);

export function calcularFlujo(d: DatosDinero, rango: Rango): Flujo {
  const delPeriodo = d.enviosCobro.filter((e) => enRango(e.fecha, rango));
  const vendiste = suma(delPeriodo, (e) => Number(e.venta));
  const cobradoDeEsaVenta = suma(delPeriodo, (e) => Number(e.cobrado));

  // Lo cobrado de contado entra el día del viaje; el crédito, y ahora también
  // el desglose, traen su propia fecha en `cobros`.
  const entroContado = suma(
    delPeriodo.filter((e) => !e.a_credito && !e.cobro_detallado),
    (e) => Number(e.cobrado));
  const entroCapturado = suma(
    d.cobrosTodos.filter((c) => enRango(c.fecha, rango)), (c) => Number(c.monto));

  const salio =
    suma(d.gastosTodos.filter((g) => enRango(g.fecha, rango)), (g) => Number(g.monto))
    + suma(d.comisionesPagadas.filter((c) => enRango(c.fecha_pago, rango)), (c) => Number(c.monto))
    // El abono de lo cobrado en tienda no sale de tu dinero: ese dinero nunca
    // llegó. Contarlo como salida haría aparecer un gasto que no existe.
    + suma(d.pagosRenta.filter((p) =>
        enRango(p.fecha, rango) && p.concepto !== 'cobrado_en_tienda'), (p) => Number(p.monto));

  const entro = entroContado + entroCapturado;
  return {
    vendiste, entro, salio,
    quedo: entro - salio,
    faltaEntrar: Math.max(0, vendiste - cobradoDeEsaVenta),
  };
}

/**
 * Los saldos también se cortan por fecha, porque la gestión de la unidad
 * empieza en un día concreto y el acumulado de antes no habla de ella.
 *
 * Lo que queda fuera no se descarta: se suma aparte y la pantalla lo declara.
 * Una comisión de mayo se sigue debiendo aunque el filtro esté en junio, y
 * dejar que desaparezca al mover una fecha sería el peor error posible en una
 * pantalla de dinero.
 */
export function calcularSaldos(d: DatosDinero, rango: Rango, flujo: Flujo): Saldos {
  const parte = <T,>(filas: T[], fecha: (x: T) => string | null, monto: (x: T) => number) => {
    let dentroP = 0, fueraP = 0;
    for (const x of filas) {
      if (enRango(fecha(x), rango)) dentroP += monto(x);
      else fueraP += monto(x);
    }
    return { dentro: dentroP, fuera: fueraP };
  };

  const devengado = parte(d.rentas, (r) => r.fecha, (r) => Number(r.renta_unidad));
  const salidasFondo = parte(d.pagosRenta, (p) => p.fecha, (p) => Number(p.monto));
  const coms = parte(d.comisionesDetalle, (c) => c.fecha, (c) => Number(c.monto));
  const deudas = parte(d.cxc, (c) => c.fecha, (c) => Number(c.saldo));

  // Lo que la operación dejó fuera del periodo. Se arma de los movimientos
  // crudos y no del corte mensual: con un rango que empieza el día 5, la fila
  // del mes caería entera de un lado y la cifra mentiría.
  const entroFuera =
    suma(d.enviosCobro.filter((e) =>
      !e.a_credito && !e.cobro_detallado && !enRango(e.fecha, rango)), (e) => Number(e.cobrado))
    + suma(d.cobrosTodos.filter((c) => !enRango(c.fecha, rango)), (c) => Number(c.monto));
  const salioFuera =
    suma(d.gastosTodos.filter((g) => !enRango(g.fecha, rango)), (g) => Number(g.monto))
    + suma(d.comisionesPagadas.filter((c) => !enRango(c.fecha_pago, rango)), (c) => Number(c.monto))
    + suma(d.pagosRenta.filter((p) =>
        !enRango(p.fecha, rango) && p.concepto !== 'cobrado_en_tienda'), (p) => Number(p.monto));

  // Dinero del negocio que no está en tu caja: lo trae alguien más. Solo las
  // cuentas a tu favor; las que están a mano no son "otras manos".
  const abiertas = d.custodia.filter((c) => c.custodio !== 'caja' && c.saldo > 0.5);
  const enPeriodo = d.cxc.filter((c) => enRango(c.fecha, rango));

  return {
    teDeben: deudas.dentro,
    comisiones: coms.dentro,
    fondoRenta: Math.max(0, devengado.dentro - salidasFondo.dentro),
    enOtrasManos: suma(abiertas, (c) => c.saldo),
    cuentasAbiertas: abiertas.length,
    cuentasVencidas: enPeriodo.filter((c) => c.vencido).length,
    cuentasTotales: enPeriodo.length,
    personasConComision: new Set(
      d.comisionesDetalle.filter((c) => enRango(c.fecha, rango)).map((c) => c.contacto_id)
    ).size,
    fuera: {
      teDeben: deudas.fuera,
      comisiones: coms.fuera,
      fondoRenta: Math.max(0, devengado.fuera - salidasFondo.fuera),
      caja: entroFuera - salioFuera,
    },
  };
}

/**
 * Dónde quedó el dinero del periodo, forma de pago por forma de pago.
 *
 * Es la respuesta a "cuánto de esto debería estar en el banco". Lo que no
 * dice cómo se pagó cae en `sin_especificar`, que es justo lo que hay que ir
 * capturando para que la cuenta cuadre contra el estado de cuenta.
 */
export function calcularPorMetodo(d: DatosDinero, rango: Rango): PorMetodo[] {
  const acc = new Map<string, { entradas: number; salidas: number }>();
  const bolsa = (m: string | null | undefined) => {
    const k = esMetodo(m) ? m : 'sin_especificar';
    if (!acc.has(k)) acc.set(k, { entradas: 0, salidas: 0 });
    return acc.get(k)!;
  };

  // Fletes de contado sin desglose: entraron, pero nadie dijo cómo.
  for (const e of d.enviosCobro) {
    if (e.a_credito || e.cobro_detallado || !enRango(e.fecha, rango)) continue;
    if (Number(e.cobrado) > 0) bolsa(null).entradas += Number(e.cobrado);
  }
  for (const c of d.cobrosTodos) {
    if (enRango(c.fecha, rango)) bolsa(c.metodo).entradas += Number(c.monto);
  }
  for (const g of d.gastosTodos) {
    if (enRango(g.fecha, rango)) bolsa(g.metodo_pago).salidas += Number(g.monto);
  }
  for (const c of d.comisionesPagadas) {
    if (enRango(c.fecha_pago, rango)) bolsa(null).salidas += Number(c.monto);
  }
  for (const p of d.pagosRenta) {
    if (!enRango(p.fecha, rango)) continue;
    // El abono de lo cobrado en tienda sale de la bolsa de la tienda, no de la
    // tuya: ese dinero nunca pasó por tu caja ni por tu banco.
    bolsa(p.concepto === 'cobrado_en_tienda' ? 'tienda' : p.metodo).salidas += Number(p.monto);
  }

  const orden = [...METODOS, 'sin_especificar'] as const;
  return orden
    .map((m) => {
      const v = acc.get(m) ?? { entradas: 0, salidas: 0 };
      return { metodo: m, entradas: v.entradas, salidas: v.salidas, saldo: v.entradas - v.salidas };
    })
    .filter((x) => x.entradas !== 0 || x.salidas !== 0);
}
