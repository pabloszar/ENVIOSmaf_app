// ════════════════════════════════════════════════════════════════════════════
// MOTOR 1 — Algoritmo de pricing calibrado
//
// Portado 1:1 del cotizador original. Calibrado con 17 envíos reales de MAF.
// La única diferencia: los parámetros ya no son constantes de código, vienen
// de `config_negocio.params_pricing`, para que se puedan ajustar desde la
// pantalla de Configuración sin tocar el código.
//
// Con los valores por defecto del schema, los resultados son IDÉNTICOS a los
// del cotizador viejo. Eso se verifica en `verificarParidad()`.
// ════════════════════════════════════════════════════════════════════════════

import type { ParamsPricing, TamanoCarga } from '@/types';

export const ORIGEN = { lat: 19.289, lng: -99.51, nombre: 'Mueblería MAF – Lerma' };

export const PARAMS_DEFAULT: ParamsPricing = {
  margen: 0.5,
  road_factor: 1.55,
  band_1_limit: 120,
  band_2_limit: 400,
  band_1_base: 200,
  band_1_rate: 15,
  band_2_rate: 12,
  band_2_viat: 600,
  band_3_rate: 8,
  band_3_viat: 1200,
  mult: { Chico: 0.8, Mediano: 1.0, Grande: 1.3, 'Extra Grande': 1.6 },
};

/** Distancia en línea recta, en km. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Km de carretera desde Lerma, usando el factor calibrado.
 * Ojo: el precio individual usa este factor, NO los km de OSRM. OSRM sirve
 * para ordenar rutas y para el costo del viaje agrupado.
 */
export function kmCarretera(lat: number, lng: number, p: ParamsPricing = PARAMS_DEFAULT): number {
  return Math.round(haversine(ORIGEN.lat, ORIGEN.lng, lat, lng) * p.road_factor);
}

export interface DesgloseCosto {
  costoBase: number;
  viaticos: number;
  costoTotal: number;
  banda: 1 | 2 | 3;
}

/** Costo operativo estimado para unos km dados, por bandas de distancia. */
export function calcCosto(km: number, p: ParamsPricing = PARAMS_DEFAULT): DesgloseCosto {
  let costo = p.band_1_base + p.band_1_rate * Math.min(km, p.band_1_limit);
  let viaticos = 0;
  let banda: 1 | 2 | 3 = 1;

  if (km > p.band_1_limit) {
    const excedente = Math.min(km - p.band_1_limit, p.band_2_limit - p.band_1_limit);
    costo += p.band_2_rate * excedente;
    viaticos += p.band_2_viat;
    banda = 2;
  }
  if (km > p.band_2_limit) {
    costo += p.band_3_rate * (km - p.band_2_limit);
    viaticos += p.band_3_viat;
    banda = 3;
  }

  return { costoBase: costo, viaticos, costoTotal: costo + viaticos, banda };
}

export interface Cotizacion {
  km: number;
  banda: 1 | 2 | 3;
  costoBase: number;
  viaticos: number;
  costoTotal: number;
  precioFinal: number;
  costoFinal: number;
  margen: number;
  mult: number;
}

/** Precio de un destino según el algoritmo calibrado. */
export function calcPrecio(
  lat: number,
  lng: number,
  tamano: TamanoCarga,
  p: ParamsPricing = PARAMS_DEFAULT
): Cotizacion {
  const km = kmCarretera(lat, lng, p);
  const { costoBase, viaticos, costoTotal, banda } = calcCosto(km, p);
  const mult = p.mult[tamano] ?? 1.0;
  const precioBase = costoTotal / (1 - p.margen);
  const precioFinal = Math.ceil((precioBase * mult) / 100) * 100; // redondeo arriba a $100
  const costoFinal = Math.round(precioFinal * (1 - p.margen));

  return {
    km,
    banda,
    costoBase,
    viaticos,
    costoTotal,
    precioFinal,
    costoFinal,
    margen: precioFinal - costoFinal,
    mult,
  };
}

/** Tiempo estimado de manejo, como etiqueta legible. */
export function tiempoEstimado(km: number): string {
  if (km <= 50) return `${Math.round(km * 1.8)} min`;
  if (km <= 120) return `${(km / 45).toFixed(1)} hrs`;
  if (km <= 400) return `${(km / 70).toFixed(1)} hrs`;
  return `${(km / 75).toFixed(1)} hrs`;
}

export const ETIQUETAS_BANDA: Record<1 | 2 | 3, string> = {
  1: 'Banda 1 – Metro',
  2: 'Banda 2 – Regional',
  3: 'Banda 3 – Nacional',
};

/**
 * Ciudades de referencia con el precio que daba el cotizador original.
 * Sirven de prueba de regresión: si alguien toca el algoritmo y estos
 * números cambian, algo se rompió.
 */
export const CIUDADES_REFERENCIA = [
  { nombre: 'Toluca', lat: 19.2926, lng: -99.6568, precioEsperado: 1200 },
  { nombre: 'CDMX', lat: 19.4326, lng: -99.1332, precioEsperado: 2400 },
  { nombre: 'Puebla', lat: 19.0414, lng: -98.2063, precioEsperado: 7600 },
  { nombre: 'Monterrey', lat: 25.6866, lng: -100.3161, precioEsperado: 25700 },
];

export function verificarParidad(p: ParamsPricing = PARAMS_DEFAULT): {
  ok: boolean;
  fallas: string[];
} {
  const fallas: string[] = [];
  for (const c of CIUDADES_REFERENCIA) {
    const precio = calcPrecio(c.lat, c.lng, 'Mediano', p).precioFinal;
    if (precio !== c.precioEsperado) {
      fallas.push(`${c.nombre}: esperado $${c.precioEsperado}, obtenido $${precio}`);
    }
  }
  return { ok: fallas.length === 0, fallas };
}

/** Formato de moneda mexicana. */
export function mxn(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-MX');
}
