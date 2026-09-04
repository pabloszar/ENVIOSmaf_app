'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import { BotonMini, Chip } from '@/components/ui';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import { METODO_INFO, esMetodo, desgloseABody, type Desglose } from '@/lib/cobro';
import ModalComoSePago, { type ObjetoCobro } from './ModalComoSePago';
import type { MovCobro } from './tipos';

/**
 * El flujo, renglón por renglón.
 *
 * Existe para una sola tarea: sentarse con el estado de cuenta al lado y
 * encontrar dónde se separan. Por eso la columna que manda no es el monto sino
 * el ACUMULADO — se baja con el dedo hasta que el número deja de coincidir, y
 * ahí está el renglón culpable.
 *
 * La fila que suele fallar es la del flete de contado. La app la da por
 * cobrada en cuanto la ruta se entrega, porque así ocurre casi siempre, pero
 * no hay comprobante detrás: es un supuesto. Van marcadas para que se
 * distingan de un cobro capturado, y se pueden corregir en su lugar.
 */

export interface Movimiento {
  id: string;
  fecha: string;
  tipo: 'entrada' | 'salida';
  concepto: string;
  detalle: string;
  monto: number;
  /** Entrada sin comprobante: se asume porque el flete fue de contado. */
  supuesto?: boolean;
  rutaId?: string;
  envioId?: string;
  precio?: number;
  destino?: string;
  aCredito?: boolean;
  /** Con qué se pagó: efectivo, transferencia o cobrado en tienda. */
  metodo?: string | null;
  /**
   * Movió el fondo pero no tu caja. El abono de lo que Tiendas MAF cobró es
   * el caso: ese dinero nunca estuvo en tu mano, así que buscarlo en el
   * estado de cuenta sería perseguir una salida que el banco no tiene.
   */
  fueraDeCaja?: boolean;
  /** Quién tuvo ese dinero. null = tu caja, que es lo normal. */
  enManosDe?: string | null;
}

type Filtro = 'todo' | 'entrada' | 'salida';

