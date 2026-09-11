'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import { METODOS, METODO_INFO, type Metodo } from '@/lib/cobro';
import type { MisionChofer } from '@/types';

/**
 * Las misiones del día.
 *
 * Agrupadas por viaje y en el orden de entrega, que es el orden en que se
 * manejan. Cada una se abre para hacer las tres cosas que se hacen en la
 * puerta del cliente: decir que ya se entregó, decir cómo pagaron y dejar la
 * foto.
 *
 * Lo que NO hay: cerrar el viaje. Eso congela los porcentajes y genera las
 * comisiones, y no puede dispararse desde la calle. Aquí se reportan hechos.
 */
export default function Misiones({ nombre, misiones }: {
  nombre: string; misiones: MisionChofer[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState<MisionChofer | null>(null);

  const viajes = agruparPorViaje(misiones);
  const pendientes = misiones.filter((m) => !m.entregado_en).length;
  const porCobrar = misiones
    .filter((m) => !m.cobro_detallado)
    .reduce((s, m) => s + Number(m.precio), 0);

  async function pedir(url: string, opciones: RequestInit, quien: string) {
    setOcupado(quien);
    setError(null);
    try {
      const res = await fetch(url, opciones);
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(cuerpo.error ?? 'No se pudo guardar.');
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Revisa tu señal.');
      return false;
    } finally {
      setOcupado(null);
    }
  }

  const entregar = (m: MisionChofer, entregada: boolean) => pedir(
    '/api/chofer/entregar',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envio_id: m.envio_id, entregada }),
    },
    m.envio_id
  );

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/[0.07]
        bg-surface-sunk/85 px-5 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-medium leading-tight">{nombre}</p>
            <p className="mt-0.5 text-xs text-ink-mute">
              {pendientes === 0
                ? misiones.length === 0 ? 'Sin viajes asignados' : 'Todo entregado'
                : `${pendientes} ${pendientes === 1 ? 'entrega pendiente' : 'entregas pendientes'}`}
              {porCobrar > 0 && ` · ${mxn(porCobrar)} por cobrar`}
            </p>
          </div>
          <Link href="/chofer/historico"
            className="shrink-0 rounded-full border border-white/[0.10] px-3.5 py-2
              text-xs text-ink-soft transition active:border-brand">
            Anteriores
          </Link>
          <Salir />
        </div>
      </header>

      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-xl border border-bad/40 bg-bad/10
          px-4 py-3 text-sm text-bad">
          {error}
        </p>
      )}

      <main className="flex-1 space-y-6 px-5 py-5">
        {misiones.length === 0 && (
          <div className="pt-16 text-center">
            <p className="text-base">No tienes viajes asignados.</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-mute">
              Cuando te asignen uno aparecerá aquí. Puedes cerrar la app.
            </p>
          </div>
        )}

        {viajes.map((viaje) => (
          <section key={viaje.ruta_id}>
            <div className="flex items-baseline gap-2 px-1 pb-2.5">
              <h2 className="text-sm font-medium">
                {fechaCorta(viaje.fecha)}
              </h2>
              <span className="text-xs text-ink-mute">
                #{viaje.folio} · {viaje.misiones.length}{' '}
                {viaje.misiones.length === 1 ? 'entrega' : 'entregas'}
                {viaje.vehiculo && ` · ${viaje.vehiculo}`}
              </span>
            </div>

            {viaje.notas_ruta && (
              <p className="mb-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03]
                px-4 py-2.5 text-[13px] leading-snug text-ink-soft">
                {viaje.notas_ruta}
              </p>
            )}

            <ul className="space-y-2.5">
              {viaje.misiones.map((m) => (
                <Mision key={m.envio_id} m={m}
                  ocupado={ocupado === m.envio_id}
                  onEntregar={(v) => entregar(m, v)}
                  onCobrar={() => { setError(null); setCobrando(m); }}
                  onFoto={async (archivo) => {
                    const form = new FormData();
                    form.append('archivo', archivo);
                    form.append('envio_id', m.envio_id);
                    await pedir('/api/chofer/evidencia', { method: 'POST', body: form }, m.envio_id);
                  }} />
              ))}
            </ul>
          </section>
        ))}
      </main>

      {cobrando && (
        <HojaCobro mision={cobrando} onCerrar={() => setCobrando(null)}
          onGuardar={async (lineas) => {
            const ok = await pedir('/api/chofer/cobro', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ envio_id: cobrando.envio_id, lineas }),
            }, cobrando.envio_id);
            if (ok) setCobrando(null);
          }} />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Una misión
   ══════════════════════════════════════════════════════════════════════════ */

