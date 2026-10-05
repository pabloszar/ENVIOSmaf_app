'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import { Campo, Input, Select, Boton, Aviso, Panel, Etiqueta, useAccion } from '@/components/ui';
import { Sparkline } from '@/components/Cifras';
import { Cifra, Barra } from '@/components/movimiento';
import { mxn } from '@/lib/pricing';
import type { Vehiculo, RutaPnl } from '@/types';
import Garage, { type UnidadGarage } from './Garage';

export interface FilaRent {
  vehiculo_id: string; vehiculo: string; propiedad: string; viajes: number;
  ingreso: number; utilidad: number; renta_generada: number;
  margen_pct: number | null; km_recorridos: number | null; gastos_fijos_unidad: number;
  utilidad_despues_fijos: number | null;
  ingreso_por_km: number | null; costo_viaje_por_km: number | null;
  ultimo_viaje: string | null;
}

const VACIO: Partial<Vehiculo> = { nombre: '', propiedad: 'propia', tipo: 'Pickup', activo: true };

/**
 * La flotilla, como garage.
 *
 * La pantalla es el garage entero y todo lo demás flota encima en vidrio,
 * igual que en el cotizador: allá el mapa es la decisión, aquí las unidades
 * son el tema, y ninguna de las dos cosas merece quedar en una tarjeta.
 *
 * Elegir una unidad no navega ni abre un panel que tape: acerca la cámara y
 * trae sus cifras a los dos lados. Se sigue viendo de qué camioneta se habla
 * mientras se lee cuánto dejó, que era justo lo que el panel lateral de antes
 * tapaba.
 */
