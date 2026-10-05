/**
 * Renders de las unidades.
 *
 * El archivo se deriva del nombre del vehículo, así que agregar una unidad no
 * requiere tocar código: basta guardar `public/img/unidades/<slug>.png`. La
 * lista explícita evita pedir imágenes que no existen (un 404 por cada tarjeta).
 */
const CON_RENDER = new Set([
  'np300-negra',
  'np300-azul',
  'saveiro',
  'tornado',
]);

export function slugUnidad(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quita acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * A qué altura de la imagen tocan el piso las llantas, de 0 (arriba) a 1.
 *
 * Los renders traen aire debajo y cada uno distinto. En el garage la unidad
 * va parada en un piso con reflejo y sombra, y sin este número flotaría: la
 * Saveiro quedaba 25 px en el aire junto a una NP300 bien apoyada. Está
 * medido sobre el canal alfa de cada PNG, no a ojo.
 */
const SUELO: Record<string, number> = {
  'np300-negra': 0.935,
  'np300-azul': 0.934,
  'saveiro': 0.837,
  'tornado': 0.893,
};

/** Dónde pisa el render de esa unidad; 0.92 es el de la silueta de reserva. */
export function sueloUnidad(nombre: string | null | undefined): number {
  return (nombre && SUELO[slugUnidad(nombre)]) || 0.92;
}

/** La ruta del render, o null si esa unidad todavía no tiene imagen. */
export function renderUnidad(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const slug = slugUnidad(nombre);
  return CON_RENDER.has(slug) ? `/img/unidades/${slug}.png` : null;
}

/**
 * Ilustración por tamaño de carga. Mientras no existan las cuatro, todas usan
 * la de la caja: es un marcador temporal, no el diseño final.
 */
export function ilustracionCarga(_tamano: string): string {
  return '/img/carga/chico.png';
}
