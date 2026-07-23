// ════════════════════════════════════════════════════════════════════════════
// MOTOR 2 — Modelo de reparto por porcentajes
//
// Es la lógica de la Calculadora Flete, ahora como fuente de verdad del
// reparto de cada peso que entra: cuánto es renta de la unidad, cuánto
// comisión de cada persona, cuánto administración y cuánto queda de utilidad.
//
// De aquí salen dos cosas:
//   1. El precio MÍNIMO que debe cobrar un flete para no perder dinero.
//   2. Las comisiones que se generan al cerrar una ruta.
// ════════════════════════════════════════════════════════════════════════════

import type {
  ConfigNegocio, Contacto, RolComision, Vehiculo, Propiedad,
} from '@/types';

// ── Gasolina ────────────────────────────────────────────────────────────────

/** Costo de gasolina de un viaje: km / rendimiento × precio del litro. */
export function costoGasolina(km: number, rendimientoKml: number, precioLitro: number): number {
  if (rendimientoKml <= 0) return 0;
  return (km / rendimientoKml) * precioLitro;
}

/** El rendimiento de la unidad, o el default de la configuración. */
export function rendimientoDe(v: Vehiculo | null, cfg: ConfigNegocio): number {
  return v?.rendimiento_kml ?? cfg.rendimiento_default_kml;
}

/** El % de renta de la unidad: el suyo, o el default según propiedad. */
export function pctRentaDe(v: Vehiculo | null, cfg: ConfigNegocio): number {
  if (v?.pct_renta != null) return v.pct_renta;
  const propiedad: Propiedad = v?.propiedad ?? 'propia';
  return propiedad === 'rentada' ? cfg.pct_renta_rentada : cfg.pct_renta_propia;
}

/** El % de comisión de una persona en un rol: el suyo, o el default. */
export function pctComisionDe(c: Contacto | null, rol: RolComision, cfg: ConfigNegocio): number {
  const propio = c?.pct_override?.[rol];
  if (propio != null) return propio;
  return rol === 'chofer' ? cfg.pct_chofer
       : rol === 'ayudante' ? cfg.pct_ayudante
       : cfg.pct_venta;
}

// ── Desglose de un flete ────────────────────────────────────────────────────

export interface EntradaDesglose {
  precio: number;
  km: number;
  /** Gastos del viaje ya conocidos (casetas, comida). La gasolina se estima. */
  casetas?: number;
  comida?: number;
  otros?: number;
  /** Si se da, se usa en vez de la gasolina estimada. */
  gasolinaReal?: number;
  numAyudantes?: number;
  /** Margen que quieres que quede al negocio, en %. Por defecto 15. */
  margenObjetivo?: number;
  pctRenta: number;
  pctVenta: number;
  pctChofer: number;
  pctAyudante: number;
  pctAdmon: number;
  rendimientoKml: number;
  precioLitro: number;
}

export interface Desglose {
  precio: number;
  renta: number;
  venta: number;
  chofer: number;
  ayudante: number;
  admon: number;
  gasolina: number;
  casetas: number;
  comida: number;
  otros: number;
  /** Suma de gastos que no dependen del precio. */
  gastosFijos: number;
  /** Suma de todo lo que se reparte por porcentaje. */
  repartoPorcentual: number;
  utilidad: number;
  margenPct: number;
  /** Suma de los porcentajes. Arriba de 70 el modelo es insostenible. */
  sumaPct: number;
  /** Punto de equilibrio: abajo de aquí el viaje pierde dinero. */
  precioMinimo: number | null;
  /** Precio que además deja el margen objetivo. Es el que conviene cobrar. */
  precioObjetivo: number | null;
  salud: 'sano' | 'apretado' | 'insostenible';
}

/**
 * Reparte un flete. Es la misma cuenta de la Calculadora Flete, con dos
 * añadidos: soporta N ayudantes y acepta la gasolina real si ya se capturó.
 */
