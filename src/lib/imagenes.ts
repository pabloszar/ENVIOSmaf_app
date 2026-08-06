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
