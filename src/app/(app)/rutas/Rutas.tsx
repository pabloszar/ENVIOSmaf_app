'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import {
  Campo, Input, Select, Boton, Aviso, Modal, AccionesModal, Chip, Bloque,
  Interruptor, CampoMonto, useAccion,
} from '@/components/ui';
import SelectorTamano from '@/components/SelectorTamano';
import FiltroPeriodo, { rangoDe, dentro, type Preset, type Rango } from '@/components/FiltroPeriodo';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import type { RutaPnl, Vehiculo, Contacto, TamanoCarga, EstadoRuta } from '@/types';

/** La fila del P&L más lo que hace falta para reconocer el viaje de un vistazo. */
export interface FilaRuta extends RutaPnl {
  destinos: string[];
  clientes: string[];
  chofer: string | null;
  ayudantes: string[];
  /** De lo vendido, cuánto ya entró. `null` = falta correr fase4.sql. */
  cobrado: number | null;
  porCobrar: number | null;
}

const PUNTO: Record<EstadoRuta, string> = {
  cotizada: 'bg-ink-mute', agendada: 'bg-brand', en_curso: 'bg-warn',
  entregada: 'bg-good', cancelada: 'bg-bad',
};

export default function Rutas({
  rutas, vehiculos, choferes, vendedores, clientes,
}: {
  rutas: FilaRuta[];
  vehiculos: Vehiculo[];
  choferes: Contacto[];
  ayudantes: Contacto[];
  vendedores: Contacto[];
  clientes: Contacto[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<'lista' | 'board'>('lista');
  const { cargando, error, correr, setError } = useAccion();

  // ── Filtros ──
  // Arranca en "Todo": el negocio tiene meses sin viajes y abrir en una tabla
  // vacía se lee como una falla, no como un filtro.
  const [preset, setPreset] = useState<Preset>('todo');
  const [rangoManual, setRangoManual] = useState<Rango>({ desde: null, hasta: null });
  const [busca, setBusca] = useState('');

  const visibles = useMemo(() => {
    const r = rangoDe(preset, rangoManual);
    const q = busca.trim().toLowerCase();
    return rutas.filter((x) => {
      if (!dentro(x.fecha, r)) return false;
      if (!q) return true;
      const heno = [
        `#${x.folio}`, x.destinos.join(' '), x.clientes.join(' '),
        x.chofer ?? '', x.vehiculo ?? '', x.estado,
      ].join(' ').toLowerCase();
      return heno.includes(q);
    });
  }, [rutas, preset, rangoManual, busca]);

  const total = useMemo(() => ({
    ingreso: visibles.reduce((s, r) => s + Number(r.ingreso), 0),
    utilidad: visibles.reduce((s, r) => s + Number(r.utilidad), 0),
    paradas: visibles.reduce((s, r) => s + Number(r.num_envios), 0),
    porCobrar: visibles.reduce((s, r) => s + Number(r.porCobrar ?? 0), 0),
  }), [visibles]);
  const margen = total.ingreso > 0 ? (total.utilidad / total.ingreso) * 100 : null;
  const hayCobros = visibles.some((r) => r.cobrado != null);

  // ── Alta ──
  const hoy = new Date().toISOString().slice(0, 10);
  const vacio = {
    fecha: hoy, vehiculo_id: '', chofer_id: '',
    destino: '', cliente_id: '', vendedor_id: '', precio: '',
    tamano_carga: '' as '' | TamanoCarga, km_total: '', notas: '', a_credito: false,
  };
  const [f, setF] = useState(vacio);

  async function crear(abrirDespues: boolean) {
    await correr(async () => {
      if (!f.destino.trim()) throw new Error('Escribe a dónde va el viaje.');
      const ruta = await api<{ id: string }>('/api/rutas', {
        method: 'POST',
        body: {
          fecha: f.fecha,
          vehiculo_id: f.vehiculo_id || null,
          km_total: f.km_total || null,
          notas: f.notas || null,
          estado: 'agendada',
          envio: {
            destino: f.destino.trim(),
            cliente_id: f.cliente_id || null,
            vendedor_id: f.vendedor_id || null,
            precio: f.precio || 0,
            a_credito: f.a_credito,
            tamano_carga: f.tamano_carga || null,
            // Los km del viaje son, por ahora, los de esta primera parada: así
            // el total de la ruta sigue cuadrando cuando se agreguen más.
            distancia_km: f.km_total || null,
          },
        },
      });
      if (f.chofer_id) {
        await api('/api/tripulacion', {
          method: 'POST',
          body: { ruta_id: ruta.id, contacto_id: f.chofer_id, rol: 'chofer' },
        });
      }
      setAbierto(false);
      setF(vacio);
      if (abrirDespues) router.push(`/rutas/${ruta.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Cabecera editorial ── */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="etiqueta">Operación</p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight">Rutas y envíos</h1>
          <p className="mt-2 max-w-lg text-sm text-ink-mute">
            El viaje carga los gastos; cada parada, su ingreso.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1">
            <Chip activo={vista === 'lista'} onClick={() => setVista('lista')}>Lista</Chip>
            <Chip activo={vista === 'board'} onClick={() => setVista('board')}>Board</Chip>
          </div>
          <Boton onClick={() => { setError(null); setAbierto(true); }}>Nueva ruta</Boton>
        </div>
      </div>

      {/* ── Barra de filtros con el saldo de lo que se está viendo ── */}
      <div className="tarjeta flex flex-wrap items-center justify-between gap-x-8 gap-y-4 !py-4">
        <div className="flex flex-wrap items-center gap-3">
          <FiltroPeriodo preset={preset} rango={rangoManual}
            onCambio={(p, r) => { setPreset(p); setRangoManual(r); }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar destino, cliente, chofer…" aria-label="Buscar"
            className="w-56 rounded-full border border-surface-line bg-surface-raised px-3.5 py-1.5 text-xs
              text-ink outline-none transition placeholder:text-ink-mute
              focus:border-brand focus:ring-2 focus:ring-brand/25" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <Resumen etiqueta="Viajes" valor={String(visibles.length)} />
          <Resumen etiqueta="Paradas" valor={String(total.paradas)} />
          <Resumen etiqueta="Venta" valor={mxn(total.ingreso)} />
          {hayCobros && (
            <Resumen etiqueta="Por cobrar" valor={mxn(total.porCobrar)}
              tono={total.porCobrar > 0 ? 'aviso' : undefined} />
          )}
          <Resumen etiqueta="Utilidad" valor={mxn(total.utilidad)} />
          <Resumen etiqueta="Margen"
            valor={margen != null ? `${margen.toFixed(1)}%` : '—'}
            tono={margen == null ? undefined : margen < 0 ? 'malo' : margen < 15 ? 'aviso' : 'bueno'} />
        </div>
      </div>

      {vista === 'lista' ? <Tabla rutas={visibles} /> : <Board rutas={visibles} />}

      {/* ── Alta de ruta ── */}
      <Modal abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Nueva ruta"
        descripcion="Lo mínimo para que el viaje exista. Lo demás se agrega adentro.">
        <div className="space-y-7">
          <Bloque titulo="El viaje" paso={1}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Fecha">
                <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
              </Campo>
              <Campo label="Km ida y vuelta" hint="Se suma solo cuando agregues más paradas.">
                <Input type="number" inputMode="decimal" placeholder="0" value={f.km_total}
                  onChange={(e) => setF({ ...f, km_total: e.target.value })} />
              </Campo>
              <Campo label="Unidad">
                <Select value={f.vehiculo_id} onChange={(e) => setF({ ...f, vehiculo_id: e.target.value })}>
                  <option value="">— Sin asignar —</option>
                  {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </Select>
              </Campo>
              <Campo label="Chofer">
                <Select value={f.chofer_id} onChange={(e) => setF({ ...f, chofer_id: e.target.value })}>
                  <option value="">— Sin asignar —</option>
                  {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select>
              </Campo>
            </div>
          </Bloque>

          <Bloque titulo="La primera parada" paso={2}>
            <div className="space-y-4">
              <Campo label="¿A dónde va?">
                <Input value={f.destino} autoFocus placeholder="Metepec, Toluca, CDMX…"
                  className="!py-2.5 !text-base"
                  onChange={(e) => setF({ ...f, destino: e.target.value })} />
              </Campo>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Precio del flete" hint="Es el ingreso de esta parada.">
                  <CampoMonto valor={f.precio} onCambio={(v) => setF({ ...f, precio: v })} />
                </Campo>
                <Campo label="Cliente">
                  <Select value={f.cliente_id} onChange={(e) => setF({ ...f, cliente_id: e.target.value })}>
                    <option value="">— Sin cliente —</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </Select>
                </Campo>
              </div>

              <Campo label="Vendedor" hint="Quien cerró la venta. Define su comisión al cerrar la ruta.">
                <Select value={f.vendedor_id} onChange={(e) => setF({ ...f, vendedor_id: e.target.value })}>
                  <option value="">— Sin vendedor —</option>
                  {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </Select>
              </Campo>

              <SelectorTamano valor={f.tamano_carga}
                onCambio={(t) => setF({ ...f, tamano_carga: t })} />

              <Interruptor activo={f.a_credito} onCambio={(v) => setF({ ...f, a_credito: v })}
                titulo="A crédito" detalle="Pagará después. Aparece en cuentas por cobrar." />
            </div>
          </Bloque>

          <Aviso error={error} />

          <AccionesModal>
            <Boton variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
            <Boton variante="suave" onClick={() => crear(false)} disabled={cargando}>
              Guardar y seguir aquí
            </Boton>
            <Boton onClick={() => crear(true)} disabled={cargando}>
              {cargando ? 'Creando…' : 'Crear y abrir'}
            </Boton>
          </AccionesModal>
        </div>
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Tabla
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Una fila = un viaje contado como historia: a dónde fue, para quién, con
 * quién, y en qué terminó.
 *
 * Las celdas llevan dos renglones a propósito. Nueve columnas delgadas caben,
 * pero no se leen: el ojo tiene que saltar de un extremo a otro para juntar
 * "destino" con "cliente". Apilar el dato secundario debajo del principal
 * agrupa lo que va junto y deja las cifras solas a la derecha, alineadas.
 *
 * Las tres columnas de dinero están en orden de resta —Ingreso, Costos,
 * Utilidad— para que el renglón se pueda comprobar de memoria.
 */
function Tabla({ rutas }: { rutas: FilaRuta[] }) {
  const router = useRouter();

  if (rutas.length === 0) {
    return (
      <section className="tarjeta-tabla px-6 py-16 text-center">
        <p className="text-sm text-ink-mute">Ningún viaje en este periodo.</p>
      </section>
    );
  }

  return (
    <section className="tarjeta-tabla">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[62rem] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.08em] text-ink-mute">
              <th className="px-5 pb-3 pt-4 text-left font-medium">Viaje</th>
              <th className="px-3 pb-3 pt-4 text-left font-medium">Destino</th>
              <th className="px-3 pb-3 pt-4 text-left font-medium">Cliente</th>
              <th className="px-3 pb-3 pt-4 text-left font-medium">Tripulación</th>
              <th className="px-3 pb-3 pt-4 text-right font-medium">Km</th>
              <th className="px-3 pb-3 pt-4 text-right font-medium">Venta</th>
              <th className="px-3 pb-3 pt-4 text-right font-medium">Costos</th>
              <th className="px-3 pb-3 pt-4 text-right font-medium">Utilidad</th>
              <th className="px-5 pb-3 pt-4 text-right font-medium">Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rutas.map((r) => {
              const utilidad = Number(r.utilidad);
              const m = r.margen_pct != null ? Number(r.margen_pct) : null;
              // Todo lo que el viaje se comió: gastos reales, comisiones y la
              // renta de la unidad. Con esto, Ingreso − Costos = Utilidad.
              const costos = Number(r.ingreso) - utilidad;
              const extra = r.destinos.length - 1;
              return (
                <tr key={r.ruta_id} onClick={() => router.push(`/rutas/${r.ruta_id}`)}
                  className="fila cursor-pointer align-middle">
                  {/* Viaje: folio, fecha y estado */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[r.estado]}`} />
                      <div className="min-w-0">
                        <p className="cifra font-medium leading-tight">#{r.folio}</p>
                        <p className="mt-0.5 text-xs leading-tight text-ink-mute">
                          {fechaCorta(r.fecha)} · {r.estado.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Destino: el primero manda, los demás se cuentan */}
                  <td className="max-w-[15rem] px-3 py-3.5">
                    <p className="truncate font-medium leading-tight">{r.destinos[0] ?? '—'}</p>
                    {extra > 0 && (
                      <p className="mt-0.5 truncate text-xs leading-tight text-ink-mute">
                        y {extra} parada{extra > 1 ? 's' : ''} más
                      </p>
                    )}
                  </td>

                  <td className="max-w-[12rem] px-3 py-3.5">
                    <p className="truncate leading-tight text-ink-soft">{r.clientes[0] ?? '—'}</p>
                    {r.clientes.length > 1 && (
                      <p className="mt-0.5 text-xs leading-tight text-ink-mute">
                        y {r.clientes.length - 1} más
                      </p>
                    )}
                  </td>

                  {/* Tripulación y unidad: quién lo manejó y en qué */}
                  <td className="max-w-[12rem] px-3 py-3.5">
                    <p className="truncate leading-tight text-ink-soft">
                      {r.chofer ?? <span className="text-ink-mute">sin chofer</span>}
                    </p>
                    <p className="mt-0.5 truncate text-xs leading-tight text-ink-mute">
                      {r.vehiculo ?? 'sin unidad'}
                      {r.ayudantes.length > 0 && ` · +${r.ayudantes.length} ayud.`}
                    </p>
                  </td>

                  <td className="cifra px-3 py-3.5 text-right text-ink-soft">
                    {r.km_total ? Number(r.km_total).toLocaleString('es-MX') : '—'}
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <p className="cifra font-medium leading-tight">{mxn(Number(r.ingreso))}</p>
                    {/* Solo se anota lo que falta cobrar: si ya entró completo,
                        repetir la cifra no agrega nada y ensucia la columna. */}
                    {Number(r.porCobrar ?? 0) > 0 && (
                      <p className="cifra mt-0.5 text-[11px] leading-tight text-warn">
                        {mxn(Number(r.porCobrar))} por cobrar
                      </p>
                    )}
                  </td>
                  <td className="cifra px-3 py-3.5 text-right text-ink-mute">
                    {costos ? `−${mxn(costos)}` : mxn(0)}
                  </td>
                  <td className={`cifra px-3 py-3.5 text-right font-medium ${utilidad < 0 ? 'text-bad' : ''}`}>
                    {mxn(utilidad)}
                  </td>
                  <td className="px-5 py-3.5">
                    <BarraMargen pct={m} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Margen como cifra y como barra. La barra se llena sobre 50%: por encima de
 * eso el viaje ya es excelente y estirar la escala a 100 aplastaría todas las
 * diferencias que importan en la parte baja.
 */
function BarraMargen({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="cifra block text-right text-ink-mute">—</span>;
  const color = pct < 0 ? 'bg-bad' : pct < 15 ? 'bg-warn' : 'bg-good';
  const texto = pct < 0 ? 'text-bad' : pct < 15 ? 'text-warn' : 'text-good';
  return (
    <div className="flex items-center justify-end gap-2.5">
      <span aria-hidden className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.08]">
        <span className={`block h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, (pct / 50) * 100))}%` }} />
      </span>
      <span className={`cifra w-11 text-right font-medium ${texto}`}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function Resumen({ etiqueta, valor, tono }: {
  etiqueta: string; valor: string; tono?: 'bueno' | 'aviso' | 'malo';
}) {
  const color = tono === 'malo' ? 'text-bad' : tono === 'aviso' ? 'text-warn'
    : tono === 'bueno' ? 'text-good' : 'text-ink';
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[11px] uppercase tracking-[0.08em] text-ink-mute">{etiqueta}</span>
      <span className={`cifra font-medium ${color}`}>{valor}</span>
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Board
   ══════════════════════════════════════════════════════════════════════════ */

const COLUMNAS: { estado: EstadoRuta; titulo: string }[] = [
  { estado: 'cotizada', titulo: 'Cotizada' },
  { estado: 'agendada', titulo: 'Agendada' },
  { estado: 'en_curso', titulo: 'En curso' },
  { estado: 'entregada', titulo: 'Entregada' },
];

function Board({ rutas }: { rutas: FilaRuta[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNAS.map((col) => {
        const suyas = rutas
          .filter((r) => r.estado === col.estado)
          .sort((a, b) => b.fecha.localeCompare(a.fecha));
        const ingreso = suyas.reduce((s, r) => s + Number(r.ingreso), 0);
        return (
          <section key={col.estado} className="tarjeta-tabla flex flex-col">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2">
                <span aria-hidden className={`h-2 w-2 rounded-full ${PUNTO[col.estado]}`} />
                <h2 className="text-sm font-medium">{col.titulo}</h2>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-ink-mute">
                  {suyas.length}
                </span>
              </div>
              {ingreso > 0 && <span className="cifra text-xs text-ink-mute">{mxn(ingreso)}</span>}
            </div>

            <div className="flex-1 space-y-2 p-3">
              {suyas.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-ink-mute">Nada aquí.</p>
              )}
              {suyas.slice(0, 12).map((r) => {
                const m = r.margen_pct != null ? Number(r.margen_pct) : null;
                return (
                  <Link key={r.ruta_id} href={`/rutas/${r.ruta_id}`}
                    className="block rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5
                      transition hover:border-white/20">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{r.destinos[0] ?? `#${r.folio}`}</span>
                      <span className="cifra shrink-0 text-sm">{mxn(Number(r.ingreso))}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-mute">
                      #{r.folio} · {fechaCorta(r.fecha, false)} · {r.chofer ?? 'sin chofer'}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-ink-mute">
                        {r.num_envios} {r.num_envios === 1 ? 'parada' : 'paradas'}
                      </span>
                      <span className={m == null ? 'text-ink-mute'
                        : m < 0 ? 'text-bad' : m < 15 ? 'text-warn' : 'text-good'}>
                        {m != null ? `${m.toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  </Link>
                );
              })}
              {suyas.length > 12 && (
                <p className="px-1 pt-1 text-center text-xs text-ink-mute">
                  y {suyas.length - 12} más
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
