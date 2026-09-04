export type Propiedad = 'propia' | 'rentada';
export type EstadoRuta = 'cotizada' | 'agendada' | 'en_curso' | 'entregada' | 'cancelada';
export type RolTripulacion = 'chofer' | 'ayudante';
export type RolComision = 'chofer' | 'ayudante' | 'vendedor';
export type TamanoCarga = 'Chico' | 'Mediano' | 'Grande' | 'Extra Grande';
export type TipoGasto = 'operativo' | 'inversion' | 'retiro';
export type EstadoComision = 'devengada' | 'pagada' | 'cancelada';

export type CategoriaGasto =
  | 'gasolina' | 'caseta' | 'comida' | 'mantenimiento' | 'seguro' | 'tenencia'
  | 'sueldo' | 'administrativo' | 'renta_vehiculo' | 'comision' | 'otro';

export type RolContacto =
  | 'chofer' | 'ayudante' | 'vendedor' | 'cliente_b2b' | 'cliente_b2c' | 'proveedor';

export interface ParamsPricing {
  margen: number;
  road_factor: number;
  band_1_limit: number;
  band_2_limit: number;
  band_1_base: number;
  band_1_rate: number;
  band_2_rate: number;
  band_2_viat: number;
  band_3_rate: number;
  band_3_viat: number;
  mult: Record<TamanoCarga, number>;
}

export interface ConfigNegocio {
  id: string;
  vigente_desde: string;
  pct_venta: number;
  pct_chofer: number;
  pct_ayudante: number;
  pct_admon: number;
  pct_renta_propia: number;
  pct_renta_rentada: number;
  rendimiento_default_kml: number;
  precio_litro: number;
  params_pricing: ParamsPricing;
  notas: string | null;
  creado_en: string;
}

export interface Contacto {
  id: string;
  nombre: string;
  roles: RolContacto[];
  telefono: string | null;
  email: string | null;
  pct_override: Partial<Record<RolComision, number>> | null;
  dias_credito: number;
  limite_credito: number | null;
  calificacion: number | null;
  activo: boolean;
  notas: string | null;
}

export interface Vehiculo {
  id: string;
  nombre: string;
  placas: string | null;
  tipo: string | null;
  propiedad: Propiedad;
  pct_renta: number | null;
  rendimiento_kml: number | null;
  capacidad: string | null;
  activo: boolean;
  notas: string | null;
}

export interface Ruta {
  id: string;
  folio: number;
  fecha: string;
  estado: EstadoRuta;
  vehiculo_id: string | null;
  km_total: number | null;
  km_osrm: number | null;
  /**
   * El kilometraje se escribió a mano: recalcular el recorrido no lo pisa.
   * Opcional porque llega con fase7 y antes de correrla la columna no viene.
   */
  km_manual?: boolean;
  roundtrip: boolean;
  orden_optimo: string[] | null;
  /** La línea que dibujó OSRM, guardada para no volver a pedirla (fase7). */
  trayecto?: { linea: [number, number][]; minutos: number; roundtrip: boolean } | null;
  config_snapshot: ConfigNegocio | null;
  cerrada_en: string | null;
  notas: string | null;
}

export interface Tripulante {
  id: string;
  ruta_id: string;
  contacto_id: string;
  rol: RolTripulacion;
  pct_aplicado: number | null;
}

export interface Envio {
  id: string;
  ruta_id: string;
  secuencia: number;
  cliente_id: string | null;
  vendedor_id: string | null;
  orden_venta: string | null;
  destino: string;
  lat: number | null;
  lng: number | null;
  zona: string | null;
  distancia_km: number | null;
  tamano_carga: TamanoCarga | null;
  num_articulos: number | null;
  num_pisos: number | null;
  precio: number;
  precio_sugerido_cotizador: number | null;
  uso_cotizador: boolean;
  calificacion: number | null;
  a_credito: boolean;
  /** Sus `cobros` describen exactamente lo que entró; ya no se supone nada. */
  cobro_detallado: boolean;
  cobrado_por: string | null;
  cobrado_por_otro: string | null;
  notas: string | null;
}

