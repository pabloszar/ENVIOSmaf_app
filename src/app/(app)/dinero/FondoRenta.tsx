'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import {
  Campo, Input, Select, Boton, BotonMini, Aviso, Chip, Modal, AccionesModal, CampoMonto,
} from '@/components/ui';
import Comprobante from '@/components/Comprobante';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';

export interface Fondo {
  devengado: number; pagado: number; entregado: number; aplicado: number; saldo: number;
}
export interface FondoUnidad {
  vehiculo_id: string; vehiculo: string; propiedad: string;
  devengado: number; pagado: number; saldo: number; viajes: number | null;
}
export interface RentaRuta {
  ruta_id: string; folio: number; fecha: string;
  vehiculo_id: string | null; vehiculo: string | null;
  ingreso: number; renta_unidad: number;
}
export interface PagoRenta {
  id: string; fecha: string; monto: number; concepto: string;
  vehiculo_id: string | null; metodo: string | null; referencia: string | null; notas: string | null;
}

const CONCEPTOS: { v: string; label: string; hint: string }[] = [
  { v: 'entrega', label: 'Entrega', hint: 'Le diste el dinero a Tiendas MAF.' },
  { v: 'mantenimiento', label: 'Mantenimiento', hint: 'Servicio o reparación pagada con cargo al fondo.' },
  { v: 'legal', label: 'Legal', hint: 'Tenencia, verificación, placas, multas.' },
  { v: 'otro', label: 'Otro', hint: 'Cualquier otra salida del fondo.' },
];
const CONCEPTO_LABEL: Record<string, string> = Object.fromEntries(CONCEPTOS.map((c) => [c.v, c.label]));
const METODOS = ['efectivo', 'transferencia', 'tarjeta'];

/**
 * El fondo de renta.
 *
 * Las unidades son de Tiendas MAF. De cada flete se le retiene un porcentaje
 * que NO es de Envíos MAF: se aparta aquí y de esta bolsa salen el
 * mantenimiento, los trámites y las entregas de dinero.
 *
 * Por eso la cifra que manda es el SALDO y no lo devengado: lo devengado es
 * historia, el saldo es lo que hay guardado que le pertenece a alguien más. Si
 * ese número es grande, hay dinero en la cuenta que no se puede gastar.
 *
 * Estos pagos no son gastos operativos: la renta ya se descontó al calcular la
 * utilidad de cada viaje. Registrarlos como gasto la restaría dos veces.
 */
