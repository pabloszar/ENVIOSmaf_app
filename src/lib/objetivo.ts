import type { ConfigNegocio, Vehiculo } from '@/types';

/**
 * A dónde DEBERÍA ir cada peso, según la configuración del negocio.
 *
 * No sustituye al reparto real: lo acompaña. El real dice qué pasó; este dice
 * qué tenía que pasar. La diferencia entre los dos es la única cifra que se
 * puede accionar — el resto es historia.
 *
 * Cómo se arma cada concepto:
 *
 *   Renta de unidad   % del flete según el vehículo (35% rentada, 25% propia).
 *                     Ese dinero es de Tiendas MAF: se aparta en el fondo y de
 *                     ahí salen mantenimiento y trámites legales.
 *   Comisiones        chofer + ayudante + vendedor, a los % de la config.
 *   Administración    % fijo. Es utilidad del dueño, no una comisión por pagar,
 *                     pero se descuenta para medir el margen operativo.
 *   Gasolina          único concepto que NO es un %: sale de los kilómetros.
 *                     km ÷ rendimiento × precio del litro.
 *   Casetas y comida  la configuración no les pone presupuesto. Aparecen con
 *                     su gasto real y sin objetivo, en vez de inventarles uno.
 *
 * El objetivo de comisiones asume tripulación completa en cada viaje, que es
 * lo que el modelo describe. Si un viaje salió sin ayudante, lo real será
 * menor y esa diferencia es real: se ahorró ese pago.
 */

export interface Concepto {
  clave: string;
  etiqueta: string;
  /** Lo que la configuración dice que debería costar. `null` = sin presupuesto. */
  objetivo: number | null;
  /** Lo que de verdad costó. */
  real: number;
  /** Cómo se llegó al objetivo, en palabras. */
  regla: string;
  /** Un objetivo rebasado es malo salvo en la utilidad, donde de más es bueno. */
  masEsMejor?: boolean;
  /** Desglose interno del concepto, cuando lo tiene. */
  partes?: { etiqueta: string; monto: number; nota?: string }[];
}

export interface RutaObjetivo {
  ingreso: number;
  km_total: number | null;
  vehiculo_id: string | null;
  gasolina: number;
  casetas: number;
  comida: number;
  comisiones: number;
  renta_unidad: number;
  admon: number;
  gastos_directos: number;
}

export interface Reparto {
  venta: number;
  conceptos: Concepto[];
  /** Utilidad que quedaría si todo saliera según la configuración. */
  utilidadObjetivo: number;
  utilidadReal: number;
  /** Kilómetros y gasolina de las rutas que sí traen km — lo único comparable. */
  km: number;
  rutasConKm: number;
  rutasSinKm: number;
  gasolinaSinKm: number;
  /** Rendimiento que implican los datos reales, para contrastarlo con el configurado. */
  kmPorLitroReal: number | null;
  /** Viajes cerrados con los porcentajes en cero — el histórico del Excel. */
  rutasFueraDelModelo: number;
  ventaFueraDelModelo: number;
}

/** % de renta que aplica a una unidad: el suyo, el de su tipo, o cero. */
function pctRenta(v: Vehiculo | undefined, cfg: ConfigNegocio): number {
  if (v?.pct_renta != null) return Number(v.pct_renta);
  if (v?.propiedad === 'rentada') return Number(cfg.pct_renta_rentada);
  // Sin unidad asignada se asume propia, igual que hace v_ruta_pnl.
  return Number(cfg.pct_renta_propia);
}

/** Rendimiento de la unidad, o el default de la configuración. */
function rendimiento(v: Vehiculo | undefined, cfg: ConfigNegocio): number {
  const r = v?.rendimiento_kml != null ? Number(v.rendimiento_kml) : Number(cfg.rendimiento_default_kml);
  return r > 0 ? r : 1;
}

