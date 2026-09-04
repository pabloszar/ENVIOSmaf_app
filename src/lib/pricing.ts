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

/**
 * De dónde sale toda camioneta.
 *
 * Coordenadas medidas en el punto, no geocodificadas: Nominatim solo conoce el
 * eje de la calle y dejaba la bodega a un kilómetro de donde está. Un
 * geocodificador acierta la calle y adivina el número.
 *
 * Mover este punto mueve los kilómetros de todo destino y, con ellos, los
 * precios. Por eso `verificarParidad()` ya no parte de coordenadas.
 */
export const ORIGEN = {
  // 19°16'23.2"N 99°30'47.4"W
  lat: 19.2731111,
  lng: -99.5131667,
  nombre: 'Mueblería MAF – Lerma',
  direccion: 'C. Benito Juárez 9, San Pedro Tultepec, 52030, Edo. de México',
};

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
  return precioDesdeKm(kmCarretera(lat, lng, p), tamano, p);
}

/**
 * El algoritmo propiamente dicho: de kilómetros a precio.
 *
 * Va separado de `calcPrecio` porque ubicar el destino y ponerle precio son
 * dos cosas distintas, y solo la segunda es la que se calibró. Así la prueba
 * de paridad puede verificar el algoritmo sin depender de dónde esté la
 * bodega: si mañana la tienda se muda, los precios de referencia siguen
 * siendo válidos.
 */
export function precioDesdeKm(
  km: number,
  tamano: TamanoCarga,
  p: ParamsPricing = PARAMS_DEFAULT
): Cotizacion {
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
 * Ciudades de referencia con el precio que daba el cotizador original, y los
 * kilómetros con que lo daba. Prueba de regresión: si alguien toca el
 * algoritmo y estos números cambian, algo se rompió.
 *
 * Se fijan por kilómetros y no por coordenadas a propósito. Con coordenadas,
 * corregir la dirección de la bodega —cosa que pasó— movía los km y hacía
 * fallar la prueba sin que nadie hubiera tocado el algoritmo: una alarma que
 * suena cuando no hay incendio deja de servir de alarma.
 */
export const CIUDADES_REFERENCIA = [
  { nombre: 'Toluca', km: 24, precioEsperado: 1200 },
  { nombre: 'CDMX', km: 66, precioEsperado: 2400 },
  { nombre: 'Puebla', km: 216, precioEsperado: 7600 },
  { nombre: 'Monterrey', km: 1110, precioEsperado: 25700 },
];

export function verificarParidad(p: ParamsPricing = PARAMS_DEFAULT): {
  ok: boolean;
  fallas: string[];
} {
  const fallas: string[] = [];
  for (const c of CIUDADES_REFERENCIA) {
    const precio = precioDesdeKm(c.km, 'Mediano', p).precioFinal;
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
