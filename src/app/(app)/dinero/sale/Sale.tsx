'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import {
  Campo, Input, Select, Boton, BotonMini, Aviso, Chip, Etiqueta, useAccion,
} from '@/components/ui';
import Comprobante, { type LineaComprobante } from '@/components/Comprobante';
import Evidencias, { ContadorEvidencias } from '@/components/Evidencias';
import QuienTuvo, { custodiaABody } from '@/components/QuienTuvo';
import { SelectorMetodo } from '@/components/ComoSePago';
import FondoRenta from '../FondoRenta';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import { dentro } from '@/components/FiltroPeriodo';
import { METODO_INFO, type Metodo, esMetodo } from '@/lib/cobro';
import { usePeriodo } from '../periodo';
import type { DatosDinero } from '../datos';
import type { ComPorPagar, ComDetalle } from '../tipos';
import type { Gasto, CategoriaGasto, TipoGasto, SubcategoriaGasto, Vehiculo } from '@/types';

type Bloque = 'comisiones' | 'renta' | 'gastos';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Lo que sale: a quién le debes y en qué se está yendo el dinero.
 *
 * Los tres bloques son deudas u salidas, no saldos: por eso viven juntos y no
 * revueltos con la caja. Se navegan con fichas y no con pestañas porque son
 * tres y no siete — la lista completa cabe de un vistazo y no hay que
 * recorrerla para saber qué hay.
 */