function Mision({ m, ocupado, onEntregar, onCobrar, onFoto }: {
  m: MisionChofer;
  ocupado: boolean;
  onEntregar: (entregada: boolean) => void;
  onCobrar: () => void;
  onFoto: (archivo: File) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const camara = useRef<HTMLInputElement>(null);
  const entregada = !!m.entregado_en;
  const falta = Math.round((Number(m.precio) - Number(m.cobrado)) * 100) / 100;

  const detalles = [
    m.tamano_carga,
    m.num_articulos ? `${m.num_articulos} art.` : null,
    m.num_pisos ? `${m.num_pisos} ${m.num_pisos === 1 ? 'piso' : 'pisos'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <li className={`lamina overflow-hidden transition ${entregada ? 'opacity-65' : ''}`}>
      <button type="button" onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-4 text-left">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full
          text-sm font-medium ${entregada
            ? 'bg-good/20 text-good'
            : 'bg-brand/25 text-brand'}`}>
          {entregada ? '✓' : m.secuencia}
        </span>

        <span className="min-w-0 flex-1">
          <span className={`block truncate text-base font-medium leading-tight ${
            entregada ? 'line-through decoration-ink-mute' : ''}`}>
            {m.destino}
          </span>
          {(m.zona || m.cliente) && (
            <span className="mt-0.5 block truncate text-[13px] text-ink-mute">
              {[m.cliente, m.zona].filter(Boolean).join(' · ')}
            </span>
          )}
          {detalles && (
            <span className="mt-0.5 block truncate text-xs text-ink-mute">{detalles}</span>
          )}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="cifra text-base font-medium">{mxn(Number(m.precio))}</span>
          <EtiquetaCobro mision={m} falta={falta} />
        </span>
      </button>

      {abierta && (
        <div className="space-y-3 border-t border-white/[0.07] bg-black/25 px-4 py-4">
          {m.notas_envio && (
            <p className="text-[13px] leading-snug text-ink-soft">{m.notas_envio}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Enlace href={mapa(m)}>Cómo llegar</Enlace>
            {m.cliente_telefono && (
              <Enlace href={`tel:${m.cliente_telefono.replace(/[^\d+]/g, '')}`}>
                Llamar al cliente
              </Enlace>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <Accion onClick={() => onEntregar(!entregada)} disabled={ocupado}
              tono={entregada ? 'plano' : 'bueno'}>
              {entregada ? 'Deshacer entrega' : 'Ya la entregué'}
            </Accion>
            <Accion onClick={onCobrar} disabled={ocupado}
              tono={m.cobro_detallado ? 'plano' : 'marca'}>
              {m.cobro_detallado ? 'Cambiar cobro' : 'Cómo me pagaron'}
            </Accion>
            <Accion onClick={() => camara.current?.click()} disabled={ocupado} tono="plano">
              {m.evidencias > 0 ? `Otra foto (${m.evidencias})` : 'Tomar foto'}
            </Accion>
          </div>

          {/* `capture` abre la cámara directo. Sin él, el teléfono ofrece la
              galería y hay que ir a buscar la foto que se acaba de tomar. */}
          <input ref={camara} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFoto(f);
              e.target.value = '';
            }} />

          {ocupado && <p className="text-xs text-ink-mute">Guardando…</p>}
        </div>
      )}
    </li>
  );
}

/** Cómo quedó el cobro, en una etiqueta chica. */
function EtiquetaCobro({ mision: m, falta }: { mision: MisionChofer; falta: number }) {
  if (!m.cobro_detallado) {
    return (
      <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-ink-mute">
        sin cobrar
      </span>
    );
  }
  if (falta > 0) {
    return (
      <span className="cifra rounded-full bg-warn/15 px-2 py-0.5 text-[11px] text-warn">
        debe {mxn(falta)}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-good/15 px-2 py-0.5 text-[11px] text-good">
      cobrado
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Cómo me pagaron
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * La hoja del cobro.
 *
 * Arranca con el total en efectivo, que es como se paga casi siempre: así el
 * caso normal se resuelve con un toque. Repartir entre dos formas de pago se
 * puede, pero no le cuesta nada al que no lo necesita.
 */
function HojaCobro({ mision, onCerrar, onGuardar }: {
  mision: MisionChofer;
  onCerrar: () => void;
  onGuardar: (lineas: { metodo: Metodo; monto: number }[]) => void;
}) {
  const precio = Number(mision.precio);
  const [montos, setMontos] = useState<Record<Metodo, string>>({
    efectivo: String(precio), transferencia: '', tienda: '',
  });

  const suma = METODOS.reduce((s, m) => s + (Number(montos[m]) || 0), 0);
  const falta = Math.round((precio - suma) * 100) / 100;
  const sobra = suma > precio;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
      onClick={onCerrar}>
      <div className="lamina max-h-[88dvh] overflow-y-auto rounded-b-none px-5 pb-8 pt-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium tracking-tight">¿Cómo te pagaron?</h2>
          <button type="button" onClick={onCerrar}
            className="text-sm text-ink-mute active:text-ink">Cancelar</button>
        </div>
        <p className="mt-1 truncate text-sm text-ink-mute">
          {mision.destino} · {mxn(precio)}
        </p>

        <div className="mt-5 space-y-3">
          {METODOS.map((m) => (
            <div key={m} className="flex items-center gap-3">
              <span className="w-8 text-center text-lg" aria-hidden>{METODO_INFO[m].emoji}</span>
              <label htmlFor={`monto-${m}`} className="min-w-0 flex-1 text-[15px]">
                {METODO_INFO[m].label}
              </label>
              <span className="cifra text-ink-mute">$</span>
              <input id={`monto-${m}`} type="number" inputMode="decimal" min="0" placeholder="0"
                value={montos[m]}
                onChange={(e) => setMontos({ ...montos, [m]: e.target.value })}
                className="cifra w-28 rounded-xl border border-surface-line bg-surface-raised
                  px-3 py-2.5 text-right text-base outline-none transition
                  focus:border-brand focus:ring-2 focus:ring-brand/25" />
            </div>
          ))}
        </div>

        {/* Ni cuadra ni no cuadra: dice cuánto falta, que es lo accionable.
            El cliente que abona una parte es un caso normal, no un error. */}
        <p className={`mt-4 text-sm ${sobra ? 'text-bad' : falta > 0 ? 'text-warn' : 'text-good'}`}>
          {sobra
            ? `Se pasa por ${mxn(suma - precio)}.`
            : falta > 0
              ? `Faltan ${mxn(falta)}. Se guardan como pendientes de cobro.`
              : 'Cuadra con el flete.'}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setMontos({
            efectivo: String(precio), transferencia: '', tienda: '',
          })} className="rounded-2xl border border-white/[0.10] py-3.5 text-sm text-ink-soft
            transition active:bg-white/[0.06]">
            Todo en efectivo
          </button>
          <button type="button" disabled={sobra || suma <= 0}
            onClick={() => onGuardar(
              METODOS
                .filter((m) => Number(montos[m]) > 0)
                .map((m) => ({ metodo: m, monto: Number(montos[m]) }))
            )}
            className="rounded-2xl bg-brand py-3.5 text-sm font-medium text-surface-sunk
              transition active:opacity-80 disabled:opacity-35">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Piezas
   ══════════════════════════════════════════════════════════════════════════ */

function Accion({ onClick, disabled, tono, children }: {
  onClick: () => void; disabled?: boolean;
  tono: 'bueno' | 'marca' | 'plano'; children: React.ReactNode;
}) {
  const color = tono === 'bueno'
    ? 'border-good/40 text-good active:bg-good/10'
    : tono === 'marca'
      ? 'border-brand/50 text-brand active:bg-brand/10'
      : 'border-white/[0.10] text-ink-soft active:bg-white/[0.06]';
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-2xl border py-3.5 text-[13px] font-medium transition
        disabled:opacity-40 ${color}`}>
      {children}
    </button>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="rounded-full border border-white/[0.10] px-3.5 py-2 text-xs text-ink-soft
        transition active:border-brand">
      {children}
    </a>
  );
}

function Salir() {
  const router = useRouter();
  return (
    <button type="button" aria-label="Salir"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/chofer/entrar');
        router.refresh();
      }}
      className="shrink-0 rounded-full border border-white/[0.10] px-3 py-2 text-xs text-ink-mute
        transition active:text-bad">
      Salir
    </button>
  );
}

/**
 * El enlace al mapa del teléfono.
 *
 * Con coordenadas se manda el punto exacto; sin ellas, el texto del destino,
 * que es lo que hay. `geo:` lo entienden Android e iOS y deja que cada quien
 * abra el mapa que usa, en vez de forzar el de una marca.
 */
function mapa(m: MisionChofer): string {
  if (m.lat != null && m.lng != null) {
    return `geo:${m.lat},${m.lng}?q=${m.lat},${m.lng}(${encodeURIComponent(m.destino)})`;
  }
  const q = [m.destino, m.zona].filter(Boolean).join(', ');
  return `geo:0,0?q=${encodeURIComponent(q)}`;
}

interface Viaje {
  ruta_id: string; folio: number; fecha: string;
  vehiculo: string | null; notas_ruta: string | null;
  misiones: MisionChofer[];
}

/** Un renglón por entrega, agrupadas por viaje y en orden de entrega. */
function agruparPorViaje(misiones: MisionChofer[]): Viaje[] {
  const viajes = new Map<string, Viaje>();
  for (const m of misiones) {
    const v = viajes.get(m.ruta_id) ?? {
      ruta_id: m.ruta_id, folio: m.folio, fecha: m.fecha,
      vehiculo: m.vehiculo, notas_ruta: m.notas_ruta, misiones: [],
    };
    v.misiones.push(m);
    viajes.set(m.ruta_id, v);
  }
  return [...viajes.values()];
}