export default function Flotilla({
  vehiculos, rentabilidad, viajes, pctPropia, pctRentada,
}: {
  vehiculos: Vehiculo[];
  rentabilidad: FilaRent[];
  viajes: RutaPnl[];
  pctPropia: number;
  pctRentada: number;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Partial<Vehiculo> | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  /*
   * La última unidad que se miró, aunque ya se haya salido de ella.
   *
   * Las fichas no se desmontan al salir: se van deslizando. Si su contenido
   * dependiera de `elegida`, se vaciarían en el mismo instante en que
   * empiezan a irse y lo que se vería salir serían dos cajas en blanco.
   */
  const [ultima, setUltima] = useState<string | null>(null);
  /** Cuenta las entradas: es la `key` que vuelve a correr la cascada. */
  const [entrada, setEntrada] = useState(0);
  const { cargando, error, correr, setError } = useAccion();

  const rentPorId = new Map(rentabilidad.map((r) => [r.vehiculo_id, r]));

  function elegir(id: string | null) {
    if (id) {
      // Pasar de una unidad a la de junto NO cuenta como entrada: ahí las
      // cifras ruedan de un valor al otro, que es la comparación.
      if (!elegida) setEntrada((n) => n + 1);
      setUltima(id);
    }
    setElegida(id);
  }

  /** Utilidad mes a mes de una unidad, para su tendencia. */
  function serieDe(vehiculoId: string): number[] {
    const porMes = new Map<string, number>();
    for (const v of viajes) {
      if (v.vehiculo_id !== vehiculoId) continue;
      const mes = v.fecha.slice(0, 7);
      porMes.set(mes, (porMes.get(mes) ?? 0) + Number(v.utilidad));
    }
    return [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, n]) => n);
  }

  async function guardar() {
    if (!editando) return;
    await correr(async () => {
      const metodo = editando.id ? 'PATCH' : 'POST';
      await api('/api/vehiculos', { method: metodo, body: editando });
      setEditando(null);
      router.refresh();
    });
  }

  const unidades: UnidadGarage[] = vehiculos.map((v) => {
    const r = rentPorId.get(v.id);
    const margen = r?.margen_pct != null ? `${Number(r.margen_pct).toFixed(0)}%` : null;
    const n = Number(r?.viajes ?? 0);
    return {
      id: v.id,
      nombre: v.nombre,
      activa: v.activo,
      pie: !v.activo ? 'inactiva' : n === 0 ? 'sin viajes' : `${n} ${n === 1 ? 'viaje' : 'viajes'}${margen ? ` · ${margen}` : ''}`,
    };
  });

  const vista = vehiculos.find((v) => v.id === ultima) ?? null;
  const indice = vista ? vehiculos.indexOf(vista) : -1;
  const abierta = !!elegida;
  const utilidadTotal = rentabilidad.reduce((s, r) => s + Number(r.utilidad ?? 0), 0);
  const viajesTotal = rentabilidad.reduce((s, r) => s + Number(r.viajes ?? 0), 0);

  const ficha = vista && {
    v: vista,
    r: rentPorId.get(vista.id) ?? null,
    pct: vista.pct_renta ?? (vista.propiedad === 'rentada' ? pctRentada : pctPropia),
    serie: serieDe(vista.id),
    viajes: viajes.filter((x) => x.vehiculo_id === vista.id).slice(-5).reverse(),
    indice, total: vehiculos.length,
    onEditar: () => { setError(null); setEditando({ ...vista }); },
  };

  return (
    <div data-pantalla-completa className="relative h-full w-full overflow-hidden">
      <Garage unidades={unidades} elegida={elegida} onElegir={elegir} teclado={!editando} />

      {/* ── De lejos: de qué pantalla se trata y cuánto deja la flotilla ── */}
      <Capa abierta={!abierta} fuera={{ y: -10 }}
        className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-4 md:inset-x-6 md:top-5">
        <div className="entra">
          <p className="etiqueta">{vehiculos.length} {vehiculos.length === 1 ? 'unidad' : 'unidades'}</p>
          <h1 className="mt-1.5 text-3xl font-medium tracking-tight md:text-4xl">Flotilla</h1>
          <p className="cifra mt-2 text-xs text-ink-mute">
            <span className="text-ink-soft"><Cifra valor={utilidadTotal} /></span> de utilidad
            {' · '}<Cifra valor={viajesTotal} formato="entero" /> viajes
          </p>
        </div>
        <Boton className="pointer-events-auto shrink-0"
          onClick={() => { setError(null); setEditando({ ...VACIO }); }}>
          Nueva unidad
        </Boton>
      </Capa>

      {vehiculos.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <p className="vidrio entra px-6 py-5 text-center text-sm text-ink-soft">
            El garage está vacío. Da de alta la primera unidad.
          </p>
        </div>
      )}

      <Capa abierta={!abierta && vehiculos.length > 0} fuera={{ y: 8 }} retardo={500}
        className="pointer-events-none absolute inset-x-0 bottom-9 hidden justify-center lg:flex">
        <p className="cifra text-[10.5px] uppercase tracking-[0.18em] text-ink-mute">
          Elige una unidad
        </p>
      </Capa>

      {/* ── De cerca: la salida, siempre en el mismo sitio ── */}
      <Capa abierta={abierta} fuera={{ y: -10 }} retardo={160}
        className="absolute inset-x-0 top-4 z-20 flex justify-center px-3 md:top-5">
        <div className="vidrio-pastilla flex items-center gap-1 p-1">
          <button type="button" onClick={() => elegir(null)}
            className="pulsable flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium
              text-ink hover:bg-white/[0.07]">
            <span aria-hidden>←</span> Garage
            <kbd className="cifra ml-1 hidden rounded border border-white/[0.14] px-1 text-[10px] text-ink-mute lg:inline">esc</kbd>
          </button>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-white/[0.12]" />
          <Paso etiqueta="Unidad anterior" apagado={indice <= 0}
            onClick={() => elegir(vehiculos[indice - 1].id)}>‹</Paso>
          <span className="cifra min-w-[3.4rem] text-center text-xs text-ink-soft">
            {String(indice + 1).padStart(2, '0')} / {String(vehiculos.length).padStart(2, '0')}
          </span>
          <Paso etiqueta="Unidad siguiente" apagado={indice < 0 || indice >= vehiculos.length - 1}
            onClick={() => elegir(vehiculos[indice + 1].id)}>›</Paso>
        </div>
      </Capa>

      {/* ── Las fichas ──
          Dos, una a cada lado, y no una sola: a la izquierda quién es y
          cuánto dejó; a la derecha cómo rinde y qué ha hecho. La unidad
          queda en medio y es ella la que une las dos mitades. */}
      <Capa abierta={abierta} fuera={{ x: -30 }} retardo={220}
        className="absolute bottom-5 left-5 top-[4.75rem] z-10 hidden w-[332px] lg:block">
        <aside aria-label="Identidad y utilidad" className="vidrio max-h-full overflow-y-auto p-5">
          {ficha && <div key={entrada} className="cascada"><Identidad {...ficha} /></div>}
        </aside>
      </Capa>

      <Capa abierta={abierta} fuera={{ x: 30 }} retardo={300}
        className="absolute bottom-5 right-5 top-[4.75rem] z-10 hidden w-[332px] lg:block">
        <aside aria-label="Rendimiento y viajes" className="vidrio max-h-full overflow-y-auto p-5">
          {ficha && <div key={entrada} className="cascada"><Rendimiento {...ficha} /></div>}
        </aside>
      </Capa>

      {/* En el teléfono no caben a los lados: suben juntas desde abajo y la
          unidad se queda en el tercio de arriba. */}
      <Capa abierta={abierta} fuera={{ y: 36 }} retardo={220}
        className="absolute inset-x-2 bottom-2 top-[46%] z-10 lg:hidden">
        <aside aria-label="Datos de la unidad" className="vidrio h-full overflow-y-auto p-4">
          {ficha && (
            <div key={entrada} className="cascada">
              <Identidad {...ficha} />
              <div className="my-5 h-px bg-white/[0.08]" />
              <Rendimiento {...ficha} />
            </div>
          )}
        </aside>
      </Capa>

      {/* ── Alta / edición ── */}
      <Panel abierto={!!editando} onCerrar={() => setEditando(null)}
        titulo={editando?.id ? 'Editar unidad' : 'Nueva unidad'}>
        {editando && (
          <div className="space-y-4">
            <Campo label="Nombre" hint="El render se busca por este nombre: “NP300 Negra” → np300-negra.png">
              <Input value={editando.nombre ?? ''}
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="NP300 Negra" />
            </Campo>
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Placas"><Input value={editando.placas ?? ''}
                onChange={(e) => setEditando({ ...editando, placas: e.target.value })} /></Campo>
              <Campo label="Tipo"><Input value={editando.tipo ?? ''}
                onChange={(e) => setEditando({ ...editando, tipo: e.target.value })} placeholder="Pickup" /></Campo>
            </div>
            <Campo label="Propiedad">
              <Select value={editando.propiedad ?? 'propia'}
                onChange={(e) => setEditando({ ...editando, propiedad: e.target.value as Vehiculo['propiedad'] })}>
                <option value="propia">Propia</option>
                <option value="rentada">Rentada</option>
              </Select>
            </Campo>
            <div className="grid grid-cols-2 gap-4">
              <Campo label="% Renta" hint="Vacío = usar default">
                <Input type="number" step="0.5" value={editando.pct_renta ?? ''}
                  onChange={(e) => setEditando({ ...editando, pct_renta: e.target.value === '' ? null : Number(e.target.value) })} />
              </Campo>
              <Campo label="Rendimiento km/l" hint="Vacío = usar default">
                <Input type="number" step="0.1" value={editando.rendimiento_kml ?? ''}
                  onChange={(e) => setEditando({ ...editando, rendimiento_kml: e.target.value === '' ? null : Number(e.target.value) })} />
              </Campo>
            </div>
            <Campo label="Capacidad"><Input value={editando.capacidad ?? ''}
              onChange={(e) => setEditando({ ...editando, capacidad: e.target.value })} placeholder="1 tonelada" /></Campo>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editando.activo ?? true}
                onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
              Activa
            </label>
            <Aviso error={error} />
            <div className="flex gap-3 pt-2">
              <Boton onClick={guardar} disabled={cargando}>{cargando ? 'Guardando…' : 'Guardar'}</Boton>
              <Boton variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Boton>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}


