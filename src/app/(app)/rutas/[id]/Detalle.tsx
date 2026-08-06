'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import {
  Campo, Input, Select, Boton, BotonMini, Aviso, Chip, Etiqueta, Modal, AccionesModal,
  Interruptor, CampoMonto, useAccion,
} from '@/components/ui';
import SelectorTamano from '@/components/SelectorTamano';
import QuienTuvo, { SIN_CUSTODIA, type Custodia, custodiaABody } from '@/components/QuienTuvo';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import type {
  Ruta, Envio, Gasto, Tripulante, Comision, Vehiculo, Contacto, RutaPnl,
  TamanoCarga, CategoriaGasto, EstadoRuta,
} from '@/types';

const CATS: { v: CategoriaGasto; label: string }[] = [
  { v: 'gasolina', label: 'Gasolina' }, { v: 'caseta', label: 'Caseta' },
  { v: 'comida', label: 'Comida' }, { v: 'mantenimiento', label: 'Mantenimiento' },
  { v: 'otro', label: 'Otro' },
];
const ESTADOS: { v: EstadoRuta; label: string }[] = [
  { v: 'cotizada', label: 'Cotizada' }, { v: 'agendada', label: 'Agendada' },
  { v: 'en_curso', label: 'En curso' }, { v: 'entregada', label: 'Entregada' },
  { v: 'cancelada', label: 'Cancelada' },
];

/** Renglón del borrador de gastos: se capturan varios y se guardan de un jalón. */
interface LineaGasto { k: number; categoria: CategoriaGasto; monto: string; descripcion: string }
let contadorLinea = 0;
const nuevaLinea = (categoria: CategoriaGasto = 'gasolina'): LineaGasto =>
  ({ k: ++contadorLinea, categoria, monto: '', descripcion: '' });

interface Datos {
  ruta: Ruta; envios: Envio[]; gastos: Gasto[];
  tripulacion: Tripulante[]; comisiones: Comision[];
}

/**
 * Detalle de una ruta, todo en una sola pantalla.
 *
 * Antes esto vivía en cinco pestañas y obligaba a recordar lo que se acababa
 * de ver: para saber si un viaje convenía había que ir a Paradas por el
 * ingreso, a Gastos por lo que costó y a Comisiones por lo que se llevó la
 * gente. Ahora nada se esconde: la franja de arriba da el resultado y las dos
 * columnas dan de dónde salió.
 *
 * Lo que sí desaparece son los formularios. Un campo vacío permanente ocupa el
 * mismo lugar que un dato y compite con él por la mirada; capturar es un acto
 * puntual, así que vive en ventanas que se abren, se llenan y se van.
 */
