import type { RolComision } from '@/types';

/* Las filas tal como llegan de la base, compartidas por las tres páginas. */

export interface CxC {
  envio_id: string; ruta_id: string | null; folio: number; fecha: string; destino: string;
  cliente: string | null; dias_credito: number | null; precio: number;
  cobrado: number; saldo: number; dias_transcurridos: number; vencido: boolean;
}

export interface ComPorPagar {
  contacto_id: string; nombre: string; num_comisiones: number; total_devengado: number; desde: string;
}

/** Una comisión devengada, ya resuelta con el folio y la fecha de su ruta. */
export interface ComDetalle {
  id: string; contacto_id: string; ruta_id: string; rol: RolComision;
  monto: number; folio: number | null; fecha: string | null;
}

export interface CajaMes {
  mes: string; entradas: number; entradas_contado: number; entradas_credito: number;
  salidas: number; salidas_operativas: number; salidas_inversion: number;
  salidas_retiro: number; salidas_comisiones: number;
  /** Llega con fase6; antes los pagos de renta no se restaban de la caja. */
  salidas_renta?: number;
  flujo_neto: number;
}

/** Movimientos crudos con fecha, para poder cortar el flujo por día. */
export interface MovVenta {
  envio_id: string; ruta_id: string; fecha: string; estado: string; destino: string;
  cliente_id: string | null; a_credito: boolean; venta: number;
  cobros_registrados: number; cobrado: number;
  // Fase 5.
  cobrado_por?: string | null; cobrado_por_otro?: string | null;
  // Fase 6. Ausentes mientras no se corra la migración: se leen como undefined.
  cobro_detallado?: boolean; cobrado_supuesto?: boolean;
  efectivo?: number; transferencia?: number; tienda?: number;
}

export interface MovGasto {
  id: string; fecha: string; tipo: string; monto: number;
  categoria: string; descripcion: string | null; ruta_id: string | null;
  metodo_pago?: string | null;
  pagado_por?: string | null; pagado_por_otro?: string | null;
}

export interface MovCobro {
  id: string; envio_id: string; fecha: string; monto: number; metodo: string | null;
  recibido_por?: string | null; recibido_por_otro?: string | null;
}

export interface MovComision {
  id: string; contacto_id: string; rol: string; ruta_id: string;
  fecha_pago: string | null; monto: number;
}

/** Saldo de un bolsillo, de v_saldo_custodia (fase5). */
export interface SaldoCustodia {
  custodio: string;
  contactoId: string | null;
  nombreOtro: string | null;
  nombre: string;
  cobrado: number;
  pagado: number;
  saldo: number;
  movimientos: number;
  ultimo: string | null;
}

export interface Entrega {
  id: string; fecha: string; contacto_id: string | null; nombre_otro: string | null;
  monto: number; direccion: 'recibo' | 'entrego';
  metodo: string | null; referencia: string | null; notas: string | null;
}

export interface Fondo {
  devengado: number; pagado: number; entregado: number; aplicado: number; saldo: number;
}
export interface FondoUnidad {
  vehiculo_id: string; vehiculo: string; propiedad: string;
  devengado: number; pagado: number; saldo: number; viajes: number | null;
}
export interface RentaRuta {
  ruta_id: string; folio: number; fecha: string; vehiculo_id: string | null;
  vehiculo: string | null; propiedad: string | null; ingreso: number; renta_unidad: number;
}
export interface PagoRenta {
  id: string; fecha: string; monto: number; concepto: string;
  vehiculo_id: string | null; metodo: string | null; referencia: string | null; notas: string | null;
}

/** Lo que la tienda cobró por ti y lo que ya se abonó a la renta (fase6). */
export interface CuentaTienda { cobrado: number; aplicado: number; saldo: number }