export function desglosarFlete(e: EntradaDesglose): Desglose {
  const precio = e.precio;
  const numAyudantes = e.numAyudantes ?? 1;

  const renta    = (precio * e.pctRenta) / 100;
  const venta    = (precio * e.pctVenta) / 100;
  const chofer   = (precio * e.pctChofer) / 100;
  const ayudante = (precio * e.pctAyudante * numAyudantes) / 100;
  const admon    = (precio * e.pctAdmon) / 100;

  const gasolina = e.gasolinaReal ?? costoGasolina(e.km, e.rendimientoKml, e.precioLitro);
  const casetas  = e.casetas ?? 0;
  const comida   = e.comida ?? 0;
  const otros    = e.otros ?? 0;

  const gastosFijos = gasolina + casetas + comida + otros;
  const repartoPorcentual = renta + venta + chofer + ayudante + admon;
  const utilidad = precio - repartoPorcentual - gastosFijos;

  const sumaPct =
    e.pctRenta + e.pctVenta + e.pctChofer + e.pctAyudante * numAyudantes + e.pctAdmon;

  // Punto de equilibrio: el precio en que la utilidad llega a cero.
  //   P = repartoPct·P + gastosFijos  →  P = gastosFijos / (1 − sumaPct/100)
  const denom = 1 - sumaPct / 100;
  const precioMinimo = denom > 0 ? gastosFijos / denom : null;

  // Precio objetivo: el que además deja el margen que quieres.
  //   P = repartoPct·P + gastosFijos + objetivo·P
  const margenObjetivo = e.margenObjetivo ?? 15;
  const denomObj = denom - margenObjetivo / 100;
  const precioObjetivo = denomObj > 0 ? gastosFijos / denomObj : null;

  return {
    precio, renta, venta, chofer, ayudante, admon,
    gasolina, casetas, comida, otros,
    gastosFijos, repartoPorcentual, utilidad,
    margenPct: precio > 0 ? (utilidad / precio) * 100 : 0,
    sumaPct,
    precioMinimo,
    precioObjetivo,
    salud: sumaPct > 70 ? 'insostenible' : sumaPct > 60 ? 'apretado' : 'sano',
  };
}

/** Construye la entrada del desglose a partir de la configuración vigente. */
export function desglosePorConfig(
  cfg: ConfigNegocio,
  args: {
    precio: number;
    km: number;
    vehiculo?: Vehiculo | null;
    numAyudantes?: number;
    casetas?: number;
    comida?: number;
    otros?: number;
    gasolinaReal?: number;
    margenObjetivo?: number;
  }
): Desglose {
  return desglosarFlete({
    precio: args.precio,
    km: args.km,
    margenObjetivo: args.margenObjetivo,
    casetas: args.casetas,
    comida: args.comida,
    otros: args.otros,
    gasolinaReal: args.gasolinaReal,
    numAyudantes: args.numAyudantes,
    pctRenta: pctRentaDe(args.vehiculo ?? null, cfg),
    pctVenta: cfg.pct_venta,
    pctChofer: cfg.pct_chofer,
    pctAyudante: cfg.pct_ayudante,
    pctAdmon: cfg.pct_admon,
    rendimientoKml: rendimientoDe(args.vehiculo ?? null, cfg),
    precioLitro: cfg.precio_litro,
  });
}

// ── Comisiones ──────────────────────────────────────────────────────────────

export interface ComisionCalculada {
  contacto_id: string;
  rol: RolComision;
  envio_id: string | null;
  base_monto: number;
  porcentaje: number;
  monto: number;
}

/**
 * Calcula las comisiones de una ruta al cerrarla.
 *
 * - Chofer y ayudantes cobran sobre el ingreso TOTAL de la ruta: hicieron un
 *   solo viaje, sin importar cuántas paradas llevó.
 * - El vendedor cobra sobre el envío que él vendió, porque cada parada puede
 *   venir de un vendedor distinto.
 * - Administración NO genera comisión: es utilidad del dueño.
 */
export function calcularComisiones(args: {
  cfg: ConfigNegocio;
  envios: { id: string; precio: number; vendedor_id: string | null }[];
  tripulacion: { contacto_id: string; rol: 'chofer' | 'ayudante' }[];
  contactos: Map<string, Contacto>;
}): ComisionCalculada[] {
  const { cfg, envios, tripulacion, contactos } = args;
  const ingresoRuta = envios.reduce((s, e) => s + e.precio, 0);
  const out: ComisionCalculada[] = [];

  for (const t of tripulacion) {
    const pct = pctComisionDe(contactos.get(t.contacto_id) ?? null, t.rol, cfg);
    out.push({
      contacto_id: t.contacto_id,
      rol: t.rol,
      envio_id: null,
      base_monto: ingresoRuta,
      porcentaje: pct,
      monto: redondear((ingresoRuta * pct) / 100),
    });
  }

  for (const e of envios) {
    if (!e.vendedor_id) continue;
    const pct = pctComisionDe(contactos.get(e.vendedor_id) ?? null, 'vendedor', cfg);
    out.push({
      contacto_id: e.vendedor_id,
      rol: 'vendedor',
      envio_id: e.id,
      base_monto: e.precio,
      porcentaje: pct,
      monto: redondear((e.precio * pct) / 100),
    });
  }

  return out;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Utilidad de agrupar ─────────────────────────────────────────────────────

/**
 * Cuánto se gana por agrupar entregas en un solo viaje, en vez de hacerlas por
 * separado. Los ingresos no cambian: lo que cambia es que los gastos del viaje
 * se pagan una vez en lugar de N.
 */
export function ahorroPorAgrupar(args: {
  gastosViajeAgrupado: number;
  gastosSiFueranSeparados: number[];
}): { ahorro: number; pct: number } {
  const separados = args.gastosSiFueranSeparados.reduce((s, g) => s + g, 0);
  const ahorro = separados - args.gastosViajeAgrupado;
  return { ahorro, pct: separados > 0 ? (ahorro / separados) * 100 : 0 };
}
