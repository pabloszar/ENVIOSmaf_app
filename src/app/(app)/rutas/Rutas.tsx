'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import { Campo, Input, Select, Boton, Aviso, Panel, Etiqueta, useAccion } from '@/components/ui';
import { mxn } from '@/lib/pricing';
import type { RutaPnl, Vehiculo, Contacto, TamanoCarga, EstadoRuta } from '@/types';

const ESTADO_TONO: Record<EstadoRuta, 'neutro' | 'info' | 'aviso' | 'bueno' | 'malo'> = {
  cotizada: 'neutro', agendada: 'info', en_curso: 'aviso', entregada: 'bueno', cancelada: 'malo',
};
const TAMANOS: TamanoCarga[] = ['Chico', 'Mediano', 'Grande', 'Extra Grande'];

export default function Rutas({
  rutas, vehiculos, choferes, clientes,
}: {
  rutas: RutaPnl[];
  vehiculos: Vehiculo[];
  choferes: Contacto[];
  clientes: Contacto[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, correr, setError } = useAccion();

  const hoy = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    fecha: hoy, vehiculo_id: '', chofer_id: '',
    destino: '', cliente_id: '', precio: '', tamano_carga: '' as '' | TamanoCarga,
    km_total: '', notas: '',
  });

  async function crear() {
    await correr(async () => {
      if (!f.destino) throw new Error('Escribe el destino.');
      const ruta = await api<{ id: string }>('/api/rutas', {
        method: 'POST',
        body: {
          fecha: f.fecha,
          vehiculo_id: f.vehiculo_id || null,
          km_total: f.km_total || null,
          notas: f.notas || null,
          envio: {
            destino: f.destino,
            cliente_id: f.cliente_id || null,
            precio: f.precio || 0,
            tamano_carga: f.tamano_carga || null,
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
      setF({ ...f, destino: '', cliente_id: '', precio: '', tamano_carga: '', km_total: '', notas: '' });
      router.push(`/rutas/${ruta.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Rutas y envíos</h1>
          <p className="mt-1 text-sm text-ink-mute">
            Un viaje contiene los gastos; cada parada, su ingreso. Captura rápida crea la ruta y su primera parada.
          </p>
        </div>
        <Boton onClick={() => { setError(null); setAbierto(true); }}>Nueva ruta</Boton>
      </div>

      <section className="tarjeta overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-mute">
                <th className="px-5 py-3 text-left">Folio</th>
                <th className="px-3 py-3 text-left">Fecha</th>
                <th className="px-3 py-3 text-left">Estado</th>
                <th className="px-3 py-3 text-left">Unidad</th>
                <th className="px-3 py-3 text-right">Paradas</th>
                <th className="px-3 py-3 text-right">Ingreso</th>
                <th className="px-3 py-3 text-right">Utilidad</th>
                <th className="px-5 py-3 text-right">Margen</th>
              </tr>
            </thead>
            <tbody>
              {rutas.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-ink-mute">Sin rutas todavía.</td></tr>
              )}
              {rutas.map((r) => (
                <tr key={r.ruta_id}
                  onClick={() => router.push(`/rutas/${r.ruta_id}`)}
                  className="cursor-pointer border-b border-surface-line last:border-0 hover:bg-surface-sunk/50">
                  <td className="px-5 py-3 font-medium">#{r.folio}</td>
                  <td className="px-3 py-3 text-ink-soft">{r.fecha}</td>
                  <td className="px-3 py-3"><Etiqueta tono={ESTADO_TONO[r.estado]}>{r.estado}</Etiqueta></td>
                  <td className="px-3 py-3 text-ink-soft">{r.vehiculo ?? '—'}</td>
                  <td className="px-3 py-3 text-right cifra">{r.num_envios}</td>
                  <td className="px-3 py-3 text-right cifra">{mxn(Number(r.ingreso))}</td>
                  <td className="px-3 py-3 text-right cifra">{mxn(Number(r.utilidad))}</td>
                  <td className="px-5 py-3 text-right cifra">
                    <span className={r.margen_pct == null ? 'text-ink-mute'
                      : Number(r.margen_pct) < 0 ? 'text-bad'
                      : Number(r.margen_pct) < 15 ? 'text-warn' : 'text-good'}>
                      {r.margen_pct != null ? `${Number(r.margen_pct).toFixed(0)}%` : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Panel abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Nueva ruta">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Fecha"><Input type="date" value={f.fecha}
              onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
            <Campo label="Km ida y vuelta"><Input type="number" value={f.km_total}
              onChange={(e) => setF({ ...f, km_total: e.target.value })} /></Campo>
          </div>
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

          <div className="border-t border-surface-line pt-4">
            <p className="etiqueta mb-3">Primera parada</p>
            <div className="space-y-4">
              <Campo label="Destino"><Input value={f.destino}
                onChange={(e) => setF({ ...f, destino: e.target.value })} placeholder="Metepec" /></Campo>
              <div className="grid grid-cols-2 gap-4">
                <Campo label="Precio (ingreso)"><Input type="number" value={f.precio}
                  onChange={(e) => setF({ ...f, precio: e.target.value })} /></Campo>
                <Campo label="Tamaño">
                  <Select value={f.tamano_carga} onChange={(e) => setF({ ...f, tamano_carga: e.target.value as TamanoCarga })}>
                    <option value="">—</option>
                    {TAMANOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </Campo>
              </div>
              <Campo label="Cliente">
                <Select value={f.cliente_id} onChange={(e) => setF({ ...f, cliente_id: e.target.value })}>
                  <option value="">— Sin cliente —</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select>
              </Campo>
            </div>
          </div>

          <Aviso error={error} />
          <div className="flex gap-3 pt-2">
            <Boton onClick={crear} disabled={cargando}>{cargando ? 'Creando…' : 'Crear y abrir'}</Boton>
            <Boton variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
          </div>
          <p className="text-xs text-ink-mute">
            Al abrir la ruta puedes agregar más paradas, capturar gastos del viaje y cerrarla para generar comisiones.
          </p>
        </div>
      </Panel>
    </div>
  );
}