/**
 * Algo que flota sobre el garage y entra o se va sin desmontarse.
 *
 * `inert` mientras está fuera: sigue en el DOM —para poder irse animando— y
 * sin eso el tabulador entraría a los enlaces de una ficha invisible.
 */
function Capa({
  abierta, fuera, retardo = 0, className = '', children,
}: {
  abierta: boolean;
  /** Hacia dónde se va, en píxeles. */
  fuera: { x?: number; y?: number };
  retardo?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.inert = !abierta; }, [abierta]);
  return (
    <div ref={ref} data-abierta={abierta} aria-hidden={!abierta}
      className={`garage-capa ${className}`}
      style={{
        '--fuera-x': `${fuera.x ?? 0}px`, '--fuera-y': `${fuera.y ?? 0}px`, '--retardo': `${retardo}ms`,
      } as React.CSSProperties}>
      {children}
    </div>
  );
}

function Paso({ etiqueta, apagado, onClick, children }: {
  etiqueta: string; apagado: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={etiqueta} disabled={apagado} onClick={onClick}
      className="pulsable flex h-9 w-9 items-center justify-center rounded-full text-lg leading-none
        text-ink-soft hover:bg-white/[0.07] hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent">
      <span aria-hidden>{children}</span>
    </button>
  );
}