export function repartoObjetivo(
  rutas: RutaObjetivo[],
  vehiculos: Vehiculo[],
  cfg: ConfigNegocio,
): Reparto {
  const porId = new Map(vehiculos.map((v) => [v.id, v]));

  let venta = 0;
  let rentaObjetivo = 0;
  let gasolinaObjetivo = 0;
  let km = 0;
  let gasolinaConKm = 0;
  let gasolinaSinKm = 0;
  let rutasConKm = 0;
  let rutasSinKm = 0;
  const real = { gasolina: 0, casetas: 0, comida: 0, comisiones: 0, renta: 0, admon: 0, gastos: 0 };
  // Viajes que nunca corrieron bajo el modelo de porcentajes: el histórico del
  // Excel se importó con la configuración en ceros a propósito, porque en ese
  // periodo al ayudante se le pagaba fijo y el chofer no cobraba comisión.
  // Compararlos contra los porcentajes de hoy no mide una fuga, mide un cambio
  // de reglas — y sin decirlo, el desvío parece un ahorro que nunca existió.
  let rutasFueraDelModelo = 0;
  let ventaFueraDelModelo = 0;

  for (const r of rutas) {
    const v = r.vehiculo_id ? porId.get(r.vehiculo_id) : undefined;
    venta += Number(r.ingreso);
    rentaObjetivo += (Number(r.ingreso) * pctRenta(v, cfg)) / 100;

    const kmRuta = Number(r.km_total ?? 0);
    if (kmRuta > 0) {
      km += kmRuta;
      rutasConKm++;
      gasolinaConKm += Number(r.gasolina);
      gasolinaObjetivo += (kmRuta / rendimiento(v, cfg)) * Number(cfg.precio_litro);
    } else {
      rutasSinKm++;
      gasolinaSinKm += Number(r.gasolina);
    }

    real.gasolina += Number(r.gasolina);
    real.casetas += Number(r.casetas);
    real.comida += Number(r.comida);
    real.comisiones += Number(r.comisiones);
    real.renta += Number(r.renta_unidad);
    real.admon += Number(r.admon);
    real.gastos += Number(r.gastos_directos);

    if (Number(r.ingreso) > 0 && Number(r.renta_unidad) === 0 && Number(r.admon) === 0) {
      rutasFueraDelModelo++;
      ventaFueraDelModelo += Number(r.ingreso);
    }
  }

  const pct = (p: number) => (venta * Number(p)) / 100;
  const comisionesObjetivo = pct(cfg.pct_chofer) + pct(cfg.pct_ayudante) + pct(cfg.pct_venta);
  const admonObjetivo = pct(cfg.pct_admon);

  // El 25% que cubre mantenimiento y legales sale de la renta, no encima de
  // ella: por eso se muestra como partes del mismo concepto y no como otro.
  const pctProvision = Math.min(25, (rentaObjetivo / (venta || 1)) * 100);
  const provision = (venta * pctProvision) / 100;

  const conceptos: Concepto[] = [
    {
      clave: 'renta',
      etiqueta: 'Renta de unidad',
      objetivo: rentaObjetivo,
      real: real.renta,
      regla: `${redondear((rentaObjetivo / (venta || 1)) * 100)}% del flete · va al fondo de Tiendas MAF`,
      partes: [
        { etiqueta: 'Mantenimiento y legales', monto: provision, nota: 'lo que el fondo debe cubrir' },
        { etiqueta: 'Excedente del fondo', monto: rentaObjetivo - provision, nota: 'lo que sobra si no hay gastos' },
      ],
    },
    {
      clave: 'comisiones',
      etiqueta: 'Comisiones',
      objetivo: comisionesObjetivo,
      real: real.comisiones,
      regla: `chofer ${cfg.pct_chofer}% + ayudante ${cfg.pct_ayudante}% + vendedor ${cfg.pct_venta}%`,
      partes: [
        { etiqueta: 'Chofer', monto: pct(cfg.pct_chofer) },
        { etiqueta: 'Ayudante', monto: pct(cfg.pct_ayudante) },
        { etiqueta: 'Vendedor', monto: pct(cfg.pct_venta) },
      ],
    },
    {
      clave: 'admon',
      etiqueta: 'Administración',
      objetivo: admonObjetivo,
      real: real.admon,
      regla: `${cfg.pct_admon}% del flete · utilidad del dueño, no un pago`,
    },
    {
      clave: 'gasolina',
      etiqueta: 'Gasolina',
      objetivo: gasolinaObjetivo,
      real: gasolinaConKm,
      regla: `${Math.round(km).toLocaleString('es-MX')} km ÷ rendimiento × $${cfg.precio_litro} el litro`,
    },
    {
      clave: 'casetas',
      etiqueta: 'Casetas',
      objetivo: null,
      real: real.casetas,
      regla: 'la configuración no le pone presupuesto',
    },
    {
      clave: 'comida',
      etiqueta: 'Comida y viáticos',
      objetivo: null,
      real: real.comida,
      regla: 'la configuración no le pone presupuesto',
    },
  ];

  // La utilidad objetivo descuenta solo lo que el modelo sí presupuesta.
  // Casetas y comida se restan a su valor real: no tener presupuesto no las
  // vuelve gratis.
  const utilidadObjetivo =
    venta - rentaObjetivo - comisionesObjetivo - admonObjetivo - gasolinaObjetivo
    - real.casetas - real.comida;
  const utilidadReal = venta - real.gastos - real.comisiones - real.renta - real.admon;

  conceptos.push({
    clave: 'utilidad',
    etiqueta: 'Utilidad',
    objetivo: utilidadObjetivo,
    real: utilidadReal,
    regla: 'lo que queda si todo sale al modelo',
    masEsMejor: true,
  });

  const litros = km > 0 ? gasolinaConKm / Number(cfg.precio_litro) : 0;

  return {
    venta,
    conceptos,
    utilidadObjetivo,
    utilidadReal,
    km,
    rutasConKm,
    rutasSinKm,
    gasolinaSinKm,
    kmPorLitroReal: litros > 0 ? km / litros : null,
    rutasFueraDelModelo,
    ventaFueraDelModelo,
  };
}

function redondear(n: number): number {
  return Math.round(n * 10) / 10;
}
