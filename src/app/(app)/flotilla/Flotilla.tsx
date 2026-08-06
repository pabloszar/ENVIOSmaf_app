'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/cliente';
import { Campo, Input, Select, Boton, BotonMini, Aviso, Panel, Etiqueta, useAccion } from '@/components/ui';
import { Sparkline } from '@/components/Cifras';
import { mxn } from '@/lib/pricing';
import { renderUnidad } from '@/lib/imagenes';
import type { Vehiculo, RutaPnl } from '@/types';

export interface FilaRent {
  vehiculo_id: string; vehiculo: string; propiedad: string; viajes: number;
  ingreso: number; utilidad: number; renta_generada: number;
  margen_pct: number | null; km_recorridos: number | null; gastos_fijos_unidad: number;
  utilidad_despues_fijos: number | null;
  ingreso_por_km: number | null; costo_viaje_por_km: number | null;
  ultimo_viaje: string | null;
}

const VACIO: Partial<Vehiculo> = { nombre: '', propiedad: 'propia', tipo: 'Pickup', activo: true };

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
  const [abierta, setAbierta] = useState<Vehiculo | null>(null);
  const { cargando, error, correr, setError } = useAccion();

  const rentPorId = new Map(rentabilidad.map((r) => [r.vehiculo_id, r]));

  /** Utilidad mes a mes de una unidad, para el sparkline de su tarjeta. */
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

  const rentAbierta = abierta ? rentPorId.get(abierta.id) : null;
  const viajesAbierta = abierta
    ? viajes.filter((v) => v.vehiculo_id === abierta.id).slice(-8).reverse()
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="etiqueta">{vehiculos.length} unidades</p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight">Flotilla</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-mute">
            Cada unidad cobra su % de renta del flete. Si lo dejas vacío usa el default:
            propia {pctPropia}% · rentada {pctRentada}%.
          </p>
        </div>
        <Boton onClick={() => { setError(null); setEditando({ ...VACIO }); }}>Nueva unidad</Boton>
      </div>

      {vehiculos.length === 0 && (
        <p className="tarjeta text-sm text-ink-mute">Sin unidades todavía.</p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {vehiculos.map((v) => {
          const r = rentPorId.get(v.id);
          const pct = v.pct_renta ?? (v.propiedad === 'rentada' ? pctRentada : pctPropia);
          const render = renderUnidad(v.nombre);
          const margen = r?.margen_pct != null ? Number(r.margen_pct) : null;
          return (
            <button key={v.id} onClick={() => { setError(null); setAbierta(v); }}
              className="tarjeta group overflow-hidden p-0 text-left transition hover:border-white/20">
              <span aria-hidden className="halo"
                style={{ background: 'radial-gradient(circle, rgba(20,160,143,0.22), transparent 70%)' }} />

              {/* El render vive en la tarjeta, no como adorno: identifica la unidad. */}
              <div className="relative h-36 w-full">
                {render ? (
                  <Image src={render} alt={v.nombre} fill sizes="(min-width: 640px) 50vw, 100vw"
                    className="object-contain object-right p-3 transition duration-300 group-hover:scale-[1.03]" />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-ink-mute">
                    Sin render
                  </span>
                )}
              </div>

              <div className="relative space-y-3 px-5 pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-medium tracking-tight">{v.nombre}</span>
                  <Etiqueta tono={v.propiedad === 'rentada' ? 'aviso' : 'info'}>{v.propiedad}</Etiqueta>
                  {!v.activo && <Etiqueta>inactiva</Etiqueta>}
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Mini etiqueta="Viajes" valor={String(r?.viajes ?? 0)} />
                  <Mini etiqueta="Utilidad" valor={mxn(r?.utilidad ?? 0)} />
                  <Mini etiqueta="Margen"
                    valor={margen != null ? `${margen.toFixed(0)}%` : '—'}
                    tono={margen == null ? undefined : margen < 0 ? 'text-bad' : margen < 15 ? 'text-warn' : 'text-good'} />
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                  <span className="text-xs text-ink-mute">
                    Renta {pct}%{v.pct_renta == null && ' (default)'}
                  </span>
                  <Sparkline valores={serieDe(v.id)} titulo={`Utilidad mes a mes de ${v.nombre}`} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Panel inmersivo de la unidad ── */}
      <Panel abierto={!!abierta} onCerrar={() => setAbierta(null)} ancho="inmersivo"
        titulo={abierta?.nombre ?? ''}>
        {abierta && (
          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-black/30">
              <span aria-hidden className="halo"
                style={{ background: 'radial-gradient(circle, rgba(20,160,143,0.28), transparent 70%)' }} />
              <div className="relative h-56 w-full">
                {renderUnidad(abierta.nombre) ? (
                  <Image src={renderUnidad(abierta.nombre)!} alt={abierta.nombre} fill
                    sizes="768px" className="object-contain p-4" priority />
                ) : (
                  <span className="flex h-full items-center justify-center text-sm text-ink-mute">
                    Sin render para esta unidad
                  </span>
                )}
              </div>
              <div className="relative flex flex-wrap items-center gap-2 px-5 pb-4">
                <Etiqueta tono={abierta.propiedad === 'rentada' ? 'aviso' : 'info'}>{abierta.propiedad}</Etiqueta>
                {abierta.placas && <span className="text-xs text-ink-mute">{abierta.placas}</span>}
                {abierta.capacidad && <span className="text-xs text-ink-mute">· {abierta.capacidad}</span>}
                {rentAbierta?.ultimo_viaje && (
                  <span className="text-xs text-ink-mute">· último viaje {rentAbierta.ultimo_viaje}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato etiqueta="Ingreso" valor={mxn(rentAbierta?.ingreso ?? 0)} />
              <Dato etiqueta="Utilidad" valor={mxn(rentAbierta?.utilidad ?? 0)} />
              <Dato etiqueta="Gastos fijos" valor={mxn(rentAbierta?.gastos_fijos_unidad ?? 0)}
                nota="mantenimiento, seguro, tenencia" />
              <Dato etiqueta="Deja al final"
                valor={mxn(Number(rentAbierta?.utilidad_despues_fijos ?? rentAbierta?.utilidad ?? 0))}
                tono={Number(rentAbierta?.utilidad_despues_fijos ?? 0) < 0 ? 'text-bad' : 'text-good'}
                nota="después de sus gastos fijos" />
            </div>

            {(rentAbierta?.ingreso_por_km != null || rentAbierta?.km_recorridos) && (
              <div className="grid grid-cols-3 gap-3">
                <Dato etiqueta="Km recorridos" valor={`${Number(rentAbierta?.km_recorridos ?? 0).toLocaleString('es-MX')} km`} />
                <Dato etiqueta="Ingreso por km"
                  valor={rentAbierta?.ingreso_por_km != null ? mxn(Number(rentAbierta.ingreso_por_km)) : '—'} />
                <Dato etiqueta="Costo de viaje por km"
                  valor={rentAbierta?.costo_viaje_por_km != null ? mxn(Number(rentAbierta.costo_viaje_por_km)) : '—'}
                  nota="solo rutas con km capturados" />
              </div>
            )}

            <section className="tarjeta-tabla">
              <h3 className="border-b border-white/[0.06] px-5 py-3.5 text-sm font-medium">Últimos viajes</h3>
              {viajesAbierta.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-mute">Esta unidad todavía no tiene viajes.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {viajesAbierta.map((v) => (
                      <tr key={v.ruta_id} className="fila">
                        <td className="px-5 py-2.5">
                          <Link href={`/rutas/${v.ruta_id}`} className="cifra text-brand hover:underline">
                            #{v.folio}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-ink-soft">{v.fecha}</td>
                        <td className="px-3 py-2.5 text-right cifra">{mxn(Number(v.ingreso))}</td>
                        <td className={`px-5 py-2.5 text-right cifra ${Number(v.utilidad) < 0 ? 'text-bad' : 'text-ink'}`}>
                          {mxn(Number(v.utilidad))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <div className="flex gap-3">
              <Boton onClick={() => { setEditando({ ...abierta }); setAbierta(null); }}>Editar unidad</Boton>
              <BotonMini onClick={() => setAbierta(null)}>Cerrar</BotonMini>
            </div>
          </div>
        )}
      </Panel>

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

function Mini({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-mute">{etiqueta}</p>
      <p className={`cifra mt-0.5 font-medium ${tono ?? 'text-ink'}`}>{valor}</p>
    </div>
  );
}

function Dato({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-mute">{etiqueta}</p>
      <p className={`cifra mt-1 font-medium ${tono ?? 'text-ink'}`}>{valor}</p>
      {nota && <p className="mt-1 text-[11px] text-ink-mute">{nota}</p>}
    </div>
  );
}