export interface Gasto {
  id: string;
  fecha: string;
  categoria: CategoriaGasto;
  tipo: TipoGasto;
  monto: number;
  ruta_id: string | null;
  vehiculo_id: string | null;
  contacto_id: string | null;
  descripcion: string | null;
  metodo_pago: string | null;
  comprobante_url: string | null;
  subcategoria_id: string | null;
  /** El comentario largo. `descripcion` es la etiqueta corta del renglón. */
  notas: string | null;
  pagado_por: string | null;
  pagado_por_otro: string | null;
}

export interface Comision {
  id: string;
  ruta_id: string;
  envio_id: string | null;
  contacto_id: string;
  rol: RolComision;
  base_monto: number;
  porcentaje: number;
  monto: number;
  estado: EstadoComision;
  fecha_pago: string | null;
}

export interface Cobro {
  id: string;
  envio_id: string;
  fecha: string;
  monto: number;
  metodo: string | null;
  recibido_por: string | null;
  recibido_por_otro: string | null;
  notas: string | null;
}

export interface SubcategoriaGasto {
  id: string;
  categoria: CategoriaGasto;
  nombre: string;
  activa: boolean;
  orden: number;
}

export interface Adjunto {
  id: string;
  gasto_id: string | null;
  envio_id: string | null;
  ruta_id: string | null;
  ruta_archivo: string;
  nombre: string;
  tipo_mime: string | null;
  bytes: number | null;
  comentario: string | null;
  creado_en: string;
}

/** Fila de la vista v_envio_cobro (fase6). */
export interface EnvioCobro {
  envio_id: string;
  ruta_id: string;
  fecha: string;
  estado: EstadoRuta;
  destino: string;
  cliente_id: string | null;
  a_credito: boolean;
  cobro_detallado: boolean;
  venta: number;
  cobros_registrados: number;
  efectivo: number;
  transferencia: number;
  tienda: number;
  cobrado: number;
  /** Se dio por cobrado sin desglose: sigue siendo una suposición. */
  cobrado_supuesto: boolean;
}

/** Fila de la vista v_cuenta_tienda (fase6). */
export interface CuentaTienda {
  cobrado: number;
  aplicado: number;
  saldo: number;
}

/** Fila de la vista v_pnl_mensual */
export interface PnlMes {
  mes: string;
  viajes: number;
  paradas: number;
  ingreso: number;
  gasolina: number;
  casetas: number;
  comida: number;
  gastos_viaje: number;
  comisiones: number;
  /** Comisiones capturadas como gasto de ruta (así vino el histórico). */
  comision_gasto: number;
  renta_unidad: number;
  admon: number;
  utilidad_operativa: number;
  gastos_fijos: number;
  utilidad_neta: number;
  inversion: number;
  retiros: number;
  margen_operativo_pct: number | null;
  margen_neto_pct: number | null;
  km: number;
  ingreso_por_km: number | null;
  costo_viaje_por_km: number | null;
}

/**
 * Fila de la vista v_envio_pnl: el envío con su parte prorrateada de los
 * costos de la ruta. Es la base de los cortes por destino, cliente y tamaño.
 */
export interface EnvioPnl {
  envio_id: string;
  ruta_id: string;
  folio: number;
  fecha: string;
  estado: EstadoRuta;
  vehiculo_id: string | null;
  vehiculo: string | null;
  secuencia: number;
  destino: string;
  zona: string;
  cliente_id: string | null;
  cliente: string | null;
  vendedor_id: string | null;
  tamano_carga: TamanoCarga | null;
  distancia_km: number | null;
  a_credito: boolean;
  paradas: number;
  parte: number;
  ingreso: number;
  gastos_viaje: number;
  gasolina: number;
  casetas: number;
  comisiones: number;
  renta_unidad: number;
  admon: number;
  utilidad: number;
  margen_pct: number | null;
}

/** Fila de la vista v_ruta_pnl_full */
export interface RutaPnl {
  ruta_id: string;
  folio: number;
  fecha: string;
  estado: EstadoRuta;
  vehiculo_id: string | null;
  vehiculo: string | null;
  propiedad: Propiedad | null;
  km_total: number | null;
  num_envios: number;
  ingreso: number;
  gasolina: number;
  casetas: number;
  comida: number;
  gastos_directos: number;
  com_chofer: number;
  com_ayudante: number;
  com_vendedor: number;
  comisiones: number;
  renta_unidad: number;
  admon: number;
  utilidad: number;
  margen_pct: number | null;
}
