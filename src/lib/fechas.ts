const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * `2026-06-07` → `7 jun 2026`.
 *
 * Se parte el texto en vez de construir un Date: `new Date('2026-06-07')` se
 * interpreta en UTC y en México dibuja el día anterior. Un viaje no puede
 * cambiar de día por la zona horaria del navegador.
 *
 * Con `conAno = false` se omite el año, para listas que ya viven en un periodo.
 */
export function fechaCorta(iso: string, conAno = true): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  const mes = MESES[Number(m) - 1] ?? m;
  return conAno ? `${Number(d)} ${mes} ${a}` : `${Number(d)} ${mes}`;
}

/** `2026-06-07` → `dom 7 jun`. Útil cuando importa el día de la semana. */
export function fechaConDia(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const dia = dias[new Date(a, m - 1, d).getDay()];
  return `${dia} ${d} ${MESES[m - 1]}`;
}
