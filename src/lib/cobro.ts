/**
 * Cómo se pagó un flete.
 *
 * Esto es la evolución de "quién cobró". Preguntar por la persona resultó ser
 * la pregunta difícil —hay que acordarse— cuando la fácil, la que se sabe en
 * el momento, es cómo se pagó. Y de ahí sale casi siempre dónde quedó:
 *
 *   efectivo       a la caja, o a la mano de quien lo haya cobrado
 *   transferencia  al banco
 *   tienda         a la caja de Tiendas MAF, a cuenta de la renta
 *
 * `tienda` no es una forma de pago del cliente sino de quién lo recibió, y aun
 * así vive aquí: para quien captura son la misma decisión y una sola pregunta.
 *
 * Se manejan como texto y no como enum de Postgres porque un enum obliga a
 * migrar la base para agregar un método, y estas listas cambian.
 */
export const METODOS = ['efectivo', 'transferencia', 'tienda'] as const;
export type Metodo = (typeof METODOS)[number];

export const TIENDAS_MAF = 'Tiendas MAF';

export const METODO_INFO: Record<Metodo, {
  label: string; corto: string; donde: string; emoji: string;
}> = {
  efectivo: {
    label: 'Efectivo', corto: 'Efectivo',
    donde: 'Queda en tu caja.', emoji: '💵',
  },
  transferencia: {
    label: 'Transferencia', corto: 'Transfer.',
    donde: 'Llega a tu banco.', emoji: '🏦',
  },
  tienda: {
    label: 'Cobrado en tienda', corto: 'Tienda',
    donde: `Lo cobró ${TIENDAS_MAF} y se abona a la renta de las camionetas.`,
    emoji: '🏬',
  },
};

export const esMetodo = (v: unknown): v is Metodo =>
  typeof v === 'string' && (METODOS as readonly string[]).includes(v);

/** Etiqueta legible de un método, incluso si viene vacío o desconocido. */
export function etiquetaMetodo(m: string | null | undefined): string {
  if (!m) return 'Sin especificar';
  return esMetodo(m) ? METODO_INFO[m].label : m;
}

/* ══════════════════════════════════════════════════════════════════════════
   El desglose
   ══════════════════════════════════════════════════════════════════════════ */

/** Quién tiene el efectivo. Vacío en los dos campos = la caja de Envíos MAF. */
export interface Custodia {
  contactoId: string | null;
  otro: string;
}
export const SIN_CUSTODIA: Custodia = { contactoId: null, otro: '' };
export const esCaja = (c: Custodia) => !c.contactoId && !c.otro.trim();

/**
 * Lo que se cobró de una parada, método por método.
 *
 * Los montos se guardan como texto porque vienen de campos que la persona
 * está escribiendo: un `number` convierte "1.5" a medio peso mientras teclea
 * "1.50" y hace saltar el campo bajo los dedos.
 */
export interface Desglose {
  montos: Record<Metodo, string>;
  /** Solo aplica al efectivo: una transferencia cae en el banco, no en manos. */
  custodia: Custodia;
}

const CERO: Record<Metodo, string> = { efectivo: '', transferencia: '', tienda: '' };

export const desgloseVacio = (): Desglose => ({ montos: { ...CERO }, custodia: SIN_CUSTODIA });

/** Todo por un solo método: el caso normal, y el que arma la vista simple. */
export const desgloseSimple = (metodo: Metodo, monto: number | string): Desglose => ({
  montos: { ...CERO, [metodo]: String(monto ?? '') },
  custodia: SIN_CUSTODIA,
});

export const montoDe = (d: Desglose, m: Metodo): number => Number(d.montos[m] || 0) || 0;

export const sumaDesglose = (d: Desglose): number =>
  METODOS.reduce((s, m) => s + montoDe(d, m), 0);

/** Los métodos que de verdad traen dinero. */
export const metodosUsados = (d: Desglose): Metodo[] =>
  METODOS.filter((m) => montoDe(d, m) > 0);

/**
 * Lo que queda a deber. Se redondea a centavos antes de comparar: sin eso,
 * 3500 − (2000 + 1500) da −4.5e−13 en coma flotante y un flete pagado
 * completo aparecería con cuatro diezmilésimas de peso pendientes.
 */
export const restante = (d: Desglose, precio: number): number =>
  Math.round((Number(precio || 0) - sumaDesglose(d)) * 100) / 100;

/**
 * El cuerpo que espera `PUT /api/envios/cobro`.
 *
 * La custodia solo viaja con el efectivo. El cobro en tienda siempre queda a
 * nombre de Tiendas MAF, escrito igual siempre: si cada quien lo teclea a su
 * manera, el saldo se parte en varias cuentas que son la misma.
 */
export function desgloseABody(d: Desglose, fecha?: string) {
  return {
    fecha,
    lineas: metodosUsados(d).map((m) => ({
      metodo: m,
      monto: montoDe(d, m),
      recibido_por: m === 'efectivo' ? d.custodia.contactoId || null : null,
      recibido_por_otro:
        m === 'tienda' ? TIENDAS_MAF
        : m === 'efectivo' ? d.custodia.otro.trim() || null
        : null,
    })),
  };
}

/** Reconstruye el control a partir de los cobros ya guardados de una parada. */
export function desgloseDesdeCobros(
  cobros: { metodo: string | null; monto: number; recibido_por?: string | null; recibido_por_otro?: string | null }[]
): Desglose {
  const d = desgloseVacio();
  for (const c of cobros) {
    if (!esMetodo(c.metodo)) continue;
    d.montos[c.metodo] = String(Number(d.montos[c.metodo] || 0) + Number(c.monto));
    if (c.metodo === 'efectivo' && (c.recibido_por || c.recibido_por_otro)) {
      d.custodia = { contactoId: c.recibido_por ?? null, otro: c.recibido_por_otro ?? '' };
    }
  }
  return d;
}
