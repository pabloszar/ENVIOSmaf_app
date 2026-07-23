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
  roundtrip: boolean;
  orden_optimo: string[] | null;
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
  notas: string | null;
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
