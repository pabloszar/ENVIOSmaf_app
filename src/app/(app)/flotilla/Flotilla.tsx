'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/cliente';
import { Campo, Input, Select, Boton, Aviso, Panel, Etiqueta, useAccion } from '@/components/ui';
import { mxn } from '@/lib/pricing';
import type { Vehiculo } from '@/types';

interface FilaRent {
  vehiculo_id: string; vehiculo: string; propiedad: string; viajes: number;
  ingreso: number; utilidad: number; renta_generada: number;
  margen_pct: number | null; km_recorridos: number | null; gastos_fijos_unidad: number;
}

const VACIO: Partial<Vehiculo> = { nombre: '', propiedad: 'propia', tipo: 'Pickup', activo: true };

export default function Flotilla({
  vehiculos, rentabilidad, pctPropia, pctRentada,
}: {
  vehiculos: Vehiculo[];
  rentabilidad: FilaRent[];
  pctPropia: number;
  pctRentada: number;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Partial<Vehiculo> | null>(null);
  const { cargando, error, correr, setError } = useAccion();

  const rentPorId = new Map(rentabilidad.map((r) => [r.vehiculo_id, r]));

  async function guardar() {
    if (!editando) return;
    await correr(async () => {
      const metodo = editando.id ? 'PATCH' : 'POST';
      await api('/api/vehiculos', { method: metodo, body: editando });
      setEditando(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Flotilla</h1>
          <p className="mt-1 text-sm text-ink-mute">
            Cada unidad cobra su % de renta del flete. Si lo dejas vacío, usa el default:
            propia {pctPropia}% · rentada {pctRentada}%.
          </p>
        </div>
        <Boton onClick={() => { setError(null); setEditando({ ...VACIO }); }}>Nueva unidad</Boton>
      </div>

      <section className="tarjeta overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-mute">
                <th className="px-5 py-3 text-left">Unidad</th>
                <th className="px-3 py-3 text-left">Propiedad</th>
                <th className="px-3 py-3 text-right">% Renta</th>
                <th className="px-3 py-3 text-right">Viajes</th>
                <th className="px-3 py-3 text-right">Ingreso</th>
                <th className="px-3 py-3 text-right">Utilidad</th>
                <th className="px-3 py-3 text-right">Margen</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {vehiculos.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-ink-mute">Sin unidades todavía.</td></tr>
              )}
              {vehiculos.map((v) => {
                const r = rentPorId.get(v.id);
                const pct = v.pct_renta ?? (v.propiedad === 'rentada' ? pctRentada : pctPropia);
                return (
                  <tr key={v.id} className="border-b border-surface-line last:border-0 hover:bg-surface-sunk/50">
                    <td className="px-5 py-3">
                      <span className="font-medium">{v.nombre}</span>
                      {!v.activo && <Etiqueta>inactiva</Etiqueta>}
                      {v.placas && <span className="ml-2 text-xs text-ink-mute">{v.placas}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Etiqueta tono={v.propiedad === 'rentada' ? 'aviso' : 'info'}>{v.propiedad}</Etiqueta>
                    </td>
                    <td className="px-3 py-3 text-right cifra">
                      {pct}%{v.pct_renta == null && <span className="ml-1 text-xs text-ink-mute">(def)</span>}
                    </td>
                    <td className="px-3 py-3 text-right cifra">{r?.viajes ?? 0}</td>
                    <td className="px-3 py-3 text-right cifra">{mxn(r?.ingreso ?? 0)}</td>
                    <td className="px-3 py-3 text-right cifra">{mxn(r?.utilidad ?? 0)}</td>
                    <td className="px-3 py-3 text-right cifra">
                      {r?.margen_pct != null ? `${Number(r.margen_pct).toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => { setError(null); setEditando({ ...v }); }}
                        className="text-brand hover:underline">Editar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Panel abierto={!!editando} onCerrar={() => setEditando(null)}
        titulo={editando?.id ? 'Editar unidad' : 'Nueva unidad'}>
        {editando && (
          <div className="space-y-4">
            <Campo label="Nombre"><Input value={editando.nombre ?? ''}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="NP300 Negra" /></Campo>
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
