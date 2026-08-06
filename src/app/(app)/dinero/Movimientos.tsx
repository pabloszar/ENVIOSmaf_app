'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import { Campo, Input, Boton, BotonMini, Chip, Aviso, Modal, AccionesModal, CampoMonto } from '@/components/ui';
import QuienTuvo, { type Custodia, custodiaABody } from '@/components/QuienTuvo';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';

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
  /** Quién tuvo ese dinero. null = tu caja, que es lo normal. */
  enManosDe?: string | null;
  custodiaId?: string | null;
  custodiaOtro?: string;
}

type Filtro = 'todo' | 'entrada' | 'salida';

export default function Movimientos({
  movimientos, etiquetaPeriodo, cargando, accion, gente,
}: {
  movimientos: Movimiento[];
  etiquetaPeriodo: string;
  cargando: boolean;
  accion: (fn: () => Promise<void>) => Promise<void>;
  /** Choferes y vendedores, para ofrecerlos sin buscarlos en una lista. */
  gente: { id: string; nombre: string }[];
}) {
  const [filtro, setFiltro] = useState<Filtro>('todo');
  const [ajuste, setAjuste] = useState<Movimiento | null>(null);

  const orden = useMemo(
    () => [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.concepto.localeCompare(b.concepto)),
    [movimientos],
  );

  const entro = orden.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.monto, 0);
  const salio = orden.filter((m) => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0);
  const supuestas = orden.filter((m) => m.supuesto);
  const montoSupuesto = supuestas.reduce((s, m) => s + m.monto, 0);

  // El acumulado se calcula sobre lo que se está viendo: con el filtro en
  // "Entradas" corre la suma de entradas, que es contra lo que se concilia.
  const visibles = orden.filter((m) => filtro === 'todo' || m.tipo === filtro);
  let corrido = 0;
  const filas = visibles.map((m) => {
    corrido += m.tipo === 'entrada' ? m.monto : -m.monto;
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
            Son fletes de contado: la app los da por cobrados al entregarse. Si alguno entró
            incompleto —descuento, pago parcial, quedó a deber— corrígelo con{' '}
            <span className="text-ink">Ajustar</span> y la diferencia se va sola a cuentas por cobrar.
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
                      {m.envioId && (
                        <BotonMini onClick={() => setAjuste(m)}>Ajustar</BotonMini>
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

      {/* La key remonta el formulario al cambiar de renglón: sin ella el campo
          conservaría el monto tecleado para otro flete. */}
      <AjustarCobro key={ajuste?.id ?? 'ninguno'} mov={ajuste} gente={gente}
        onCerrar={() => setAjuste(null)} cargando={cargando} accion={accion} />
    </div>
  );
}

/**
 * Corregir cuánto entró de verdad en un flete.
 *
 * Solo pide el monto real. Todo lo demás —marcar el envío como crédito, dejar
 * el resto en cuentas por cobrar— lo deduce el servidor, porque son
 * consecuencias de ese número y no decisiones aparte que el usuario deba tomar.
 */
function AjustarCobro({
  mov, onCerrar, cargando, accion, gente,
}: {
  mov: Movimiento | null;
  onCerrar: () => void;
  cargando: boolean;
  accion: (fn: () => Promise<void>) => Promise<void>;
  gente: { id: string; nombre: string }[];
}) {
  const precio = Number(mov?.precio ?? 0);
  const [monto, setMonto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [quien, setQuien] = useState<Custodia>({
    contactoId: mov?.custodiaId ?? null, otro: mov?.custodiaOtro ?? '',
  });

  // El campo arranca con lo que la app cree que entró, para que corregir sea
  // borrar dos dígitos y no escribir la cifra completa.
  const valor = monto === '' ? String(mov?.monto ?? '') : monto;
  const cobrado = Number(valor || 0);
  const falta = Math.max(0, precio - cobrado);

  async function guardar() {
    if (!mov?.envioId) return;
    setError(null);
    if (cobrado > precio) { setError(`No puedes cobrar más que el flete (${mxn(precio)}).`); return; }
    await accion(async () => {
      await api('/api/cobros/ajustar', {
        method: 'POST',
        body: { envio_id: mov.envioId, cobrado: valor || 0, fecha: mov.fecha },
      });
      // Quién lo tuvo se guarda aparte: es del envío, no del cobro, y aplica
      // igual si entró completo o incompleto.
      await api('/api/envios', {
        method: 'PATCH',
        body: { id: mov.envioId, ...custodiaABody(quien, 'cobrado_por') },
      });
      setMonto('');
      onCerrar();
    });
  }

  return (
    <Modal abierto={mov != null} onCerrar={onCerrar} titulo="¿Cuánto entró de verdad?" ancho="chico"
      descripcion={mov?.concepto}>
      <div className="space-y-4">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-mute">Precio del flete</span>
            <span className="cifra font-medium">{mxn(precio)}</span>
          </div>
        </div>

        <Campo label="Entró" hint="Lo que de verdad se cobró, sin importar quién lo recibió.">
          <CampoMonto valor={valor} onCambio={setMonto} autoFocus />
        </Campo>

        <QuienTuvo valor={quien} onCambio={setQuien} etiqueta="¿Quién lo cobró?" sugeridos={gente} />

        <p className="text-sm text-ink-mute">
          {falta > 0 ? (
            <>Quedan <span className="cifra text-warn">{mxn(falta)}</span> por cobrar. El envío pasa a
            crédito y aparece en la lista de quién te debe.</>
          ) : (
            <>El flete queda como cobrado completo, sin saldo pendiente.</>
          )}
        </p>

        <Aviso error={error} />

        <AccionesModal>
          <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
          <Boton onClick={guardar} disabled={cargando}>
            {cargando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </AccionesModal>
      </div>
    </Modal>
  );
}
