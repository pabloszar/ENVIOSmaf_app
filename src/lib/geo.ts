import { ORIGEN } from '@/lib/pricing';

/**
 * Mapas y distancias, contra los servicios públicos de OpenStreetMap.
 *
 * Vive solo en el servidor por dos razones. La primera es la de siempre: nada
 * que hable con un servicio externo debe salir del navegador, para que la app
 * controle qué se pide y con qué identidad. La segunda es que Nominatim exige
 * un `User-Agent` que diga quién llama y limita a una consulta por segundo —
 * desde el navegador cada usuario sería un cliente suelto imposible de frenar.
 */

const OSRM = (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');
const NOMINATIM = 'https://nominatim.openstreetmap.org';

/** Nominatim lo pide en sus condiciones de uso: hay que decir quién llama. */
const AGENTE = 'EnviosMAF/2.0 (gestion interna de fletes)';

/**
 * Una consulta por segundo, en fila.
 *
 * Es el límite que impone Nominatim y del que depende que nos sigan
 * atendiendo. La cola es del proceso, no global: con un solo servidor alcanza,
 * y pasarse del límite se castiga con un bloqueo por IP.
 */
let turno: Promise<unknown> = Promise.resolve();
function enFila<T>(fn: () => Promise<T>): Promise<T> {
  const mio = turno.then(fn, fn);
  turno = mio.then(
    () => new Promise((r) => setTimeout(r, 1100)),
    () => new Promise((r) => setTimeout(r, 1100)),
  );
  return mio;
}

async function pedir(url: string, opciones?: { timeoutMs?: number }): Promise<unknown> {
  // Sin tiempo límite, un servicio público lento dejaría la petición colgada y
  // con ella la pantalla que la espera.
  const corte = AbortSignal.timeout(opciones?.timeoutMs ?? 12_000);
  const res = await fetch(url, {
    headers: { 'User-Agent': AGENTE, 'Accept-Language': 'es-MX,es' },
    signal: corte,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`El servicio de mapas respondió ${res.status}.`);
  return res.json();
}

/* ══════════════════════════════════════════════════════════════════════════
   Buscar una dirección
   ══════════════════════════════════════════════════════════════════════════ */

export interface Lugar {
  nombre: string;
  descripcion: string;
  /** Municipio y estado: es lo que se guarda en `envios.zona`. */
  zona: string;
  lat: number;
  lng: number;
}

interface FilaNominatim {
  lat: string; lon: string; name?: string; display_name: string;
  address?: Record<string, string>;
}

/** Municipio y estado, que es el corte con el que se leen los destinos. */
function zonaDe(a: Record<string, string> | undefined): string {
  if (!a) return '';
  const municipio = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? '';
  const estado = a.state ?? '';
  return [municipio, estado].filter(Boolean).join(', ');
}

/**
 * Busca una dirección. Se limita a México porque todos los fletes salen de
 * Lerma; sin el filtro, "Toluca" trae antes un pueblo de España.
 */
export async function buscarLugar(consulta: string): Promise<Lugar[]> {
  const q = consulta.trim();
  if (q.length < 3) return [];

  const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}`
    + '&format=jsonv2&limit=6&countrycodes=mx&addressdetails=1';
  const filas = (await enFila(() => pedir(url))) as FilaNominatim[];

  return (filas ?? []).map((f) => {
    const zona = zonaDe(f.address);
    // `display_name` viene completísimo —incluye país y código postal— y en una
    // lista de seis resultados es ilegible. El nombre corto manda; el largo
    // queda debajo para desempatar entre dos que se llaman igual.
    const nombre = f.name?.trim() || f.display_name.split(',')[0].trim();
    return {
      nombre,
      descripcion: f.display_name.replace(/, México$/, ''),
      zona,
      lat: Number(f.lat),
      lng: Number(f.lon),
    };
  });
}

/** El nombre de un punto del mapa, para cuando se pone el pin a mano. */
export async function nombrarPunto(lat: number, lng: number): Promise<Lugar | null> {
  const url = `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1`;
  const f = (await enFila(() => pedir(url))) as FilaNominatim | { error: string };
  if (!f || 'error' in f) return null;

  const a = f.address ?? {};
  const calle = [a.road, a.house_number].filter(Boolean).join(' ');
  const zona = zonaDe(a);
  return {
    nombre: calle || a.neighbourhood || a.suburb || zona.split(',')[0] || 'Punto en el mapa',
    descripcion: f.display_name?.replace(/, México$/, '') ?? '',
    zona,
    lat,
    lng,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Calcular el recorrido
   ══════════════════════════════════════════════════════════════════════════ */

export interface Punto { lat: number; lng: number }

export interface Trayecto {
  /** Kilómetros por carretera de todo el viaje. */
  km: number;
  minutos: number;
  /** El orden en que conviene visitar las paradas, por su índice de entrada. */
  orden: number[];
  /** Distancia de cada tramo, ya en el orden bueno. La última es el regreso. */
  tramos: number[];
  /** La línea para dibujar, en [lat, lng] como la quiere Leaflet. */
  linea: [number, number][];
  /** Si la vuelta a Lerma está incluida en los kilómetros. */
  roundtrip: boolean;
}

const coords = (ps: Punto[]) => ps.map((p) => `${p.lng},${p.lat}`).join(';');

/** GeoJSON viene en [lng, lat]; Leaflet lo quiere al revés. */
const aLeaflet = (g: { coordinates: [number, number][] } | undefined): [number, number][] =>
  (g?.coordinates ?? []).map(([lng, lat]) => [lat, lng]);

interface RespuestaOsrm {
  code: string;
  routes?: { distance: number; duration: number; legs: { distance: number }[];
    geometry?: { coordinates: [number, number][] } }[];
  trips?: { distance: number; duration: number; legs: { distance: number }[];
    geometry?: { coordinates: [number, number][] } }[];
  waypoints?: { waypoint_index?: number; trips_index?: number }[];
}

/**
 * El recorrido de un viaje: sale de Lerma, pasa por las paradas y —si así se
 * pidió— regresa a Lerma.
 *
 * Con dos o más paradas se pregunta además EN QUÉ ORDEN conviene visitarlas.
 * Es el problema del viajante y OSRM lo resuelve con su servicio `trip`; a
 * mano, tres paradas ya son seis recorridos posibles y nadie los compara bien
 * de cabeza.
 *
 * El origen se fija como primera parada (`source=first`) porque la camioneta
 * sale de la bodega: dejar que el optimizador escoja por dónde empezar daría
 * un recorrido más corto en el papel y imposible en la realidad.
 */
export async function calcularTrayecto(
  paradas: Punto[],
  roundtrip = true
): Promise<Trayecto> {
  if (paradas.length === 0) {
    return { km: 0, minutos: 0, orden: [], tramos: [], linea: [], roundtrip };
  }

  const origen: Punto = { lat: ORIGEN.lat, lng: ORIGEN.lng };
  const comun = 'geometries=geojson&overview=full';

  // Una sola parada no tiene orden que optimizar: se pide el recorrido directo.
  if (paradas.length === 1) {
    const puntos = roundtrip ? [origen, paradas[0], origen] : [origen, paradas[0]];
    const r = (await pedir(`${OSRM}/route/v1/driving/${coords(puntos)}?${comun}`)) as RespuestaOsrm;
    const ruta = r.routes?.[0];
    if (r.code !== 'Ok' || !ruta) throw new Error('No se pudo trazar el recorrido.');
    return {
      km: Math.round((ruta.distance / 1000) * 10) / 10,
      minutos: Math.round(ruta.duration / 60),
      orden: [0],
      tramos: ruta.legs.map((l) => Math.round((l.distance / 1000) * 10) / 10),
      linea: aLeaflet(ruta.geometry),
      roundtrip,
    };
  }

  const puntos = [origen, ...paradas];
  const t = (await pedir(
    `${OSRM}/trip/v1/driving/${coords(puntos)}?source=first&roundtrip=true&${comun}`
  )) as RespuestaOsrm;
  const viaje = t.trips?.[0];
  if (t.code !== 'Ok' || !viaje || !t.waypoints) {
    throw new Error('No se pudo trazar el recorrido.');
  }

  // `waypoint_index` dice en qué posición del recorrido quedó cada punto que
  // mandamos. Se invierte el mapa para leerlo al revés: dada la posición, qué
  // parada va ahí. El índice 0 es siempre el origen y por eso se descuenta 1.
  const porPosicion: number[] = [];
  t.waypoints.forEach((w, i) => {
    if (w.waypoint_index != null) porPosicion[w.waypoint_index] = i;
  });
  const orden = porPosicion.slice(1).map((i) => i - 1).filter((i) => i >= 0);

  if (roundtrip) {
    return {
      km: Math.round((viaje.distance / 1000) * 10) / 10,
      minutos: Math.round(viaje.duration / 60),
      orden,
      tramos: viaje.legs.map((l) => Math.round((l.distance / 1000) * 10) / 10),
      linea: aLeaflet(viaje.geometry),
      roundtrip,
    };
  }

  // Sin regreso, el `trip` solo sirvió para saber el orden: hay que volver a
  // pedir el recorrido, ahora sin cerrar el círculo.
  const ordenadas = [origen, ...orden.map((i) => paradas[i])];
  const r = (await pedir(`${OSRM}/route/v1/driving/${coords(ordenadas)}?${comun}`)) as RespuestaOsrm;
  const ruta = r.routes?.[0];
  if (r.code !== 'Ok' || !ruta) throw new Error('No se pudo trazar el recorrido.');
  return {
    km: Math.round((ruta.distance / 1000) * 10) / 10,
    minutos: Math.round(ruta.duration / 60),
    orden,
    tramos: ruta.legs.map((l) => Math.round((l.distance / 1000) * 10) / 10),
    linea: aLeaflet(ruta.geometry),
    roundtrip,
  };
}
