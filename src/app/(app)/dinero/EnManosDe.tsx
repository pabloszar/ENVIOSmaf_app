'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/cliente';
import {
  Campo, Input, Select, Boton, BotonMini, Chip, Aviso, Modal, AccionesModal, CampoMonto,
} from '@/components/ui';
import Comprobante from '@/components/Comprobante';
import { TIENDAS_MAF } from '@/components/QuienTuvo';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';

/**
 * En manos de quién está el dinero.
 *
 * Lo normal es que todo lo cobre la caja de Envíos MAF, pero a veces cobra el
 * chofer, a veces Tiendas MAF en su propia caja, y a veces el gasto lo pone
 * alguien más. Ese dinero es del negocio pero no está en tu mano, y mientras
 * la app fingía que sí, su caja nunca iba a cuadrar con la de verdad.
 *
 * El saldo de cada quien es una cuenta corriente:
 *
 *     lo que cobró  −  lo que pagó de gastos  −  lo que ya te entregó
 *
 * Positivo, trae dinero tuyo. Negativo, puso de su bolsa y se le debe. Cero,
 * están a mano — y esas cuentas se esconden solas para no hacer ruido.
 */

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
  monto: number; direccion: string; metodo: string | null; referencia: string | null;
}

const METODOS = ['efectivo', 'transferencia', 'tarjeta'];

