'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import { Campo, Input, Select, Boton, Aviso, Etiqueta, useAccion } from '@/components/ui';
import { mxn } from '@/lib/pricing';
import type {
  Ruta, Envio, Gasto, Tripulante, Comision, Vehiculo, Contacto, TamanoCarga, CategoriaGasto,
} from '@/types';

const TAMANOS: TamanoCarga[] = ['Chico', 'Mediano', 'Grande', 'Extra Grande'];
const CATS: { v: CategoriaGasto; label: string }[] = [
  { v: 'gasolina', label: 'Gasolina' }, { v: 'caseta', label: 'Caseta' },
  { v: 'comida', label: 'Comida' }, { v: 'otro', label: 'Otro' },
];

interface Datos {
  ruta: Ruta; envios: Envio[]; gastos: Gasto[];
  tripulacion: Tripulante[]; comisiones: Comision[];
}

export default function Detalle({
  datos, vehiculos, choferes, ayudantes, vendedores, clientes, nombrePorId,
}: {
  datos: Datos;
  vehiculos: Vehiculo[];
  choferes: Contacto[];
  ayudantes: Contacto[];
  vendedores: Contacto[];
  clientes: Contacto[];
  nombrePorId: Record<string, string>;
}) {
  const router = useRouter();
  const { ruta, envios, gastos, tripulacion, comisiones } = datos;
  const { cargando, error, correr, setError } = useAccion();
  const cerrada = ruta.estado === 'entregada';

  const ingreso = envios.reduce((s, e) => s + Number(e.precio), 0);
  const gastoOperativo = gastos.filter((g) => g.tipo === 'operativo').reduce((s, g) => s + Number(g.monto), 0);
  const totalComisiones = comisiones.reduce((s, c) => s + Number(c.monto), 0);
  const utilidadAprox = ingreso - gastoOperativo - totalComisiones;

  async function accion(fn: () => Promise<void>) {
    await correr(async () => { await fn(); router.refresh(); });
  }

  // ── Formularios locales ──
  const hoy = new Date().toISOString().slice(0, 10);
  const [nuevoEnvio, setNuevoEnvio] = useState({ destino: '', precio: '', tamano_carga: '' as '' | TamanoCarga, cliente_id: '', vendedor_id: '' });
  const [nuevoGasto, setNuevoGasto] = useState({ categoria: 'gasolina' as CategoriaGasto, monto: '', descripcion: '' });
  const [tripRol, setTripRol] = useState<'chofer' | 'ayudante'>('ayudante');
  const [tripId, setTripId] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/rutas" className="text-sm text-ink-mute hover:text-ink">← Rutas</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Ruta #{ruta.folio} <Etiqueta tono={cerrada ? 'bueno' : 'info'}>{ruta.estado}</Etiqueta>
          </h1>
          <p className="mt-1 text-sm text-ink-mute">{ruta.fecha} · {ruta.km_total ? `${ruta.km_total} km` : 'sin km'}</p>
        </div>
        <div className="flex gap-2">
          {!cerrada ? (
            <Boton onClick={() => accion(async () => {
              const r = await api<{ comisiones_generadas: number }>(`/api/rutas/${ruta.id}/cerrar`, { method: 'POST' });
              alert(`Ruta cerrada. Se generaron ${r.comisiones_generadas} comisiones.`);
            })} disabled={cargando}>Cerrar ruta</Boton>
          ) : (
            <Boton variante="suave" onClick={() => accion(async () => {
              await api(`/api/rutas/${ruta.id}/cerrar?reabrir=1`, { method: 'POST' });
            })} disabled={cargando}>Reabrir</Boton>
          )}
          <Boton variante="peligro" onClick={() => {
            if (confirm('¿Eliminar la ruta y todo lo asociado?'))
              accion(async () => { await api(`/api/rutas/${ruta.id}`, { method: 'DELETE' }); router.push('/rutas'); });
          }}>Eliminar</Boton>
        </div>
      </div>

      <Aviso error={error} />

      {/* Resumen P&L en vivo */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tarjeta etiqueta="Ingreso" valor={mxn(ingreso)} detalle={`${envios.length} paradas`} />
        <Tarjeta etiqueta="Gastos operativos" valor={mxn(gastoOperativo)} />
        <Tarjeta etiqueta="Comisiones" valor={mxn(totalComisiones)} detalle={cerrada ? 'generadas' : 'al cerrar'} />
        <Tarjeta etiqueta={cerrada ? 'Utilidad' : 'Utilidad aprox.'} valor={mxn(utilidadAprox)}
          tono={utilidadAprox < 0 ? 'malo' : 'bueno'} />
      </section>

      {/* Encabezado editable: unidad */}
      <section className="tarjeta">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Unidad">
            <Select value={ruta.vehiculo_id ?? ''} disabled={cerrada}
              onChange={(e) => accion(async () => { await api(`/api/rutas/${ruta.id}`, { method: 'PATCH', body: { vehiculo_id: e.target.value || null } }); })}>
              <option value="">— Sin asignar —</option>
              {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label="Km ida y vuelta">
            <Input type="number" defaultValue={ruta.km_total ?? ''} disabled={cerrada}
              onBlur={(e) => accion(async () => { await api(`/api/rutas/${ruta.id}`, { method: 'PATCH', body: { km_total: e.target.value || null } }); })} />
          </Campo>
          <Campo label="Estado">
            <Select value={ruta.estado}
              onChange={(e) => accion(async () => { await api(`/api/rutas/${ruta.id}`, { method: 'PATCH', body: { estado: e.target.value } }); })}>
              {['cotizada', 'agendada', 'en_curso', 'entregada', 'cancelada'].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Campo>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Paradas ── */}
        <section className="tarjeta p-0">
          <h2 className="border-b border-surface-line px-5 py-3 text-sm font-semibold">Paradas · ingresos</h2>
          <div className="divide-y divide-surface-line">
            {envios.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="font-medium">{e.secuencia}. {e.destino}</span>
                  {e.tamano_carga && <span className="ml-2 text-xs text-ink-mute">{e.tamano_carga}</span>}
                  {e.cliente_id && <span className="ml-2 text-xs text-ink-mute">· {nombrePorId[e.cliente_id]}</span>}
                  {e.vendedor_id && <span className="ml-2"><Etiqueta tono="info">vende {nombrePorId[e.vendedor_id]}</Etiqueta></span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="cifra font-medium">{mxn(Number(e.precio))}</span>
                  {!cerrada && (
                    <button onClick={() => accion(async () => { await api('/api/envios', { method: 'DELETE', body: { id: e.id } }); })}
                      className="text-ink-mute hover:text-bad" aria-label="Eliminar">✕</button>
                  )}
                </div>
              </div>
            ))}
            {envios.length === 0 && <p className="px-5 py-4 text-sm text-ink-mute">Sin paradas.</p>}
          </div>
          {!cerrada && (
            <div className="space-y-3 border-t border-surface-line bg-surface-sunk/40 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Destino" value={nuevoEnvio.destino}
                  onChange={(e) => setNuevoEnvio({ ...nuevoEnvio, destino: e.target.value })} />
                <Input type="number" placeholder="Precio" value={nuevoEnvio.precio}
                  onChange={(e) => setNuevoEnvio({ ...nuevoEnvio, precio: e.target.value })} />
                <Select value={nuevoEnvio.tamano_carga}
                  onChange={(e) => setNuevoEnvio({ ...nuevoEnvio, tamano_carga: e.target.value as TamanoCarga })}>
                  <option value="">Tamaño…</option>
                  {TAMANOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Select value={nuevoEnvio.vendedor_id}
                  onChange={(e) => setNuevoEnvio({ ...nuevoEnvio, vendedor_id: e.target.value })}>
                  <option value="">Sin vendedor</option>
                  {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </Select>
                <Select value={nuevoEnvio.cliente_id} className="col-span-2"
                  onChange={(e) => setNuevoEnvio({ ...nuevoEnvio, cliente_id: e.target.value })}>
                  <option value="">Sin cliente</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select>
              </div>
              <Boton variante="suave" disabled={cargando} onClick={() => accion(async () => {
                if (!nuevoEnvio.destino) throw new Error('Escribe el destino.');
                await api('/api/envios', { method: 'POST', body: {
                  ruta_id: ruta.id, destino: nuevoEnvio.destino, precio: nuevoEnvio.precio || 0,
                  tamano_carga: nuevoEnvio.tamano_carga || null,
                  cliente_id: nuevoEnvio.cliente_id || null, vendedor_id: nuevoEnvio.vendedor_id || null,
                } });
                setNuevoEnvio({ destino: '', precio: '', tamano_carga: '', cliente_id: '', vendedor_id: '' });
              })}>Agregar parada</Boton>
            </div>
          )}
        </section>

        {/* ── Gastos ── */}
        <section className="tarjeta p-0">
          <h2 className="border-b border-surface-line px-5 py-3 text-sm font-semibold">Gastos del viaje</h2>
          <div className="divide-y divide-surface-line">
            {gastos.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="font-medium capitalize">{g.categoria}</span>
                  {g.descripcion && <span className="ml-2 text-xs text-ink-mute">{g.descripcion}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="cifra">{mxn(Number(g.monto))}</span>
                  {!cerrada && (
                    <button onClick={() => accion(async () => { await api('/api/gastos', { method: 'DELETE', body: { id: g.id } }); })}
                      className="text-ink-mute hover:text-bad" aria-label="Eliminar">✕</button>
                  )}
                </div>
              </div>
            ))}
            {gastos.length === 0 && <p className="px-5 py-4 text-sm text-ink-mute">Sin gastos.</p>}
          </div>
          {!cerrada && (
            <div className="space-y-3 border-t border-surface-line bg-surface-sunk/40 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Select value={nuevoGasto.categoria}
                  onChange={(e) => setNuevoGasto({ ...nuevoGasto, categoria: e.target.value as CategoriaGasto })}>
                  {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                </Select>
                <Input type="number" placeholder="Monto" value={nuevoGasto.monto}
                  onChange={(e) => setNuevoGasto({ ...nuevoGasto, monto: e.target.value })} />
                <Input placeholder="Descripción (opcional)" className="col-span-2" value={nuevoGasto.descripcion}
                  onChange={(e) => setNuevoGasto({ ...nuevoGasto, descripcion: e.target.value })} />
              </div>
              <Boton variante="suave" disabled={cargando} onClick={() => accion(async () => {
                if (!nuevoGasto.monto) throw new Error('Escribe el monto.');
                await api('/api/gastos', { method: 'POST', body: {
                  ruta_id: ruta.id, fecha: ruta.fecha, tipo: 'operativo',
                  categoria: nuevoGasto.categoria, monto: nuevoGasto.monto,
                  descripcion: nuevoGasto.descripcion || null, vehiculo_id: ruta.vehiculo_id,
                } });
                setNuevoGasto({ categoria: 'gasolina', monto: '', descripcion: '' });
              })}>Agregar gasto</Boton>
            </div>
          )}
        </section>
      </div>

      {/* ── Tripulación ── */}
      <section className="tarjeta p-0">
        <h2 className="border-b border-surface-line px-5 py-3 text-sm font-semibold">Tripulación</h2>
        <div className="flex flex-wrap gap-2 p-5">
          {tripulacion.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-2 rounded-full bg-surface-sunk px-3 py-1 text-sm">
              <Etiqueta tono={t.rol === 'chofer' ? 'info' : 'neutro'}>{t.rol}</Etiqueta>
              {nombrePorId[t.contacto_id] ?? '—'}
              {!cerrada && (
                <button onClick={() => accion(async () => { await api('/api/tripulacion', { method: 'DELETE', body: { id: t.id } }); })}
                  className="text-ink-mute hover:text-bad">✕</button>
              )}
            </span>
          ))}
          {tripulacion.length === 0 && <span className="text-sm text-ink-mute">Sin tripulación asignada.</span>}
        </div>
        {!cerrada && (
          <div className="flex gap-3 border-t border-surface-line bg-surface-sunk/40 p-4">
            <Select value={tripRol} onChange={(e) => { setTripRol(e.target.value as 'chofer' | 'ayudante'); setTripId(''); }} className="max-w-[10rem]">
              <option value="chofer">Chofer</option>
              <option value="ayudante">Ayudante</option>
            </Select>
            <Select value={tripId} onChange={(e) => setTripId(e.target.value)}>
              <option value="">Elegir persona…</option>
              {(tripRol === 'chofer' ? choferes : ayudantes).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
            <Boton variante="suave" disabled={cargando || !tripId} onClick={() => accion(async () => {
              await api('/api/tripulacion', { method: 'POST', body: { ruta_id: ruta.id, contacto_id: tripId, rol: tripRol } });
              setTripId('');
            })}>Agregar</Boton>
          </div>
        )}
      </section>

      {/* ── Comisiones generadas ── */}
      {comisiones.length > 0 && (
        <section className="tarjeta p-0">
          <h2 className="border-b border-surface-line px-5 py-3 text-sm font-semibold">Comisiones generadas</h2>
          <table className="w-full text-sm">
            <tbody>
              {comisiones.map((c) => (
                <tr key={c.id} className="border-b border-surface-line last:border-0">
                  <td className="px-5 py-2">{nombrePorId[c.contacto_id] ?? '—'}</td>
                  <td className="px-3 py-2"><Etiqueta tono="info">{c.rol}</Etiqueta></td>
                  <td className="px-3 py-2 text-right text-ink-mute">{Number(c.porcentaje)}% de {mxn(Number(c.base_monto))}</td>
                  <td className="px-5 py-2 text-right cifra font-medium">{mxn(Number(c.monto))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Tarjeta({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: string; detalle?: string; tono?: 'bueno' | 'malo' }) {
  const color = tono === 'malo' ? 'text-bad' : tono === 'bueno' ? 'text-good' : 'text-ink';
  return (
    <div className="tarjeta">
      <p className="etiqueta">{etiqueta}</p>
      <p className={`cifra mt-2 text-xl font-semibold ${color}`}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-ink-mute">{detalle}</p>}
    </div>
  );
}