export default function Detalle({
  datos, pnl, porCobrar, comisionesEstimadas, vehiculos, choferes, ayudantes, vendedores, clientes, nombrePorId,
}: {
  datos: Datos;
  pnl: RutaPnl | null;
  porCobrar: number | null;
  comisionesEstimadas: number;
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

  const [nota, setNota] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'parada' | 'gasto' | 'tripulacion'>(null);

  async function accion(fn: () => Promise<void>) {
    await correr(async () => { await fn(); router.refresh(); });
  }

  // ── Cifras ──
  // Todas salen de v_ruta_pnl_full, la misma vista que alimenta la lista de
  // rutas. Calcularlas aquí otra vez fue justo lo que las desalineó: faltaba
  // la renta de la unidad, que la vista sí descuenta.
  const ingreso = Number(pnl?.ingreso ?? 0);
  const gastosViaje = Number(pnl?.gastos_directos ?? 0);
  const comisionesReales = Number(pnl?.comisiones ?? 0);
  const renta = Number(pnl?.renta_unidad ?? 0);
  const utilidad = Number(pnl?.utilidad ?? 0);
  const margen = pnl?.margen_pct != null ? Number(pnl.margen_pct) : null;
  const vehiculo = vehiculos.find((v) => v.id === ruta.vehiculo_id)?.nombre ?? null;
  // Quienes pudieron traer el dinero de este viaje: los que iban arriba y los
  // que vendieron. Aparecen como atajo para no buscarlos en una lista larga.
  const gente = [
    ...tripulacion.map((t) => ({ id: t.contacto_id, nombre: nombrePorId[t.contacto_id] ?? '—' })),
    ...vendedores
      .filter((v) => envios.some((e) => e.vendedor_id === v.id))
      .map((v) => ({ id: v.id, nombre: v.nombre })),
  ].filter((g, i, xs) => xs.findIndex((x) => x.id === g.id) === i);
  const chofer = tripulacion.find((t) => t.rol === 'chofer');

  /** Cambia el estado. 'entregada' no es una etiqueta: cierra la ruta de verdad. */
  async function cambiarEstado(nuevo: EstadoRuta) {
    if (nuevo === ruta.estado) return;
    if (nuevo === 'entregada' &&
      !confirm('Cerrar la ruta congela los porcentajes de hoy y genera las comisiones. ¿Seguir?')) return;
    if (cerrada && nuevo !== 'entregada' &&
      !confirm('Sacarla de "entregada" borra las comisiones devengadas de este viaje. ¿Seguir?')) return;

    await accion(async () => {
      const r = await api<{ cerro: boolean; comisiones_generadas: number }>(
        `/api/rutas/${ruta.id}`, { method: 'PATCH', body: { estado: nuevo } });
      setNota(r.cerro
        ? `Ruta cerrada · ${r.comisiones_generadas} ${r.comisiones_generadas === 1 ? 'comisión generada' : 'comisiones generadas'}`
        : cerrada ? 'Ruta reabierta · comisiones devengadas borradas' : null);
    });
  }

  return (
    <div className="space-y-5">
      {/* ══ Cabecera ══ */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/rutas" className="text-xs text-ink-mute transition hover:text-ink">← Rutas</Link>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-medium tracking-tight">
              {envios[0]?.destino ?? `Ruta #${ruta.folio}`}
            </h1>
            <span className="cifra text-sm text-ink-mute">#{ruta.folio}</span>
          </div>
          <p className="mt-1.5 text-sm text-ink-mute">
            {fechaCorta(ruta.fecha)}
            {' · '}{envios.length} {envios.length === 1 ? 'parada' : 'paradas'}
            {ruta.km_total ? ` · ${Number(ruta.km_total).toLocaleString('es-MX')} km` : ''}
            {vehiculo ? ` · ${vehiculo}` : ''}
            {chofer ? ` · ${nombrePorId[chofer.contacto_id] ?? ''}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!cerrada ? (
            <Boton onClick={() => cambiarEstado('entregada')} disabled={cargando}>
              {cargando ? 'Cerrando…' : 'Cerrar ruta'}
            </Boton>
          ) : (
            <Boton variante="suave" onClick={() => cambiarEstado('agendada')} disabled={cargando}>
              Reabrir
            </Boton>
          )}
          <Boton variante="peligro" onClick={() => {
            if (confirm('¿Eliminar la ruta y todo lo asociado?'))
              accion(async () => { await api(`/api/rutas/${ruta.id}`, { method: 'DELETE' }); router.push('/rutas'); });
          }}>Eliminar</Boton>
        </div>
      </header>

      {/* Estado: el paso del viaje, siempre visible y de un solo clic. */}
      <div className="flex flex-wrap items-center gap-2">
        {ESTADOS.map((e) => (
          <Chip key={e.v} activo={ruta.estado === e.v} disabled={cargando}
            onClick={() => cambiarEstado(e.v)}>{e.label}</Chip>
        ))}
        {cerrada && ruta.cerrada_en && (
          <span className="ml-1 text-xs text-ink-mute">
            cerrada · porcentajes congelados
          </span>
        )}
      </div>

      <Aviso error={error} />
      {nota && (
        <p className="rounded-xl border border-good/25 bg-good/10 px-3 py-2 text-sm text-good">{nota}</p>
      )}

      {/* ══ Franja de resultado ══
          Se lee como una resta de izquierda a derecha: lo que entró, lo que se
          fue en cada concepto, y lo que quedó. */}
      <section className="tarjeta grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-6">
        <Cifra etiqueta="Venta" valor={mxn(ingreso)}
          detalle={porCobrar != null && porCobrar > 0
            ? `${mxn(porCobrar)} sin cobrar`
            : `${envios.length} ${envios.length === 1 ? 'parada' : 'paradas'}`}
          tono={porCobrar != null && porCobrar > 0 ? 'aviso' : undefined} />
        <Cifra etiqueta="Gastos del viaje" valor={resta(gastosViaje)}
          detalle={`${gastos.length} ${gastos.length === 1 ? 'registro' : 'registros'}`} />
        <Cifra etiqueta="Comisiones"
          valor={resta(cerrada ? comisionesReales : comisionesEstimadas)}
          detalle={cerrada ? 'generadas' : 'estimadas al cerrar'}
          atenuado={!cerrada} />
        <Cifra etiqueta="Renta de unidad" valor={resta(renta)}
          detalle={vehiculo ?? 'al % de unidad propia'} />
        <Cifra etiqueta="Utilidad" valor={mxn(utilidad)} grande
          tono={utilidad < 0 ? 'malo' : 'bueno'}
          detalle={cerrada ? 'del viaje' : 'sin comisiones aún'} />
        <Cifra etiqueta="Margen" valor={margen != null ? `${margen.toFixed(1)}%` : '—'} grande
          tono={margen == null ? undefined : margen < 0 ? 'malo' : margen < 15 ? 'aviso' : 'bueno'}
          detalle={margen == null ? 'sin ingreso' : margen < 15 ? 'apretado' : 'sano'} />
      </section>

      {/* ══ Cuerpo: dos columnas, nada oculto ══ */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* ── Paradas ── */}
          <Tarjeta titulo="Paradas" cuenta={envios.length} total={mxn(ingreso)}
            accion={!cerrada && <BotonMini onClick={() => { setError(null); setModal('parada'); }}>+ Parada</BotonMini>}>
            {envios.length === 0 ? (
              <Vacio texto="Sin paradas. Una ruta sin paradas no tiene ingreso." />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {envios.map((e) => (
                  <li key={e.id} className="flex items-start gap-4 px-5 py-3.5">
                    <span className="cifra mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                      bg-white/[0.06] text-[11px] text-ink-soft">{e.secuencia}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-tight">{e.destino}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-mute">
                        {e.cliente_id && <span>{nombrePorId[e.cliente_id]}</span>}
                        {e.tamano_carga && <span>· {e.tamano_carga}</span>}
                        {e.distancia_km ? <span>· {Number(e.distancia_km)} km</span> : null}
                        {e.vendedor_id && <Etiqueta tono="info">vende {nombrePorId[e.vendedor_id]}</Etiqueta>}
                        {e.a_credito && <Etiqueta tono="aviso">crédito</Etiqueta>}
                      </p>
                    </div>
                    <span className="cifra shrink-0 font-medium">{mxn(Number(e.precio))}</span>
                    {!cerrada && (
                      <BotonQuitar onClick={() => accion(async () => {
                        await api('/api/envios', { method: 'DELETE', body: { id: e.id } });
                      })} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {/* ── Gastos ── */}
          <Tarjeta titulo="Gastos del viaje" cuenta={gastos.length} total={mxn(gastosViaje)}
            accion={!cerrada && <BotonMini onClick={() => { setError(null); setModal('gasto'); }}>+ Gasto</BotonMini>}>
            {gastos.length === 0 ? (
              <Vacio texto="Sin gastos capturados. La gasolina y las casetas van aquí." />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {gastos.map((g) => (
                  <li key={g.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="w-28 shrink-0 text-sm font-medium capitalize">{g.categoria}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-mute">
                      {g.descripcion ?? ''}
                    </span>
                    <span className="cifra shrink-0">{mxn(Number(g.monto))}</span>
                    {!cerrada && (
                      <BotonQuitar onClick={() => accion(async () => {
                        await api('/api/gastos', { method: 'DELETE', body: { id: g.id } });
                      })} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {/* ── Comisiones ── */}
          <Tarjeta titulo="Comisiones" cuenta={comisiones.length}
            total={mxn(cerrada ? comisionesReales : comisionesEstimadas)}>
            {comisiones.length === 0 ? (
              <Vacio texto={cerrada
                ? 'Cerrada sin comisiones: no había tripulación ni vendedor asignado.'
                : `Se generan al cerrar la ruta. Con lo capturado hoy serían ${mxn(comisionesEstimadas)}.`} />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {comisiones.map((c) => (
                  <li key={c.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm">{nombrePorId[c.contacto_id] ?? '—'}</span>
                    <Etiqueta tono="info">{c.rol}</Etiqueta>
                    <span className="cifra w-40 shrink-0 text-right text-xs text-ink-mute">
                      {Number(c.porcentaje)}% de {mxn(Number(c.base_monto))}
                    </span>
                    <span className="cifra w-24 shrink-0 text-right font-medium">{mxn(Number(c.monto))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        {/* ══ Columna derecha: el viaje en sí ══ */}
        <div className="space-y-5">
          <Tarjeta titulo="El viaje">
            <div className="space-y-4 p-5">
              <Campo label="Fecha"
                hint={cerrada ? 'se puede corregir aun cerrada' : undefined}>
                {/* defaultValue y no value: el navegador ya muestra lo elegido, y
                    un control atado al servidor se sentiría trabado al guardar. */}
                <Input type="date" defaultValue={ruta.fecha}
                  onChange={(e) => {
                    const fecha = e.target.value;
                    if (!fecha || fecha === ruta.fecha) return;
                    accion(async () => {
                      const r = await api<{ gastos_movidos: number }>(`/api/rutas/${ruta.id}`, {
                        method: 'PATCH', body: { fecha },
                      });
                      setNota(r.gastos_movidos > 0
                        ? `Fecha corregida · ${r.gastos_movidos} ${r.gastos_movidos === 1 ? 'gasto se movió' : 'gastos se movieron'} con la ruta`
                        : 'Fecha corregida');
                    });
                  }} />
              </Campo>
              <Campo label="Unidad">
                <Select value={ruta.vehiculo_id ?? ''} disabled={cerrada}
                  onChange={(e) => accion(async () => {
                    await api(`/api/rutas/${ruta.id}`, { method: 'PATCH', body: { vehiculo_id: e.target.value || null } });
                  })}>
                  <option value="">— Sin asignar —</option>
                  {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </Select>
              </Campo>
              <Campo label="Km del viaje"
                hint="Cada parada suma los suyos; aquí se puede ajustar el total.">
                <Input type="number" inputMode="decimal" defaultValue={ruta.km_total ?? ''} disabled={cerrada}
                  onBlur={(e) => {
                    if (String(e.target.value || '') === String(ruta.km_total ?? '')) return;
                    accion(async () => {
                      await api(`/api/rutas/${ruta.id}`, { method: 'PATCH', body: { km_total: e.target.value || null } });
                    });
                  }} />
              </Campo>
            </div>
          </Tarjeta>

          {/* ── Tripulación ── */}
          <Tarjeta titulo="Tripulación" cuenta={tripulacion.length}
            accion={!cerrada && <BotonMini onClick={() => { setError(null); setModal('tripulacion'); }}>+ Persona</BotonMini>}>
            <div className="flex flex-wrap gap-2 p-5">
              {tripulacion.length === 0 && (
                <p className="text-sm text-ink-mute">Sin tripulación. Sin ella no hay comisiones al cerrar.</p>
              )}
              {tripulacion.map((t) => (
                <span key={t.id}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.07]
                    bg-white/[0.04] py-1 pl-2 pr-3 text-sm">
                  <Etiqueta tono={t.rol === 'chofer' ? 'info' : 'neutro'}>{t.rol}</Etiqueta>
                  {nombrePorId[t.contacto_id] ?? '—'}
                  {!cerrada && (
                    <button onClick={() => accion(async () => {
                      await api('/api/tripulacion', { method: 'DELETE', body: { id: t.id } });
                    })} className="text-ink-mute transition hover:text-bad" aria-label="Quitar">✕</button>
                  )}
                </span>
              ))}
            </div>
          </Tarjeta>

          {/* ── Notas ── */}
          <Notas ruta={ruta} onGuardar={(texto) => accion(async () => {
            await api(`/api/rutas/${ruta.id}`, { method: 'PATCH', body: { notas: texto || null } });
            setNota('Nota guardada');
          })} />
        </div>
      </div>

      {/* ══ Ventanas de captura ══ */}
      <ModalParada abierto={modal === 'parada'} onCerrar={() => setModal(null)}
        ruta={ruta} clientes={clientes} vendedores={vendedores} gente={gente}
        error={error} cargando={cargando}
        onGuardar={(cuerpo, cerrarAlGuardar) => accion(async () => {
          await api('/api/envios', { method: 'POST', body: { ruta_id: ruta.id, ...cuerpo } });
          if (cerrarAlGuardar) setModal(null);
        })} />

      <ModalGasto abierto={modal === 'gasto'} onCerrar={() => setModal(null)}
        ruta={ruta} gente={gente} error={error} cargando={cargando}
        onGuardar={(lineas, quien) => accion(async () => {
          await api('/api/gastos', {
            method: 'POST',
            body: lineas.map((l) => ({
              ruta_id: ruta.id, fecha: ruta.fecha, tipo: 'operativo',
              categoria: l.categoria, monto: l.monto,
              descripcion: l.descripcion || null, vehiculo_id: ruta.vehiculo_id,
              ...custodiaABody(quien, 'pagado_por'),
            })),
          });
          setModal(null);
        })} />

      <ModalTripulacion abierto={modal === 'tripulacion'} onCerrar={() => setModal(null)}
        choferes={choferes} ayudantes={ayudantes} yaEstan={tripulacion}
        error={error} cargando={cargando}
        onGuardar={(contactoId, rol) => accion(async () => {
          await api('/api/tripulacion', { method: 'POST', body: { ruta_id: ruta.id, contacto_id: contactoId, rol } });
          setModal(null);
        })} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Piezas de la pantalla
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo que se resta lleva su signo — salvo el cero, que no resta nada. */
function resta(n: number): string {
  return n ? `−${mxn(n)}` : mxn(0);
}

function Cifra({ etiqueta, valor, detalle, tono, grande, atenuado }: {
  etiqueta: string; valor: string; detalle?: string;
  tono?: 'bueno' | 'aviso' | 'malo'; grande?: boolean; atenuado?: boolean;
}) {
  const color = tono === 'malo' ? 'text-bad' : tono === 'aviso' ? 'text-warn'
    : tono === 'bueno' ? 'text-good' : atenuado ? 'text-ink-soft' : 'text-ink';
  return (
    <div>
      <p className="etiqueta">{etiqueta}</p>
      <p className={`cifra mt-1.5 font-light leading-none tracking-tight ${grande ? 'text-3xl' : 'text-2xl'} ${color}`}>
        {valor}
      </p>
      {detalle && <p className="mt-1.5 text-xs text-ink-mute">{detalle}</p>}
    </div>
  );
}

/** Tarjeta con cabecera: título, cuánto trae y su total a la derecha. */
function Tarjeta({ titulo, cuenta, total, accion, children }: {
  titulo: string; cuenta?: number; total?: string;
  accion?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="tarjeta-tabla">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <h2 className="text-sm font-medium tracking-tight">{titulo}</h2>
        {cuenta != null && (
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-ink-mute">{cuenta}</span>
        )}
        <span className="flex-1" />
        {total && <span className="cifra text-sm text-ink-soft">{total}</span>}
        {accion}
      </div>
      {children}
    </section>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="px-5 py-6 text-sm text-ink-mute">{texto}</p>;
}

/**
 * Quitar un renglón. Siempre visible, apenas insinuado: esconderlo hasta el
 * hover lo vuelve invisible en pantalla táctil y obliga a cazarlo con el mouse.
 */
function BotonQuitar({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Eliminar"
      className="shrink-0 rounded-full px-1.5 text-ink-mute/50 transition hover:text-bad">✕</button>
  );
}

/**
 * Notas del viaje. Se guarda al salir del campo y no en cada tecla: guardar
 * mientras se escribe manda una petición por letra y hace parpadear la pantalla.
 */
function Notas({ ruta, onGuardar }: { ruta: Ruta; onGuardar: (texto: string) => void }) {
  const [texto, setTexto] = useState(ruta.notas ?? '');
  const sucio = texto !== (ruta.notas ?? '');
  return (
    <section className="tarjeta-tabla">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <h2 className="text-sm font-medium tracking-tight">Notas</h2>
        <span className="flex-1" />
        {sucio && <span className="text-[11px] text-ink-mute">sin guardar</span>}
      </div>
      <div className="p-5">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
          onBlur={() => { if (sucio) onGuardar(texto); }}
          rows={5} placeholder="El cliente no estaba, se entregó al día siguiente…"
          className="w-full resize-y rounded-xl border border-surface-line bg-surface-raised px-3 py-2.5
            text-sm leading-relaxed text-ink outline-none transition placeholder:text-ink-mute
            focus:border-brand focus:ring-2 focus:ring-brand/25" />
        <p className="mt-2 text-xs text-ink-mute">Se guarda al salir del campo.</p>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Ventanas de captura
   ══════════════════════════════════════════════════════════════════════════ */

interface CuerpoParada {
  destino: string; precio: string; cliente_id: string | null; vendedor_id: string | null;
  tamano_carga: TamanoCarga | null; a_credito: boolean; distancia_km: string | null;
  cobrado_por: string | null; cobrado_por_otro: string | null;
}

function ModalParada({
  abierto, onCerrar, ruta, clientes, vendedores, gente, onGuardar, error, cargando,
}: {
  abierto: boolean; onCerrar: () => void; ruta: Ruta;
  clientes: Contacto[]; vendedores: Contacto[];
  gente: { id: string; nombre: string }[];
  onGuardar: (cuerpo: CuerpoParada, cerrar: boolean) => void;
  error: string | null; cargando: boolean;
}) {
  const vacio = {
    destino: '', precio: '', cliente_id: '', vendedor_id: '',
    tamano_carga: '' as '' | TamanoCarga, a_credito: false, km: '',
  };
  const [f, setF] = useState(vacio);
  // Quién cobra se conserva entre paradas: en una ruta de varias entregas suele
  // cobrar la misma persona, y reelegirlo cada vez sería trabajo de más.
  const [quien, setQuien] = useState<Custodia>(SIN_CUSTODIA);

  const cuerpo = (): CuerpoParada => ({
    destino: f.destino.trim(), precio: f.precio || '0',
    cliente_id: f.cliente_id || null, vendedor_id: f.vendedor_id || null,
    tamano_carga: f.tamano_carga || null, a_credito: f.a_credito,
    distancia_km: f.km || null,
    ...custodiaABody(quien, 'cobrado_por'),
  } as CuerpoParada);

  function guardar(cerrar: boolean) {
    onGuardar(cuerpo(), cerrar);
    setF(vacio);
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Agregar parada"
      descripcion="Cada parada cobra completo; los gastos del viaje se comparten.">
      <div className="space-y-4">
        <Campo label="¿A dónde?">
          <Input value={f.destino} autoFocus placeholder="Metepec, Toluca, CDMX…"
            className="!py-2.5 !text-base"
            onChange={(e) => setF({ ...f, destino: e.target.value })} />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Precio del flete">
            <CampoMonto valor={f.precio} onCambio={(v) => setF({ ...f, precio: v })} />
          </Campo>
          <Campo label="Km que agrega"
            hint={`Se suman al viaje${ruta.km_total ? ` (hoy ${Number(ruta.km_total)} km)` : ''}.`}>
            <Input type="number" inputMode="decimal" placeholder="0" value={f.km}
              className="!py-2.5 !text-base"
              onChange={(e) => setF({ ...f, km: e.target.value })} />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Cliente">
            <Select value={f.cliente_id} onChange={(e) => setF({ ...f, cliente_id: e.target.value })}>
              <option value="">— Sin cliente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label="Vendedor" hint="Define su comisión al cerrar.">
            <Select value={f.vendedor_id} onChange={(e) => setF({ ...f, vendedor_id: e.target.value })}>
              <option value="">— Sin vendedor —</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </Select>
          </Campo>
        </div>

        <SelectorTamano valor={f.tamano_carga} onCambio={(t) => setF({ ...f, tamano_carga: t })} />

        <Interruptor activo={f.a_credito} onCambio={(v) => setF({ ...f, a_credito: v })}
          titulo="A crédito" detalle="Pagará después. Aparece en cuentas por cobrar." />

        {!f.a_credito && (
          <QuienTuvo valor={quien} onCambio={setQuien} etiqueta="¿Quién cobra?" sugeridos={gente} />
        )}

        <Aviso error={error} />

        <AccionesModal>
          <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="suave" disabled={cargando || !f.destino.trim()} onClick={() => guardar(false)}>
            Guardar y agregar otra
          </Boton>
          <Boton disabled={cargando || !f.destino.trim()} onClick={() => guardar(true)}>
            {cargando ? 'Guardando…' : 'Agregar parada'}
          </Boton>
        </AccionesModal>
      </div>
    </Modal>
  );
}

/**
 * Captura de gastos en varias líneas. Un viaje trae gasolina, casetas y comida
 * del mismo tirón: obligar a guardar uno por uno convierte tres datos en tres
 * viajes al servidor y tres esperas.
 */
function ModalGasto({
  abierto, onCerrar, ruta, gente, onGuardar, error, cargando,
}: {
  abierto: boolean; onCerrar: () => void; ruta: Ruta;
  gente: { id: string; nombre: string }[];
  onGuardar: (lineas: LineaGasto[], quien: Custodia) => void;
  error: string | null; cargando: boolean;
}) {
  const [lineas, setLineas] = useState<LineaGasto[]>([nuevaLinea()]);
  // Un solo custodio para todas las líneas: quien sale al viaje paga la
  // gasolina y las casetas del mismo dinero, no una cosa cada quien.
  const [quien, setQuien] = useState<Custodia>(SIN_CUSTODIA);

  const agregar = (cat?: CategoriaGasto) => setLineas((ls) => [...ls, nuevaLinea(cat)]);
  const cambiar = (k: number, campos: Partial<LineaGasto>) =>
    setLineas((ls) => ls.map((l) => (l.k === k ? { ...l, ...campos } : l)));
  const quitar = (k: number) =>
    setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.k !== k) : [nuevaLinea()]));

  const conMonto = lineas.filter((l) => Number(l.monto) > 0);
  const total = conMonto.reduce((s, l) => s + Number(l.monto), 0);

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Registrar gastos" ancho="ancho"
      descripcion={`Se fechan el ${fechaCorta(ruta.fecha)}, igual que el viaje.`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-mute">Atajos:</span>
          {CATS.map((c) => <Chip key={c.v} onClick={() => agregar(c.v)}>+ {c.label}</Chip>)}
        </div>

        <div className="space-y-2">
          {lineas.map((l) => (
            <div key={l.k} className="flex flex-wrap items-center gap-2">
              <Select className="w-40" value={l.categoria}
                onChange={(e) => cambiar(l.k, { categoria: e.target.value as CategoriaGasto })}>
                {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </Select>
              <div className="relative w-32">
                <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-mute">$</span>
                <Input className="cifra !pl-7" type="number" inputMode="decimal" placeholder="0" value={l.monto}
                  onChange={(e) => cambiar(l.k, { monto: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
              </div>
              <Input className="min-w-[10rem] flex-1" placeholder="Descripción (opcional)" value={l.descripcion}
                onChange={(e) => cambiar(l.k, { descripcion: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
              <button onClick={() => quitar(l.k)} className="px-1 text-ink-mute transition hover:text-bad"
                aria-label="Quitar línea">✕</button>
            </div>
          ))}
        </div>

        <button onClick={() => agregar()} className="text-sm text-brand transition hover:underline">
          + Otra línea
        </button>

        <QuienTuvo valor={quien} onCambio={setQuien} etiqueta="¿Quién lo paga?" sugeridos={gente} />

        <Aviso error={error} />

        <AccionesModal>
          <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
          <Boton disabled={cargando || conMonto.length === 0}
            onClick={() => { onGuardar(conMonto, quien); setLineas([nuevaLinea()]); }}>
            {cargando ? 'Guardando…'
              : conMonto.length > 1
                ? `Guardar ${conMonto.length} gastos · ${mxn(total)}`
                : `Guardar gasto${total ? ` · ${mxn(total)}` : ''}`}
          </Boton>
        </AccionesModal>
      </div>
    </Modal>
  );
}

function ModalTripulacion({
  abierto, onCerrar, choferes, ayudantes, yaEstan, onGuardar, error, cargando,
}: {
  abierto: boolean; onCerrar: () => void;
  choferes: Contacto[]; ayudantes: Contacto[]; yaEstan: Tripulante[];
  onGuardar: (contactoId: string, rol: 'chofer' | 'ayudante') => void;
  error: string | null; cargando: boolean;
}) {
  const [rol, setRol] = useState<'chofer' | 'ayudante'>('ayudante');
  const gente = rol === 'chofer' ? choferes : ayudantes;
  const puestos = new Set(yaEstan.map((t) => `${t.contacto_id}:${t.rol}`));

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Agregar a la tripulación"
      descripcion="Sus porcentajes se congelan al cerrar la ruta.">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Chip activo={rol === 'chofer'} onClick={() => setRol('chofer')}>Chofer</Chip>
          <Chip activo={rol === 'ayudante'} onClick={() => setRol('ayudante')}>Ayudante</Chip>
        </div>

        {gente.length === 0 ? (
          <p className="py-6 text-sm text-ink-mute">
            No hay nadie con el rol de {rol}. Se dan de alta en Contactos.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {gente.map((c) => {
              const puesto = puestos.has(`${c.id}:${rol}`);
              return (
                <button key={c.id} type="button" disabled={cargando || puesto}
                  onClick={() => onGuardar(c.id, rol)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07]
                    bg-white/[0.03] px-3.5 py-3 text-left text-sm transition
                    hover:border-brand hover:bg-brand/[0.06] disabled:opacity-40 disabled:hover:border-white/[0.07]">
                  <span className="truncate">{c.nombre}</span>
                  <span className="shrink-0 text-xs text-ink-mute">{puesto ? 'ya está' : 'agregar'}</span>
                </button>
              );
            })}
          </div>
        )}

        <Aviso error={error} />
      </div>
    </Modal>
  );
}