export default function EnManosDe({
  saldos, entregas, contactos, cargando, accion, disponible,
}: {
  saldos: SaldoCustodia[];
  entregas: Entrega[];
  contactos: { id: string; nombre: string }[];
  cargando: boolean;
  accion: (fn: () => Promise<void>) => Promise<void>;
  disponible: boolean;
}) {
  const [modal, setModal] = useState<SaldoCustodia | null>(null);
  const [recibo, setRecibo] = useState<{ entrega: Entrega; nombre: string } | null>(null);
  const [verSaldadas, setVerSaldadas] = useState(false);

  const caja = saldos.find((s) => s.custodio === 'caja');
  const otros = useMemo(
    () => saldos.filter((s) => s.custodio !== 'caja').sort((a, b) => b.saldo - a.saldo),
    [saldos],
  );
  const conSaldo = otros.filter((s) => Math.abs(s.saldo) >= 0.5);
  const saldadas = otros.filter((s) => Math.abs(s.saldo) < 0.5);
  const visibles = verSaldadas ? otros : conSaldo;
  const enOtrasManos = conSaldo.reduce((s, x) => s + x.saldo, 0);

  const nombreDe = (e: Entrega) =>
    e.contacto_id
      ? (contactos.find((c) => c.id === e.contacto_id)?.nombre ?? '—')
      : (e.nombre_otro ?? '—');

  if (!disponible) {
    return (
      <section className="tarjeta">
        <h2 className="text-sm font-medium tracking-tight">En manos de</h2>
        <p className="mt-2 max-w-lg text-sm text-ink-mute">
          Falta correr <span className="cifra text-ink-soft">supabase/fase5.sql</span> en el SQL Editor
          de Supabase. Esa migración agrega a cada movimiento quién tuvo el dinero, y la tabla de
          entregas para saldar cuentas.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Dónde está el dinero ── */}
      <section className="tarjeta">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div>
            <p className="etiqueta">En tu caja</p>
            <p className={`cifra mt-1.5 text-4xl font-light leading-none tracking-tight
              ${Number(caja?.saldo ?? 0) < 0 ? 'text-bad' : 'text-good'}`}>
              {mxn(Number(caja?.saldo ?? 0))}
            </p>
            <p className="mt-2 text-xs text-ink-mute">lo que sí llegó a tus manos</p>
          </div>
          <div>
            <p className="etiqueta">En manos de otros</p>
            <p className={`cifra mt-1.5 text-4xl font-light leading-none tracking-tight
              ${enOtrasManos > 0 ? 'text-warn' : 'text-ink-mute'}`}>
              {mxn(enOtrasManos)}
            </p>
            <p className="mt-2 text-xs text-ink-mute">
              {conSaldo.length === 0
                ? 'nadie trae dinero pendiente'
                : `${conSaldo.length} ${conSaldo.length === 1 ? 'cuenta abierta' : 'cuentas abiertas'}`}
            </p>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-ink-mute">
            Todo esto es dinero del negocio. La diferencia es de qué bolsillo hay que sacarlo
            cuando lo necesites.
          </p>
        </div>
      </section>

      {/* ── Las cuentas ── */}
      <section className="tarjeta-tabla">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <h2 className="text-sm font-medium tracking-tight">Cuentas por persona</h2>
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-ink-mute">
            {visibles.length}
          </span>
          <span className="flex-1" />
          {saldadas.length > 0 && (
            <Chip activo={verSaldadas} onClick={() => setVerSaldadas((v) => !v)}>
              {verSaldadas ? 'Ocultar saldadas' : `Ver ${saldadas.length} saldadas`}
            </Chip>
          )}
        </div>

        {visibles.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-mute">
            Todo el dinero pasó por tu caja. Cuando alguien más cobre un flete o ponga un gasto,
            su cuenta aparece aquí sola.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {visibles.map((s) => {
              const debe = s.saldo > 0.5;
              const leDebes = s.saldo < -0.5;
              return (
                <li key={s.custodio} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <div className="min-w-[10rem] flex-1">
                    <p className="font-medium leading-tight">{s.nombre}</p>
                    <p className="mt-0.5 text-xs leading-tight text-ink-mute">
                      cobró {mxn(s.cobrado)} · puso {mxn(s.pagado)}
                      {s.ultimo && ` · último ${fechaCorta(s.ultimo, false)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`cifra text-lg font-medium leading-none
                      ${debe ? 'text-warn' : leDebes ? 'text-bad' : 'text-ink-mute'}`}>
                      {mxn(Math.abs(s.saldo))}
                    </p>
                    <p className="mt-1 text-[11px] leading-tight text-ink-mute">
                      {debe ? 'te trae' : leDebes ? 'le debes' : 'a mano'}
                    </p>
                  </div>
                  <BotonMini onClick={() => setModal(s)}>
                    {leDebes ? 'Reponerle' : 'Registrar entrega'}
                  </BotonMini>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Historial de entregas ── */}
      <section className="tarjeta-tabla">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <h2 className="text-sm font-medium tracking-tight">Entregas registradas</h2>
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-ink-mute">
            {entregas.length}
          </span>
        </div>
        {entregas.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-mute">Nadie ha entregado ni recibido efectivo todavía.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {entregas.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {e.direccion === 'recibo'
                      ? <>{nombreDe(e)} <span className="text-ink-mute">te entregó</span></>
                      : <><span className="text-ink-mute">le entregaste a</span> {nombreDe(e)}</>}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-mute">
                    {fechaCorta(e.fecha)}{e.metodo ? ` · ${e.metodo}` : ''}{e.referencia ? ` · ${e.referencia}` : ''}
                  </p>
                </div>
                <span className={`cifra shrink-0 text-sm ${e.direccion === 'recibo' ? 'text-good' : 'text-warn'}`}>
                  {e.direccion === 'recibo' ? '+' : '−'}{mxn(Number(e.monto))}
                </span>
                <BotonMini onClick={() => setRecibo({ entrega: e, nombre: nombreDe(e) })}>Comprobante</BotonMini>
                <button aria-label="Eliminar" disabled={cargando}
                  onClick={() => confirm('¿Eliminar esta entrega? El saldo de la persona se recalcula.')
                    && accion(async () => { await api('/api/entregas', { method: 'DELETE', body: { id: e.id } }); })}
                  className="shrink-0 px-1 text-ink-mute/50 transition hover:text-bad">✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ModalEntrega key={modal?.custodio ?? 'ninguno'} cuenta={modal} onCerrar={() => setModal(null)}
        cargando={cargando} accion={accion}
        onHecho={(entrega, nombre) => setRecibo({ entrega, nombre })} />

      {recibo && (
        <Comprobante abierto onCerrar={() => setRecibo(null)}
          titulo={recibo.entrega.direccion === 'recibo' ? 'Comprobante de entrega' : 'Comprobante de anticipo'}
          concepto={recibo.entrega.direccion === 'recibo'
            ? 'Entrega de efectivo cobrado' : 'Anticipo para gastos'}
          para={recibo.nombre}
          monto={Number(recibo.entrega.monto)}
          fecha={recibo.entrega.fecha}
          metodo={recibo.entrega.metodo}
          referencia={recibo.entrega.referencia}
          nota={recibo.entrega.direccion === 'recibo'
            ? 'Efectivo cobrado de fletes y entregado a Envíos MAF. Su cuenta queda saldada por este monto.'
            : 'Efectivo adelantado para gastos de viaje. Se descuenta de lo que entregue después.'} />
      )}
    </div>
  );
}

/**
 * Registrar una entrega.
 *
 * El monto arranca en el saldo completo porque saldar de una es lo que se hace
 * casi siempre; dejarlo vacío obligaría a teclear una cifra que la pantalla ya
 * conoce. Se puede bajar para un abono parcial.
 */
function ModalEntrega({
  cuenta, onCerrar, cargando, accion, onHecho,
}: {
  cuenta: SaldoCustodia | null;
  onCerrar: () => void;
  cargando: boolean;
  accion: (fn: () => Promise<void>) => Promise<void>;
  onHecho: (e: Entrega, nombre: string) => void;
}) {
  const saldo = Number(cuenta?.saldo ?? 0);
  const leDebes = saldo < 0;
  const hoy = new Date().toISOString().slice(0, 10);

  const [monto, setMonto] = useState(String(Math.abs(saldo) || ''));
  const [fecha, setFecha] = useState(hoy);
  const [metodo, setMetodo] = useState('efectivo');
  const [referencia, setReferencia] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cantidad = Number(monto || 0);
  const restante = Math.abs(saldo) - cantidad;

  async function guardar() {
    if (!cuenta) return;
    setError(null);
    if (!(cantidad > 0)) { setError('Escribe cuánto se entregó.'); return; }
    await accion(async () => {
      const e = await api<Entrega>('/api/entregas', {
        method: 'POST',
        body: {
          fecha, monto: cantidad,
          // Le debes = tú le entregas a él. Si no, él te entrega a ti.
          direccion: leDebes ? 'entrego' : 'recibo',
          contacto_id: cuenta.contactoId,
          nombre_otro: cuenta.contactoId ? null : (cuenta.nombreOtro ?? cuenta.nombre),
          metodo, referencia: referencia || null,
        },
      });
      onCerrar();
      onHecho(e, cuenta.nombre);
    });
  }

  return (
    <Modal abierto={cuenta != null} onCerrar={onCerrar}
      titulo={leDebes ? 'Reponerle lo que puso' : 'Registrar entrega'} ancho="chico"
      descripcion={cuenta?.nombre}>
      <div className="space-y-4">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-mute">{leDebes ? 'Puso de su bolsa' : 'Trae cobrado'}</span>
            <span className={`cifra font-medium ${leDebes ? 'text-bad' : 'text-warn'}`}>
              {mxn(Math.abs(saldo))}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink-mute">
            cobró {mxn(Number(cuenta?.cobrado ?? 0))} · puso {mxn(Number(cuenta?.pagado ?? 0))}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label={leDebes ? 'Le entregas' : 'Te entrega'}>
            <CampoMonto valor={monto} onCambio={setMonto} autoFocus />
          </Campo>
          <Campo label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
        </div>

        <Campo label="Método">
          <div className="flex gap-2">
            {METODOS.map((m) => (
              <Chip key={m} activo={metodo === m} onClick={() => setMetodo(m)}>{m}</Chip>
            ))}
          </div>
        </Campo>

        <Campo label="Referencia" hint="Folio de transferencia o cualquier rastro. Opcional.">
          <Input value={referencia} onChange={(e) => setReferencia(e.target.value)}
            placeholder="Transferencia 4471…" />
        </Campo>

        <p className="text-sm text-ink-mute">
          {Math.abs(restante) < 0.5
            ? 'Su cuenta queda en ceros.'
            : restante > 0
              ? <>Quedan <span className="cifra text-warn">{mxn(restante)}</span> pendientes en su cuenta.</>
              : <>Se pasa por <span className="cifra text-bad">{mxn(Math.abs(restante))}</span>, y esa
                diferencia queda a su favor.</>}
        </p>

        <Aviso error={error} />

        <AccionesModal>
          <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
          <Boton onClick={guardar} disabled={cargando}>
            {cargando ? 'Guardando…' : 'Registrar y generar comprobante'}
          </Boton>
        </AccionesModal>
      </div>
    </Modal>
  );
}