export default function Sale({ datos }: { datos: DatosDinero }) {
  const router = useRouter();
  const { activo } = usePeriodo();
  const { cargando, error, correr, setError } = useAccion();
  const [bloque, setBloque] = useState<Bloque>('comisiones');

  async function accion(fn: () => Promise<void>) {
    await correr(async () => { await fn(); router.refresh(); });
  }

  const totalComs = datos.comisiones.reduce((s, c) => s + Number(c.total_devengado), 0);
  const saldoFondo = Number(datos.fondo?.saldo ?? 0);
  const gastosPeriodo = datos.gastosFijos
    .filter((g) => dentro(g.fecha, activo))
    .reduce((s, g) => s + Number(g.monto), 0);

  const bloques: { id: Bloque; label: string; badge: string }[] = [
    { id: 'comisiones', label: 'Comisiones', badge: mxn(totalComs) },
    { id: 'renta', label: 'Fondo de renta', badge: mxn(saldoFondo) },
    { id: 'gastos', label: 'Gastos y retiros', badge: mxn(gastosPeriodo) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {bloques.map((b) => (
          <button key={b.id} onClick={() => { setError(null); setBloque(b.id); }}
            aria-pressed={bloque === b.id}
            className={`rounded-xl border px-4 py-2.5 text-left transition ${
              bloque === b.id
                ? 'border-brand bg-brand/[0.08]'
                : 'border-surface-line bg-surface-raised hover:border-ink-mute'
            }`}>
            <span className={`block text-sm font-medium ${bloque === b.id ? 'text-brand' : 'text-ink'}`}>
              {b.label}
            </span>
            <span className="cifra mt-0.5 block text-xs text-ink-mute">{b.badge}</span>
          </button>
        ))}
      </div>

      <Aviso error={error} />

      {bloque === 'comisiones' && (
        <Comisiones personas={datos.comisiones} detalle={datos.comisionesDetalle}
          total={totalComs} cargando={cargando} accion={accion} />
      )}
      {bloque === 'renta' && (
        <FondoRenta fondo={datos.fondo} porUnidad={datos.fondoUnidad} rentas={datos.rentas}
          pagos={datos.pagosRenta} cargando={cargando} accion={accion}
          disponible={datos.fondo != null} />
      )}
      {bloque === 'gastos' && (
        <Gastos gastos={datos.gastosFijos} vehiculos={datos.vehiculos}
          subcategorias={datos.subcategorias} contactos={datos.contactos}
          nombrePorId={datos.nombrePorId} fase6={datos.fase6}
          evidencias={datos.evidenciasGasto}
          cargando={cargando} accion={accion} onRefrescar={() => router.refresh()} />
      )}
    </div>
  );
}

/* ══════════════════════════ Comisiones por pagar ══════════════════════════ */

function Comisiones({
  personas, detalle, total, cargando, accion,
}: {
  personas: ComPorPagar[]; detalle: ComDetalle[]; total: number; cargando: boolean;
  accion: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  // Se guarda lo que se acaba de pagar para poder emitir el comprobante: una
  // vez marcadas como pagadas, esas comisiones desaparecen de la lista.
  const [recibo, setRecibo] = useState<
    { para: string; monto: number; lineas: LineaComprobante[] } | null
  >(null);

  const porPersona = useMemo(() => {
    const m: Record<string, ComDetalle[]> = {};
    for (const c of detalle) (m[c.contacto_id] ??= []).push(c);
    return m;
  }, [detalle]);

  function alternar(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const totalSel = detalle.filter((c) => sel.has(c.id)).reduce((s, c) => s + Number(c.monto), 0);

  /** Con ids paga solo esas; sin ellos liquida todo lo devengado de la persona. */
  async function pagar(ids: string[], persona: ComPorPagar) {
    // El detalle se retiene ANTES de pagar: después ya no está en la lista.
    const filas = (porPersona[persona.contacto_id] ?? [])
      .filter((f) => (ids.length ? ids.includes(f.id) : true));
    const monto = ids.length
      ? filas.reduce((s, f) => s + Number(f.monto), 0)
      : Number(persona.total_devengado);

    await accion(async () => {
      await api('/api/comisiones', {
        method: 'PATCH',
        body: ids.length ? { ids, marcar: 'pagada' } : { contacto_id: persona.contacto_id, marcar: 'pagada' },
      });
      setSel(new Set());
      setRecibo({
        para: persona.nombre,
        monto,
        lineas: filas.map((f) => ({
          etiqueta: `Ruta #${f.folio ?? '—'}`,
          detalle: `${f.rol}${f.fecha ? ` · ${fechaCorta(f.fecha, false)}` : ''}`,
          monto: Number(f.monto),
        })),
      });
    });
  }

  return (
    <section className="tarjeta p-0">
      <div className="flex items-center justify-between border-b border-surface-line px-5 py-3">
        <h2 className="text-sm font-semibold">Comisiones devengadas</h2>
        <span className="text-xs text-ink-mute">Se generan al cerrar cada ruta</span>
      </div>

      {personas.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-ink-mute">
          No hay comisiones pendientes de pago.
        </p>
      )}

      <div className="divide-y divide-surface-line">
        {personas.map((p) => {
          const filas = porPersona[p.contacto_id] ?? [];
          const abiertaEsta = abierta === p.contacto_id;
          const selDeEsta = filas.filter((f) => sel.has(f.id));
          return (
            <div key={p.contacto_id}>
              <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                <button onClick={() => setAbierta(abiertaEsta ? null : p.contacto_id)}
                  className="flex items-center gap-2 text-left">
                  <span className="text-ink-mute">{abiertaEsta ? '▾' : '▸'}</span>
                  <span className="font-medium">{p.nombre}</span>
                </button>
                <span className="text-xs text-ink-mute">
                  {plural(Number(p.num_comisiones), 'comisión', 'comisiones')} · desde {p.desde}
                </span>
                <span className="ml-auto cifra font-medium">{mxn(Number(p.total_devengado))}</span>
                <BotonMini disabled={cargando}
                  onClick={() => confirm(`¿Marcar como pagadas todas las comisiones de ${p.nombre} (${mxn(Number(p.total_devengado))})?`)
                    && pagar([], p)}>
                  Pagar todo
                </BotonMini>
              </div>

              {abiertaEsta && (
                <div className="bg-surface-raised/60 px-5 pb-4">
                  <table className="w-full text-sm">
                    <tbody>
                      {filas.map((f) => (
                        <tr key={f.id} className="border-t border-surface-line/60">
                          <td className="w-8 py-2 pr-3">
                            <input type="checkbox" checked={sel.has(f.id)} onChange={() => alternar(f.id)} />
                          </td>
                          <td className="py-2 pr-3">
                            <Link href={`/rutas/${f.ruta_id}`} className="text-brand hover:underline">
                              Ruta #{f.folio ?? '—'}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-ink-soft">{f.fecha ?? '—'}</td>
                          <td className="py-2 pr-3"><Etiqueta tono="info">{f.rol}</Etiqueta></td>
                          <td className="cifra py-2 text-right">{mxn(Number(f.monto))}</td>
                        </tr>
                      ))}
                      {filas.length === 0 && (
                        <tr><td className="py-3 text-ink-mute">Sin detalle disponible.</td></tr>
                      )}
                    </tbody>
                  </table>
                  {selDeEsta.length > 0 && (
                    <div className="mt-3">
                      <Boton disabled={cargando} onClick={() => pagar(selDeEsta.map((f) => f.id), p)}>
                        Pagar {plural(selDeEsta.length, 'seleccionada', 'seleccionadas')} · {mxn(selDeEsta.reduce((s, f) => s + Number(f.monto), 0))}
                      </Boton>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {personas.length > 0 && (
        <div className="flex items-center justify-between border-t border-surface-line bg-surface-raised/60 px-5 py-3">
          <span className="text-xs uppercase tracking-wide text-ink-mute">
            {sel.size > 0 ? plural(sel.size, 'seleccionada', 'seleccionadas') : 'Total por pagar'}
          </span>
          <span className="cifra font-semibold">{sel.size > 0 ? mxn(totalSel) : mxn(total)}</span>
        </div>
      )}

      {recibo && (
        <Comprobante abierto onCerrar={() => setRecibo(null)}
          titulo="Comprobante de pago" concepto="Comisiones de flete"
          para={recibo.para} monto={recibo.monto}
          fecha={new Date().toISOString().slice(0, 10)}
          lineas={recibo.lineas}
          nota="Comisiones devengadas por los viajes listados, liquidadas en esta fecha." />
      )}
    </section>
  );
}

/* ══════════════════════════ Gastos, inversión y retiros ══════════════════════════ */

const CAT_FIJAS: { v: CategoriaGasto; label: string }[] = [
  { v: 'mantenimiento', label: 'Mantenimiento' }, { v: 'seguro', label: 'Seguro' },
  { v: 'tenencia', label: 'Tenencia' }, { v: 'sueldo', label: 'Sueldo base' },
  { v: 'administrativo', label: 'Administrativo' }, { v: 'otro', label: 'Otro' },
];
const CAT_LABEL: Record<string, string> = Object.fromEntries(CAT_FIJAS.map((c) => [c.v, c.label]));

const TIPOS: { v: TipoGasto; label: string; hint: string }[] = [
  { v: 'operativo', label: 'Gasto fijo', hint: 'Sale del negocio y sí baja el margen.' },
  { v: 'inversion', label: 'Inversión', hint: 'Compra de activos. Afecta la caja, no el margen.' },
  { v: 'retiro', label: 'Retiro', hint: 'Dinero que sacas para ti. Afecta la caja, no el margen.' },
];

/**
 * Las salidas que no son de un viaje.
 *
 * La subcategoría es lo que vuelve útil esta lista: "mantenimiento $4,200" no
 * dice nada, "llantas $2,800 · limpieza $600 · afinación $800" sí. La
 * categoría no se toca porque de ella cuelga el cálculo de rentabilidad; la
 * subcategoría se da de alta en Configuración, sin tocar la base.
 */
function Gastos({
  gastos, vehiculos, subcategorias, contactos, nombrePorId, fase6, evidencias,
  cargando, accion, onRefrescar,
}: {
  gastos: Gasto[]; vehiculos: Vehiculo[]; subcategorias: SubcategoriaGasto[];
  contactos: { id: string; nombre: string }[];
  nombrePorId: Record<string, string>; fase6: boolean;
  evidencias: Record<string, number>;
  cargando: boolean; accion: (fn: () => Promise<void>) => Promise<void>;
  onRefrescar: () => void;
}) {
  const { activo, etiqueta } = usePeriodo();
  const hoy = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    fecha: hoy, categoria: 'mantenimiento' as CategoriaGasto, subcategoria_id: '',
    tipo: 'operativo' as TipoGasto, monto: '', vehiculo_id: '', descripcion: '',
    metodo: 'efectivo' as Metodo | null,
  });
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoGasto>('todos');
  const [filtroCat, setFiltroCat] = useState<'todas' | string>('todas');
  const [abierto, setAbierto] = useState<string | null>(null);

  const subsAlta = subcategorias.filter((s) => s.categoria === f.categoria);

  // El periodo manda también aquí: si arriba dice "este mes", la lista de
  // abajo tiene que hablar del mismo mes o las dos cifras no se pueden sumar.
  const lista = gastos.filter((g) =>
    dentro(g.fecha, activo)
    && (filtroTipo === 'todos' || g.tipo === filtroTipo)
    && (filtroCat === 'todas' || g.categoria === filtroCat));
  const totalLista = lista.reduce((s, g) => s + Number(g.monto), 0);

  // Cuánto se fue en cada cosa, ya con la subcategoría: el corte que faltaba.
  const porConcepto = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of lista) {
      const sub = subcategorias.find((s) => s.id === g.subcategoria_id);
      const k = sub ? `${CAT_LABEL[g.categoria] ?? g.categoria} · ${sub.nombre}`
        : (CAT_LABEL[g.categoria] ?? g.categoria);
      m.set(k, (m.get(k) ?? 0) + Number(g.monto));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [lista, subcategorias]);

  async function agregar() {
    await accion(async () => {
      if (!f.monto) throw new Error('Escribe el monto.');
      await api('/api/gastos', { method: 'POST', body: {
        fecha: f.fecha, categoria: f.categoria, tipo: f.tipo, monto: f.monto,
        subcategoria_id: f.subcategoria_id || null,
        vehiculo_id: f.vehiculo_id || null, descripcion: f.descripcion || null,
        metodo_pago: f.metodo,
      } });
      setF({ ...f, monto: '', descripcion: '' });
    });
  }

  const tipoActual = TIPOS.find((t) => t.v === f.tipo)!;
  const cats = [...new Set(gastos.map((g) => g.categoria))];

  return (
    <div className="space-y-5">
      {/* Alta rápida, siempre a la vista */}
      <section className="tarjeta space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-semibold">Registrar salida de dinero</h2>
          {TIPOS.map((t) => (
            <Chip key={t.v} activo={f.tipo === t.v}
              onClick={() => setF({ ...f, tipo: t.v, subcategoria_id: '',
                categoria: t.v === 'operativo' ? 'mantenimiento' : 'otro' })}>
              {t.label}
            </Chip>
          ))}
          <span className="w-full text-xs text-ink-mute sm:w-auto">{tipoActual.hint}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Campo label="Fecha">
            <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </Campo>
          <Campo label="Monto">
            <Input className="cifra" type="number" inputMode="decimal" placeholder="0.00" value={f.monto}
              onChange={(e) => setF({ ...f, monto: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !cargando) agregar(); }} />
          </Campo>
          <Campo label="Categoría">
            <Select value={f.categoria}
              onChange={(e) => setF({ ...f, categoria: e.target.value as CategoriaGasto, subcategoria_id: '' })}>
              {CAT_FIJAS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </Select>
          </Campo>
          <Campo label="Subcategoría"
            hint={fase6 && subsAlta.length === 0 ? 'Se dan de alta en Configuración.' : undefined}>
            <Select value={f.subcategoria_id} disabled={!fase6 || subsAlta.length === 0}
              onChange={(e) => setF({ ...f, subcategoria_id: e.target.value })}>
              <option value="">— Sin especificar —</option>
              {subsAlta.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label="Unidad">
            <Select value={f.vehiculo_id} onChange={(e) => setF({ ...f, vehiculo_id: e.target.value })}>
              <option value="">— Ninguna —</option>
              {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label="Descripción">
            <Input placeholder="Opcional" value={f.descripcion}
              onChange={(e) => setF({ ...f, descripcion: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !cargando) agregar(); }} />
          </Campo>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <SelectorMetodo valor={f.metodo} onCambio={(m) => setF({ ...f, metodo: m })}
            etiqueta="¿Con qué se pagó?" />
          <Boton disabled={cargando} onClick={agregar}>{cargando ? 'Guardando…' : 'Registrar'}</Boton>
        </div>
        {fase6 && (
          <p className="text-[11px] leading-tight text-ink-mute">
            La foto del ticket se agrega abriendo el gasto en la lista, ya que exista.
          </p>
        )}
      </section>

      {/* En qué se está yendo el dinero */}
      {porConcepto.length > 1 && (
        <section className="tarjeta">
          <h2 className="text-sm font-semibold">En qué se fue · {etiqueta}</h2>
          <ul className="mt-3 space-y-1.5">
            {porConcepto.map(([concepto, monto]) => (
              <li key={concepto}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink-soft">{concepto}</span>
                  <span className="cifra shrink-0 font-medium">{mxn(monto)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full bg-brand/60"
                    style={{ width: `${totalLista ? (monto / totalLista) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tarjeta p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-surface-line px-5 py-3">
          <h2 className="text-sm font-semibold">Salidas de {etiqueta}</h2>
          <div className="flex flex-wrap gap-1.5">
            <Chip activo={filtroTipo === 'todos'} onClick={() => setFiltroTipo('todos')}>Todos</Chip>
            {TIPOS.map((t) => (
              <Chip key={t.v} activo={filtroTipo === t.v} onClick={() => setFiltroTipo(t.v)}>{t.label}</Chip>
            ))}
          </div>
          <Select className="ml-auto max-w-[11rem]" value={filtroCat}
            onChange={(e) => setFiltroCat(e.target.value)}>
            <option value="todas">Todas las categorías</option>
            {cats.map((c) => <option key={c} value={c}>{CAT_LABEL[c] ?? c}</option>)}
          </Select>
        </div>

        {lista.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-mute">
            {gastos.length === 0
              ? 'Aún no registras gastos fuera de ruta.'
              : `Nada en ${etiqueta} con ese filtro.`}
          </p>
        ) : (
          <ul className="divide-y divide-surface-line">
            {lista.map((g) => (
              <FilaGasto key={g.id} gasto={g} subcategorias={subcategorias} vehiculos={vehiculos}
                contactos={contactos} nombrePorId={nombrePorId} fase6={fase6}
                evidencias={evidencias[g.id] ?? 0}
                abierta={abierto === g.id}
                onAbrir={() => setAbierto(abierto === g.id ? null : g.id)}
                onGuardar={(campos) => accion(async () => {
                  await api('/api/gastos', { method: 'PATCH', body: { id: g.id, ...campos } });
                })}
                onEliminar={() => {
                  if (!confirm('¿Eliminar este gasto y sus evidencias?')) return;
                  accion(async () => {
                    await api('/api/gastos', { method: 'DELETE', body: { id: g.id } });
                  });
                }}
                onRefrescar={onRefrescar} />
            ))}
          </ul>
        )}

        {lista.length > 0 && (
          <div className="flex items-center justify-between border-t border-surface-line bg-surface-raised px-5 py-3">
            <span className="text-xs uppercase tracking-wide text-ink-mute">
              {plural(lista.length, 'salida', 'salidas')}
            </span>
            <span className="cifra font-semibold">{mxn(totalLista)}</span>
          </div>
        )}
      </section>
    </div>
  );
}

/** Un gasto: cerrado dice lo esencial, abierto se edita completo. */
function FilaGasto({
  gasto, subcategorias, vehiculos, contactos, nombrePorId, fase6, evidencias,
  abierta, onAbrir, onGuardar, onEliminar, onRefrescar,
}: {
  gasto: Gasto; subcategorias: SubcategoriaGasto[]; vehiculos: Vehiculo[];
  contactos: { id: string; nombre: string }[];
  nombrePorId: Record<string, string>; fase6: boolean; evidencias: number;
  abierta: boolean; onAbrir: () => void;
  onGuardar: (campos: Record<string, unknown>) => void;
  onEliminar: () => void; onRefrescar: () => void;
}) {
  const subs = subcategorias.filter((s) => s.categoria === gasto.categoria);
  const sub = subcategorias.find((s) => s.id === gasto.subcategoria_id);
  const metodo = esMetodo(gasto.metodo_pago) ? gasto.metodo_pago : null;
  const tipo = TIPOS.find((t) => t.v === gasto.tipo);

  return (
    <li>
      <button onClick={onAbrir} className="flex w-full items-center gap-3 px-5 py-3 text-left">
        <span className="w-20 shrink-0 whitespace-nowrap text-xs text-ink-mute">
          {fechaCorta(gasto.fecha, false)}
        </span>
        <span className="w-32 shrink-0 truncate text-sm font-medium">
          {CAT_LABEL[gasto.categoria] ?? gasto.categoria}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-mute">
          {[sub?.nombre, gasto.descripcion].filter(Boolean).join(' · ') || '—'}
        </span>
        {gasto.tipo !== 'operativo' && (
          <Etiqueta tono={gasto.tipo === 'inversion' ? 'info' : 'aviso'}>{tipo?.label}</Etiqueta>
        )}
        {metodo && <Etiqueta tono="neutro">{METODO_INFO[metodo].corto}</Etiqueta>}
        <ContadorEvidencias n={evidencias} />
        <span className="cifra shrink-0 font-medium">{mxn(Number(gasto.monto))}</span>
        <span aria-hidden className={`shrink-0 text-ink-mute transition-transform ${abierta ? 'rotate-90' : ''}`}>›</span>
      </button>

      {abierta && (
        <div className="space-y-3 border-t border-surface-line bg-white/[0.015] px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Campo label="Fecha">
              <Input type="date" defaultValue={gasto.fecha}
                onBlur={(e) => { if (e.target.value && e.target.value !== gasto.fecha) onGuardar({ fecha: e.target.value }); }} />
            </Campo>
            <Campo label="Monto">
              <Input className="cifra" type="number" inputMode="decimal" defaultValue={gasto.monto}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (!v || Number(v) === Number(gasto.monto)) return;
                  onGuardar({ monto: v });
                }} />
            </Campo>
            <Campo label="Categoría">
              <Select defaultValue={gasto.categoria}
                onChange={(e) => onGuardar({ categoria: e.target.value, subcategoria_id: null })}>
                {CAT_FIJAS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </Select>
            </Campo>
            {fase6 && (
              <Campo label="Subcategoría" hint={subs.length ? undefined : 'Se dan de alta en Configuración.'}>
                <Select defaultValue={gasto.subcategoria_id ?? ''} disabled={subs.length === 0}
                  onChange={(e) => onGuardar({ subcategoria_id: e.target.value || null })}>
                  <option value="">— Sin especificar —</option>
                  {subs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </Select>
              </Campo>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Tipo" hint={TIPOS.find((t) => t.v === gasto.tipo)?.hint}>
              <Select defaultValue={gasto.tipo} onChange={(e) => onGuardar({ tipo: e.target.value })}>
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </Select>
            </Campo>
            <Campo label="Unidad">
              <Select defaultValue={gasto.vehiculo_id ?? ''}
                onChange={(e) => onGuardar({ vehiculo_id: e.target.value || null })}>
                <option value="">— Ninguna —</option>
                {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </Select>
            </Campo>
            <Campo label="Descripción">
              <Input defaultValue={gasto.descripcion ?? ''}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (gasto.descripcion ?? '')) onGuardar({ descripcion: v || null });
                }} />
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectorMetodo valor={metodo} onCambio={(m) => onGuardar({ metodo_pago: m })} />
            <QuienTuvo valor={{ contactoId: gasto.pagado_por, otro: gasto.pagado_por_otro ?? '' }}
              onCambio={(c) => onGuardar(custodiaABody(c, 'pagado_por'))}
              etiqueta="¿Quién lo pagó?" sugeridos={contactos} />
          </div>

          <Campo label="Comentario">
            <textarea defaultValue={gasto.notas ?? ''} rows={2}
              placeholder="Se cambió la llanta trasera derecha…"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (gasto.notas ?? '')) onGuardar({ notas: v || null });
              }}
              className="w-full resize-y rounded-xl border border-surface-line bg-surface-raised px-3 py-2
                text-sm leading-relaxed text-ink outline-none transition placeholder:text-ink-mute
                focus:border-brand focus:ring-2 focus:ring-brand/25" />
          </Campo>

          {fase6 && <Evidencias dueno={{ gasto_id: gasto.id }} titulo="Comprobante" onCambio={onRefrescar} />}

          <div className="flex flex-wrap items-center gap-3">
            <BotonMini onClick={onEliminar}>Eliminar gasto</BotonMini>
            <span className="text-[11px] text-ink-mute">
              Los cambios se guardan al salir de cada campo.
              {gasto.vehiculo_id && ` · Unidad: ${nombrePorId[gasto.vehiculo_id] ?? '—'}`}
            </span>
          </div>
        </div>
      )}
    </li>
  );
}