export default function FondoRenta({
  fondo, porUnidad, rentas, pagos, cargando, accion, disponible,
}: {
  fondo: Fondo | null;
  porUnidad: FondoUnidad[];
  rentas: RentaRuta[];
  pagos: PagoRenta[];
  cargando: boolean;
  accion: (fn: () => Promise<void>) => Promise<void>;
  disponible: boolean;
}) {
  const [modal, setModal] = useState(false);
  const [recibo, setRecibo] = useState<PagoRenta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);

  const hoy = new Date().toISOString().slice(0, 10);
  const vacio = { fecha: hoy, monto: '', concepto: 'entrega', vehiculo_id: '', metodo: 'transferencia', referencia: '', notas: '' };
  const [f, setF] = useState(vacio);

  const unidades = useMemo(
    () => porUnidad.filter((u) => Number(u.devengado) > 0 || Number(u.pagado) > 0),
    [porUnidad],
  );
  const nombreUnidad = useMemo(
    () => Object.fromEntries(porUnidad.map((u) => [u.vehiculo_id, u.vehiculo])),
    [porUnidad],
  );

  if (!disponible) {
    return (
      <section className="tarjeta">
        <h2 className="text-sm font-medium tracking-tight">Fondo de renta</h2>
        <p className="mt-2 max-w-lg text-sm text-ink-mute">
          Falta correr <span className="cifra text-ink-soft">supabase/fase4.sql</span> en el SQL Editor
          de Supabase. Esa migración crea la tabla de pagos y las vistas del fondo.
        </p>
      </section>
    );
  }

  const saldo = Number(fondo?.saldo ?? 0);
  const devengado = Number(fondo?.devengado ?? 0);

  async function registrar() {
    setError(null);
    if (!(Number(f.monto) > 0)) { setError('Escribe cuánto salió del fondo.'); return; }
    await accion(async () => {
      const p = await api<PagoRenta>('/api/pagos-renta', {
        method: 'POST',
        body: {
          fecha: f.fecha, monto: f.monto, concepto: f.concepto,
          vehiculo_id: f.vehiculo_id || null, metodo: f.metodo || null,
          referencia: f.referencia || null, notas: f.notas || null,
        },
      });
      setModal(false);
      setF(vacio);
      setRecibo(p);
    });
  }

  return (
    <div className="space-y-5">
      {/* ── El saldo manda ── */}
      <section className="tarjeta">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="etiqueta">Guardado del fondo</p>
            <p className={`cifra mt-2 text-5xl font-light leading-none tracking-tight
              ${saldo < 0 ? 'text-bad' : ''}`}>
              {mxn(saldo)}
            </p>
            <p className="mt-2.5 max-w-md text-sm text-ink-mute">
              {saldo < 0
                ? 'Saliste más de lo que el fondo tenía. Estás adelantando dinero propio a Tiendas MAF.'
                : saldo > 0
                  ? 'Está en tu cuenta pero es de Tiendas MAF. No lo cuentes como tuyo.'
                  : 'El fondo está en ceros: todo lo retenido ya salió.'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Boton onClick={() => { setError(null); setModal(true); }}>Registrar salida</Boton>
            <div className="flex flex-wrap justify-end gap-x-6 gap-y-2 text-sm">
              <Dato etiqueta="Retenido" valor={mxn(devengado)} nota="de los viajes entregados" />
              <Dato etiqueta="Entregado" valor={mxn(Number(fondo?.entregado ?? 0))} nota="a Tiendas MAF" />
              <Dato etiqueta="Aplicado" valor={mxn(Number(fondo?.aplicado ?? 0))} nota="mantenimiento y legales" />
            </div>
          </div>
        </div>

        {/* Barra: cuánto del retenido ya salió. */}
        {devengado > 0 && (
          <div className="mt-6">
            <div aria-hidden className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="bg-brand" style={{ width: `${pct(Number(fondo?.entregado ?? 0), devengado)}%` }} />
              <span className="ml-px bg-dato" style={{ width: `${pct(Number(fondo?.aplicado ?? 0), devengado)}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-mute">
              <Llave color="bg-brand">Entregado</Llave>
              <Llave color="bg-dato">Mantenimiento y legales</Llave>
              <Llave color="bg-white/[0.12]">Sigue guardado</Llave>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ── Por unidad ── */}
        <section className="tarjeta-tabla">
          <div className="border-b border-white/[0.06] px-5 py-3.5">
            <h2 className="text-sm font-medium tracking-tight">Por unidad</h2>
          </div>
          {unidades.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-mute">Ninguna unidad ha generado renta todavía.</p>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {unidades.map((u) => (
                <li key={u.vehiculo_id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.vehiculo}</p>
                    <p className="mt-0.5 text-xs text-ink-mute">
                      {u.propiedad} · {u.viajes ?? 0} {Number(u.viajes) === 1 ? 'viaje' : 'viajes'}
                      {' · retuvo '}{mxn(Number(u.devengado))}
                    </p>
                  </div>
                  <span className={`cifra shrink-0 font-medium ${Number(u.saldo) < 0 ? 'text-bad' : ''}`}>
                    {mxn(Number(u.saldo))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-white/[0.06] px-5 py-2.5 text-xs text-ink-mute">
            El saldo por unidad solo cuadra si cada salida se registra con su unidad.
          </p>
        </section>

        {/* ── Salidas ── */}
        <section className="tarjeta-tabla">
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
            <h2 className="text-sm font-medium tracking-tight">Salidas del fondo</h2>
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-ink-mute">{pagos.length}</span>
          </div>
          {pagos.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-mute">
              Nada ha salido del fondo. Todo lo retenido sigue guardado.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {pagos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {CONCEPTO_LABEL[p.concepto] ?? p.concepto}
                      {p.vehiculo_id && (
                        <span className="text-ink-mute"> · {nombreUnidad[p.vehiculo_id] ?? ''}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-mute">
                      {fechaCorta(p.fecha)}{p.metodo ? ` · ${p.metodo}` : ''}{p.referencia ? ` · ${p.referencia}` : ''}
                    </p>
                  </div>
                  <span className="cifra shrink-0 text-sm">{mxn(Number(p.monto))}</span>
                  <BotonMini onClick={() => setRecibo(p)}>Comprobante</BotonMini>
                  <button aria-label="Eliminar" disabled={cargando}
                    onClick={() => confirm('¿Eliminar esta salida del fondo?')
                      && accion(async () => { await api('/api/pagos-renta', { method: 'DELETE', body: { id: p.id } }); })}
                    className="shrink-0 px-1 text-ink-mute/50 transition hover:text-bad">✕</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── De dónde salió lo retenido ── */}
      <section className="tarjeta-tabla">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <h2 className="text-sm font-medium tracking-tight">Lo que aportó cada viaje</h2>
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-ink-mute">{rentas.length}</span>
          <span className="flex-1" />
          <span className="cifra text-sm text-ink-soft">{mxn(devengado)}</span>
        </div>
        {rentas.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-mute">Ningún viaje entregado ha generado renta.</p>
        ) : (
          <>
            <ul className="divide-y divide-white/[0.05]">
              {(verTodo ? rentas : rentas.slice(0, 8)).map((r) => (
                <li key={r.ruta_id} className="flex items-center gap-4 px-5 py-2.5">
                  <Link href={`/rutas/${r.ruta_id}`} className="cifra w-14 shrink-0 text-sm text-brand hover:underline">
                    #{r.folio}
                  </Link>
                  <span className="w-24 shrink-0 text-xs text-ink-mute">{fechaCorta(r.fecha, false)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-mute">{r.vehiculo ?? 'sin unidad'}</span>
                  <span className="cifra w-24 shrink-0 text-right text-xs text-ink-mute">
                    de {mxn(Number(r.ingreso))}
                  </span>
                  <span className="cifra w-24 shrink-0 text-right text-sm">{mxn(Number(r.renta_unidad))}</span>
                </li>
              ))}
            </ul>
            {rentas.length > 8 && (
              <button onClick={() => setVerTodo((v) => !v)}
                className="w-full border-t border-white/[0.06] px-5 py-2.5 text-xs text-ink-mute transition hover:text-ink">
                {verTodo ? 'Ver menos' : `Ver los ${rentas.length} viajes`}
              </button>
            )}
          </>
        )}
      </section>

      {/* ── Registrar salida ── */}
      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo="Registrar salida del fondo"
        descripcion="Dinero que ya no está guardado: se entregó o se gastó por cuenta de Tiendas MAF.">
        <div className="space-y-4">
          <div>
            <span className="etiqueta">Concepto</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CONCEPTOS.map((c) => (
                <button key={c.v} type="button" onClick={() => setF({ ...f, concepto: c.v })}
                  aria-pressed={f.concepto === c.v}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition ${
                    f.concepto === c.v
                      ? 'border-acento/40 bg-acento/10 text-acento'
                      : 'border-white/[0.07] bg-white/[0.03] text-ink-mute hover:border-white/20 hover:text-ink'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-mute">
              {CONCEPTOS.find((c) => c.v === f.concepto)?.hint}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Monto" hint={`Quedan ${mxn(saldo)} en el fondo.`}>
              <CampoMonto valor={f.monto} onCambio={(v) => setF({ ...f, monto: v })} autoFocus />
            </Campo>
            <Campo label="Fecha">
              <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Unidad" hint="Opcional, pero sin ella el saldo por unidad no cuadra.">
              <Select value={f.vehiculo_id} onChange={(e) => setF({ ...f, vehiculo_id: e.target.value })}>
                <option value="">— Todas / sin especificar —</option>
                {porUnidad.map((u) => <option key={u.vehiculo_id} value={u.vehiculo_id}>{u.vehiculo}</option>)}
              </Select>
            </Campo>
            <Campo label="Método">
              <div className="flex gap-2">
                {METODOS.map((m) => (
                  <Chip key={m} activo={f.metodo === m} onClick={() => setF({ ...f, metodo: m })}>{m}</Chip>
                ))}
              </div>
            </Campo>
          </div>

          <Campo label="Referencia" hint="Folio de transferencia, nota del taller, lo que sirva de rastro.">
            <Input value={f.referencia} placeholder="Transferencia 4471, factura A-233…"
              onChange={(e) => setF({ ...f, referencia: e.target.value })} />
          </Campo>

          <Aviso error={error} />

          <AccionesModal>
            <Boton variante="fantasma" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton onClick={registrar} disabled={cargando}>
              {cargando ? 'Guardando…' : 'Registrar y generar comprobante'}
            </Boton>
          </AccionesModal>
        </div>
      </Modal>

      {recibo && (
        <Comprobante abierto onCerrar={() => setRecibo(null)}
          titulo="Comprobante de salida del fondo"
          concepto={`Renta de unidad · ${CONCEPTO_LABEL[recibo.concepto] ?? recibo.concepto}`}
          para={recibo.vehiculo_id ? (nombreUnidad[recibo.vehiculo_id] ?? 'Tiendas MAF') : 'Tiendas MAF'}
          monto={Number(recibo.monto)}
          fecha={recibo.fecha}
          metodo={recibo.metodo}
          referencia={recibo.referencia}
          nota={recibo.concepto === 'entrega'
            ? 'Entrega de la renta retenida a los fletes del periodo.'
            : 'Pagado por cuenta de Tiendas MAF, con cargo a la renta retenida.'} />
      )}
    </div>
  );
}

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota: string }) {
  return (
    <span className="text-right">
      <span className="etiqueta block">{etiqueta}</span>
      <span className="cifra mt-0.5 block font-medium">{valor}</span>
      <span className="mt-0.5 block text-[11px] text-ink-mute">{nota}</span>
    </span>
  );
}

function Llave({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {children}
    </span>
  );
}

const pct = (parte: number, total: number) => (total > 0 ? Math.min(100, (parte / total) * 100) : 0);
