'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/cliente';
import { Campo, Input, Boton, Aviso, Panel, Etiqueta, useAccion } from '@/components/ui';
import type { Contacto, RolContacto } from '@/types';

/** La lista trae si el chofer ya tiene PIN. Del PIN mismo no llega nada. */
type ContactoEnLista = Contacto & { tiene_pin?: boolean };

const ROLES: { v: RolContacto; label: string }[] = [
  { v: 'chofer', label: 'Chofer' },
  { v: 'ayudante', label: 'Ayudante' },
  { v: 'vendedor', label: 'Vendedor' },
  { v: 'cliente_b2b', label: 'Cliente B2B' },
  { v: 'cliente_b2c', label: 'Cliente B2C' },
  { v: 'proveedor', label: 'Proveedor' },
];
const ETIQUETA_ROL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.v, r.label]));

const VACIO: Partial<Contacto> = { nombre: '', roles: [], dias_credito: 0, activo: true };
const FILTROS = ['todos', 'chofer', 'ayudante', 'vendedor', 'cliente_b2b', 'cliente_b2c', 'proveedor'] as const;

export default function Contactos({ contactos }: { contactos: ContactoEnLista[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<Partial<Contacto> | null>(null);
  const [pineando, setPineando] = useState<ContactoEnLista | null>(null);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('todos');
  const { cargando, error, correr, setError } = useAccion();

  const lista = filtro === 'todos' ? contactos : contactos.filter((c) => c.roles?.includes(filtro));

  function toggleRol(rol: RolContacto) {
    if (!editando) return;
    const roles = editando.roles ?? [];
    setEditando({
      ...editando,
      roles: roles.includes(rol) ? roles.filter((r) => r !== rol) : [...roles, rol],
    });
  }

  async function guardar() {
    if (!editando) return;
    await correr(async () => {
      await api('/api/contactos', { method: editando.id ? 'PATCH' : 'POST', body: editando });
      setEditando(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contactos</h1>
          <p className="mt-1 text-sm text-ink-mute">Personal y clientes. Una persona puede tener varios roles.</p>
        </div>
        <Boton onClick={() => { setError(null); setEditando({ ...VACIO }); }}>Nuevo contacto</Boton>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filtro === f ? 'bg-brand text-surface-sunk' : 'bg-surface text-ink-mute hover:bg-surface-sunk'}`}>
            {f === 'todos' ? 'Todos' : ETIQUETA_ROL[f]}
          </button>
        ))}
      </div>

      <section className="tarjeta overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-mute">
                <th className="px-5 py-3 text-left">Nombre</th>
                <th className="px-3 py-3 text-left">Roles</th>
                <th className="px-3 py-3 text-left">Teléfono</th>
                <th className="px-3 py-3 text-right">Crédito</th>
                <th className="px-3 py-3 text-left">App del chofer</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-ink-mute">Sin contactos en este filtro.</td></tr>
              )}
              {lista.map((c) => (
                <tr key={c.id} className="border-b border-surface-line last:border-0 hover:bg-surface-sunk/50">
                  <td className="px-5 py-3">
                    <span className="font-medium">{c.nombre}</span>
                    {!c.activo && <span className="ml-2"><Etiqueta>inactivo</Etiqueta></span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.roles ?? []).map((r) => <Etiqueta key={r} tono="info">{ETIQUETA_ROL[r] ?? r}</Etiqueta>)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-soft">{c.telefono ?? '—'}</td>
                  {/* Solo para quien maneja: el PIN abre /chofer, y ahí no hay
                      nada que le sirva a un vendedor o a un cliente. */}
                  <td className="px-3 py-3 text-right cifra">{c.dias_credito > 0 ? `${c.dias_credito} días` : '—'}</td>
                  <td className="px-3 py-3">
                    {c.roles?.includes('chofer') ? (
                      <button onClick={() => { setError(null); setPineando(c); }}
                        className="text-xs text-brand hover:underline">
                        {c.tiene_pin ? 'Cambiar PIN' : 'Poner PIN'}
                      </button>
                    ) : (
                      <span className="text-xs text-ink-mute">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => { setError(null); setEditando({ ...c }); }}
                      className="text-brand hover:underline">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Panel abierto={!!editando} onCerrar={() => setEditando(null)}
        titulo={editando?.id ? 'Editar contacto' : 'Nuevo contacto'}>
        {editando && (
          <div className="space-y-4">
            <Campo label="Nombre"><Input value={editando.nombre ?? ''}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} /></Campo>

            <div>
              <span className="etiqueta">Roles</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {ROLES.map((r) => {
                  const activo = editando.roles?.includes(r.v);
                  return (
                    <button key={r.v} type="button" onClick={() => toggleRol(r.v)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        activo ? 'bg-brand text-surface-sunk' : 'bg-surface-sunk text-ink-mute hover:bg-surface-line'}`}>
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Campo label="Teléfono"><Input value={editando.telefono ?? ''}
                onChange={(e) => setEditando({ ...editando, telefono: e.target.value })} /></Campo>
              <Campo label="Email"><Input value={editando.email ?? ''}
                onChange={(e) => setEditando({ ...editando, email: e.target.value })} /></Campo>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Campo label="Días de crédito"><Input type="number" value={String(editando.dias_credito ?? 0)}
                onChange={(e) => setEditando({ ...editando, dias_credito: Number(e.target.value) })} /></Campo>
              <Campo label="Límite de crédito"><Input type="number" value={editando.limite_credito ?? ''}
                onChange={(e) => setEditando({ ...editando, limite_credito: e.target.value === '' ? null : Number(e.target.value) })} /></Campo>
            </div>

            <p className="rounded-lg bg-surface-sunk p-3 text-xs text-ink-mute">
              Los porcentajes de comisión propios (cuando alguien gana distinto al default) se configuran
              más adelante desde la ruta. Por ahora todos usan el porcentaje global.
            </p>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editando.activo ?? true}
                onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
              Activo
            </label>

            <Aviso error={error} />
            <div className="flex gap-3 pt-2">
              <Boton onClick={guardar} disabled={cargando}>{cargando ? 'Guardando…' : 'Guardar'}</Boton>
              <Boton variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Boton>
            </div>
          </div>
        )}
      </Panel>

      <PanelPin chofer={pineando} onCerrar={() => setPineando(null)}
        onListo={() => { setPineando(null); router.refresh(); }} />
    </div>
  );
}