interface DatosFicha {
  v: Vehiculo;
  r: FilaRent | null;
  pct: number;
  serie: number[];
  viajes: RutaPnl[];
  indice: number;
  total: number;
  onEditar: () => void;
}

/** Quién es y cuánto dejó. */
function Identidad({ v, r, indice, total, onEditar }: DatosFicha) {
  const margen = r?.margen_pct != null ? Number(r.margen_pct) : null;
  const alFinal = Number(r?.utilidad_despues_fijos ?? r?.utilidad ?? 0);
  const tono = margen == null ? 'text-ink' : margen < 0 ? 'text-bad' : margen < 15 ? 'text-warn' : 'text-good';
  const detalles = [v.tipo, v.placas, v.capacidad].filter(Boolean).join(' · ');

  return (
    <>
      <div>
        <p className="cifra text-[10.5px] uppercase tracking-[0.18em] text-ink-mute">
          Unidad {String(indice + 1).padStart(2, '0')} de {String(total).padStart(2, '0')}
        </p>
        <h2 className="mt-2 text-[1.7rem] font-medium leading-tight tracking-tight">{v.nombre}</h2>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Etiqueta tono={v.propiedad === 'rentada' ? 'aviso' : 'info'}>{v.propiedad}</Etiqueta>
          {!v.activo && <Etiqueta>inactiva</Etiqueta>}
          {detalles && <span className="text-xs text-ink-mute">{detalles}</span>}
        </div>
      </div>

      <div className="mt-6 border-t border-white/[0.08] pt-5">
        <p className="etiqueta">Utilidad</p>
        <p className={`mt-2 text-[2.6rem] font-light leading-none tracking-tighter ${tono}`}>
          <Cifra valor={Number(r?.utilidad ?? 0)} />
        </p>
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-ink-mute">Margen</span>
          <span className={`cifra font-medium ${tono}`}>{margen != null ? `${margen.toFixed(1)}%` : '—'}</span>
        </div>
        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.08]">
          {/* La `key` hace que la barra vuelva a llenarse al cambiar de unidad. */}
          <Barra key={v.id} pct={Math.max(0, Math.min(100, margen ?? 0))}
            className={margen != null && margen < 15 ? 'bg-warn' : 'bg-good'} />
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        <Dato etiqueta="Viajes"><Cifra valor={Number(r?.viajes ?? 0)} formato="entero" /></Dato>
        <Dato etiqueta="Ingreso"><Cifra valor={Number(r?.ingreso ?? 0)} /></Dato>
        <Dato etiqueta="Renta generada"><Cifra valor={Number(r?.renta_generada ?? 0)} /></Dato>
        <Dato etiqueta="Gastos fijos"><Cifra valor={Number(r?.gastos_fijos_unidad ?? 0)} /></Dato>
      </div>

      <div className="mt-2.5 flex items-center justify-between rounded-xl border border-white/[0.08]
        bg-white/[0.04] px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-mute">Deja al final</p>
          <p className="mt-0.5 text-[11px] text-ink-mute">después de sus gastos fijos</p>
        </div>
        <span className={`text-lg font-medium ${alFinal < 0 ? 'text-bad' : 'text-good'}`}>
          <Cifra valor={alFinal} />
        </span>
      </div>

      <div className="mt-5">
        <Boton variante="suave" className="w-full" onClick={onEditar}>Editar unidad</Boton>
      </div>
    </>
  );
}