export default function Movimientos({
  movimientos, etiquetaPeriodo, cobrosPorEnvio, contactos, cargando, accion, error, setError,
}: {
  movimientos: Movimiento[];
  etiquetaPeriodo: string;
  /** El desglose ya guardado de cada envío, para sembrar la corrección. */
  cobrosPorEnvio: Map<string, MovCobro[]>;
  contactos: { id: string; nombre: string }[];
  cargando: boolean;
  accion: (fn: () => Promise<void>) => Promise<void>;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todo');
  const [ajuste, setAjuste] = useState<ObjetoCobro | null>(null);

  const orden = useMemo(
    () => [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.concepto.localeCompare(b.concepto)),
    [movimientos],
  );

  // Lo que no pasó por la caja no cuenta para conciliar: es un movimiento
  // real del negocio, pero el banco y el efectivo nunca lo van a mostrar.
  const enCaja = orden.filter((m) => !m.fueraDeCaja);
  const entro = enCaja.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.monto, 0);
  const salio = enCaja.filter((m) => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0);
  const supuestas = orden.filter((m) => m.supuesto);
  const montoSupuesto = supuestas.reduce((s, m) => s + m.monto, 0);

  // El acumulado se calcula sobre lo que se está viendo: con el filtro en
  // "Entradas" corre la suma de entradas, que es contra lo que se concilia.
  const visibles = orden.filter((m) => filtro === 'todo' || m.tipo === filtro);
  let corrido = 0;
  const filas = visibles.map((m) => {
    if (!m.fueraDeCaja) corrido += m.tipo === 'entrada' ? m.monto : -m.monto;
    return { ...m, acumulado: corrido };
  });

  return (
    <div className="space-y-4">
      <section className="tarjeta-tabla">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-white/[0.06] px-5 py-3.5">
          <h2 className="text-sm font-medium tracking-tight">Movimientos · {etiquetaPeriodo}</h2>
          <div className="flex gap-1.5">
            <Chip activo={filtro === 'todo'} onClick={() => setFiltro('todo')}>Todo</Chip>
            <Chip activo={filtro === 'entrada'} onClick={() => setFiltro('entrada')}>Entradas</Chip>
            <Chip activo={filtro === 'salida'} onClick={() => setFiltro('salida')}>Salidas</Chip>
          </div>
          <span className="flex-1" />
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span className="text-ink-mute">Entró <span className="cifra text-good">{mxn(entro)}</span></span>
            <span className="text-ink-mute">Salió <span className="cifra text-bad">{mxn(salio)}</span></span>
            <span className="text-ink-mute">Dejó <span className="cifra text-ink">{mxn(entro - salio)}</span></span>
          </div>
        </div>

        {/* El aviso que explica de dónde puede venir un descuadre. */}
        {supuestas.length > 0 && (
          <div className="border-b border-white/[0.06] bg-warn/[0.05] px-5 py-3 text-xs leading-relaxed text-ink-soft">
            <span className="font-medium text-warn">
              {supuestas.length} entradas por {mxn(montoSupuesto)} no tienen comprobante.
            </span>{' '}
            Son fletes de contado: la app los da por cobrados en efectivo al entregarse. Si alguno
            se pagó de otra forma —transferencia, en la tienda— o entró incompleto, dilo con{' '}
            <span className="text-ink">Ajustar</span>: la diferencia se va sola a cuentas por cobrar
            y el monto deja de contar como efectivo.
          </div>
        )}

        {filas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-mute">Sin movimientos en el periodo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.08em] text-ink-mute">
                  <th className="px-5 pb-2.5 pt-3 text-left font-medium">Fecha</th>
                  <th className="px-3 pb-2.5 pt-3 text-left font-medium">Concepto</th>
                  <th className="px-3 pb-2.5 pt-3 text-right font-medium">Entró</th>
                  <th className="px-3 pb-2.5 pt-3 text-right font-medium">Salió</th>
                  <th className="px-3 pb-2.5 pt-3 text-right font-medium">Acumulado</th>
                  <th className="px-5 pb-2.5 pt-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filas.map((m) => (
                  <tr key={m.id} className="align-middle">
                    <td className="whitespace-nowrap px-5 py-2.5 text-xs text-ink-mute">
                      {fechaCorta(m.fecha, false)}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="flex items-center gap-2 leading-tight">
                        {m.rutaId ? (
                          <Link href={`/rutas/${m.rutaId}`} className="transition hover:text-brand">
                            {m.concepto}
                          </Link>
                        ) : m.concepto}
                        {m.supuesto && (
                          <span className="rounded-full border border-warn/30 bg-warn/10 px-1.5 py-0.5
                            text-[10px] font-medium text-warn">sin comprobante</span>
                        )}
                        {esMetodo(m.metodo) && (
                          <span className="rounded-full border border-white/[0.12] bg-white/[0.05] px-1.5 py-0.5
                            text-[10px] font-medium text-ink-soft">{METODO_INFO[m.metodo].corto}</span>
                        )}
                        {m.fueraDeCaja && (
                          <span className="rounded-full border border-acento/30 bg-acento/10 px-1.5 py-0.5
                            text-[10px] font-medium text-acento">no toca tu caja</span>
                        )}
                        {m.enManosDe && (
                          <span className="rounded-full border border-dato/30 bg-dato/10 px-1.5 py-0.5
                            text-[10px] font-medium text-dato">lo tuvo {m.enManosDe}</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs leading-tight text-ink-mute">{m.detalle}</p>
                    </td>
                    <td className="cifra px-3 py-2.5 text-right text-good">
                      {m.tipo === 'entrada' ? mxn(m.monto) : ''}
                    </td>
                    <td className="cifra px-3 py-2.5 text-right text-bad">
                      {m.tipo === 'salida' ? mxn(m.monto) : ''}
                    </td>
                    <td className={`cifra px-3 py-2.5 text-right font-medium ${m.acumulado < 0 ? 'text-bad' : ''}`}>
                      {mxn(m.acumulado)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {m.envioId && m.precio != null && (
                        <BotonMini onClick={() => {
                          setError(null);
                          setAjuste({
                            envioId: m.envioId!, destino: m.destino ?? m.concepto,
                            fecha: m.fecha, precio: m.precio!, aCredito: m.aCredito ?? false,
                          });
                        }}>Ajustar</BotonMini>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/[0.1]">
                  <td colSpan={4} className="px-5 py-3 text-xs uppercase tracking-[0.08em] text-ink-mute">
                    {filtro === 'entrada' ? 'Total entradas'
                      : filtro === 'salida' ? 'Total salidas'
                      : 'Lo que dejó el periodo'}
                  </td>
                  <td className="cifra px-3 py-3 text-right font-semibold">{mxn(corrido)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <ModalComoSePago objeto={ajuste}
        cobros={ajuste ? cobrosPorEnvio.get(ajuste.envioId) ?? [] : []}
        contactos={contactos} error={error} cargando={cargando}
        onCerrar={() => setAjuste(null)}
        onGuardar={(envioId, d: Desglose) => accion(async () => {
          await api('/api/envios/cobro', {
            method: 'PUT', body: { envio_id: envioId, ...desgloseABody(d) },
          });
          setAjuste(null);
        })} />
    </div>
  );
}