/**
 * El PIN con el que un chofer entra a la app de choferes.
 *
 * No se puede consultar el que ya tiene: de él solo se guarda una huella, ni
 * siquiera para ti. Si a alguien se le olvida, se le pone uno nuevo — que es
 * también lo que hace que un PIN robado de tu pantalla no exista.
 *
 * Se teclea dos veces por lo mismo: un dedazo al ponerlo deja a alguien fuera
 * en la calle, y el error solo aparecería cuando ya está lejos.
 */
function PanelPin({ chofer, onCerrar, onListo }: {
  chofer: ContactoEnLista | null;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [pin, setPin] = useState('');
  const [otra, setOtra] = useState('');
  const { cargando, error, correr, setError } = useAccion();

  function cerrar() { setPin(''); setOtra(''); setError(null); onCerrar(); }

  async function guardar() {
    if (!chofer) return;
    if (pin !== otra) { setError('Los dos PIN no son iguales.'); return; }
    await correr(async () => {
      await api('/api/contactos/pin', { method: 'PUT', body: { id: chofer.id, pin } });
      setPin(''); setOtra('');
      onListo();
    });
  }

  async function quitar() {
    if (!chofer) return;
    if (!confirm(`¿Quitarle el acceso a ${chofer.nombre}? Sale de la app de inmediato.`)) return;
    await correr(async () => {
      await api('/api/contactos/pin', { method: 'DELETE', body: { id: chofer.id } });
      onListo();
    });
  }

  return (
    <Panel abierto={!!chofer} onCerrar={cerrar}
      titulo={chofer ? `PIN de ${chofer.nombre}` : 'PIN'}>
      {chofer && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-mute">
            Con este PIN entra a <span className="text-ink-soft">/chofer</span> desde su
            teléfono y ve solo los viajes donde va manejando. De 4 a 8 dígitos;
            6 es lo recomendable.
          </p>

          <Campo label="PIN nuevo">
            <Input type="password" inputMode="numeric" autoComplete="new-password"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
          </Campo>
          <Campo label="Otra vez" hint="Un dedazo aquí lo deja fuera en la calle.">
            <Input type="password" inputMode="numeric" autoComplete="new-password"
              value={otra} onChange={(e) => setOtra(e.target.value.replace(/\D/g, '').slice(0, 8))} />
          </Campo>

          <p className="rounded-lg bg-surface-sunk p-3 text-xs leading-relaxed text-ink-mute">
            El PIN no se guarda como se teclea, así que no hay dónde consultarlo
            después. Si se le olvida, ponle uno nuevo aquí mismo.
          </p>

          <Aviso error={error} />
          <div className="flex flex-wrap gap-3 pt-2">
            <Boton onClick={guardar} disabled={cargando || pin.length < 4}>
              {cargando ? 'Guardando…' : chofer.tiene_pin ? 'Cambiar PIN' : 'Poner PIN'}
            </Boton>
            <Boton variante="fantasma" onClick={cerrar}>Cancelar</Boton>
            {chofer.tiene_pin && (
              <button type="button" onClick={quitar} disabled={cargando}
                className="ml-auto text-sm text-ink-mute transition hover:text-bad">
                Quitarle el acceso
              </button>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