/** Cómo rinde y qué ha hecho. */
function Rendimiento({ v, r, pct, serie, viajes }: DatosFicha) {
  const km = Number(r?.km_recorridos ?? 0);
  return (
    <>
      <div>
        <p className="etiqueta">Rendimiento</p>
        <dl className="mt-3 divide-y divide-white/[0.07] text-sm">
          <Renglon etiqueta="Km recorridos">
            <Cifra valor={km} formato="entero" /> km
          </Renglon>
          <Renglon etiqueta="Ingreso por km">
            {r?.ingreso_por_km != null ? mxn(Number(r.ingreso_por_km)) : '—'}
          </Renglon>
          <Renglon etiqueta="Costo de viaje por km">
            {r?.costo_viaje_por_km != null ? mxn(Number(r.costo_viaje_por_km)) : '—'}
          </Renglon>
          <Renglon etiqueta="Combustible">
            {v.rendimiento_kml != null ? `${v.rendimiento_kml} km/l` : 'default'}
          </Renglon>
          <Renglon etiqueta="Renta que cobra">
            {pct}%{v.pct_renta == null && <span className="ml-1 text-ink-mute">default</span>}
          </Renglon>
        </dl>
      </div>

      <div className="mt-6 border-t border-white/[0.08] pt-5">
        <div className="flex items-baseline justify-between">
          <p className="etiqueta">Utilidad mes a mes</p>
          {r?.ultimo_viaje && <span className="cifra text-[11px] text-ink-mute">último {r.ultimo_viaje}</span>}
        </div>
        <div className="mt-4 flex h-12 items-center">
          {serie.length >= 2
            ? <Sparkline valores={serie} ancho={270} alto={44} titulo={`Utilidad mes a mes de ${v.nombre}`} />
            : <span className="text-xs text-ink-mute">Hace falta más de un mes para ver la tendencia.</span>}
        </div>
      </div>

      <div className="mt-6 border-t border-white/[0.08] pt-5">
        <p className="etiqueta">Últimos viajes</p>
        {viajes.length === 0 ? (
          <p className="mt-3 text-xs text-ink-mute">Esta unidad todavía no tiene viajes.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/[0.07] text-sm">
            {viajes.map((x) => (
              <li key={x.ruta_id}>
                <Link href={`/rutas/${x.ruta_id}`}
                  className="group flex items-center gap-3 py-2 transition-colors hover:text-ink">
                  <span className="cifra w-10 text-brand group-hover:underline">#{x.folio}</span>
                  <span className="flex-1 text-xs text-ink-mute">{x.fecha}</span>
                  <span className={`cifra ${Number(x.utilidad) < 0 ? 'text-bad' : 'text-ink'}`}>
                    {mxn(Number(x.utilidad))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-mute">{etiqueta}</p>
      <p className="mt-1 font-medium text-ink">{children}</p>
    </div>
  );
}

function Renglon({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-ink-mute">{etiqueta}</dt>
      <dd className="cifra text-ink">{children}</dd>
    </div>
  );
}
