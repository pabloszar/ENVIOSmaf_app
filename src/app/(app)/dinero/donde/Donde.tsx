'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/cliente';
import { Boton, BotonMini, Aviso, Chip, Modal, AccionesModal, CampoMonto, Campo, Input, useAccion } from '@/components/ui';
import Comprobante from '@/components/Comprobante';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import { METODO_INFO, TIENDAS_MAF, type Metodo } from '@/lib/cobro';
import { usePeriodo } from '../periodo';
import { calcularFlujo, calcularSaldos, calcularPorMetodo } from '../calculos';
import EnManosDe from '../EnManosDe';
import Movimientos from '../Movimientos';
import { construirMovimientos } from '../libro';
import type { DatosDinero } from '../datos';
import type { CajaMes } from '../tipos';

type Bloque = 'metodos' | 'manos' | 'libro' | 'meses';

/**
 * Dónde está el dinero.
 *
 * Es la página que faltaba. "Entra" y "Sale" cuentan lo que pasó; esta cuenta
 * lo que hay, y son cosas distintas: el dinero de un flete puede haber
 * entrado y aun así no estar en tu caja, porque lo cobró la tienda o porque lo
 * trae el chofer. Sin este apartado, esas dos situaciones solo se notaban al
 * contar el efectivo y no cuadrar.
 *
 * Se abre por forma de pago porque esa es la pregunta que se hace con el
 * estado de cuenta en la mano: cuánto debería haber en el banco, cuánto en
 * efectivo, y cuánto se quedó en la tienda a cuenta de la renta.
 */
export default function Donde({ datos }: { datos: DatosDinero }) {
  const router = useRouter();
  const { activo, etiqueta, hayFiltro } = usePeriodo();
  const { cargando, error, correr, setError } = useAccion();
  const [bloque, setBloque] = useState<Bloque>('metodos');
  const [abonando, setAbonando] = useState(false);
  // El comprobante vive aquí y no dentro de la ventana: la ventana se cierra
  // al guardar, y con ella se iría el recibo antes de poder capturarlo.
  const [recibo, setRecibo] = useState<{ monto: number; fecha: string; nota: string } | null>(null);

  async function accion(fn: () => Promise<void>) {
    await correr(async () => { await fn(); router.refresh(); });
  }

  const flujo = useMemo(() => calcularFlujo(datos, activo), [datos, activo]);
  const saldos = useMemo(() => calcularSaldos(datos, activo, flujo), [datos, activo, flujo]);
  const metodos = useMemo(() => calcularPorMetodo(datos, activo), [datos, activo]);
  const movimientos = useMemo(() => construirMovimientos(datos, activo), [datos, activo]);

  const cobrosPorEnvio = useMemo(() => {
    const m = new Map<string, typeof datos.cobrosTodos>();
    for (const c of datos.cobrosTodos) {
      if (!m.has(c.envio_id)) m.set(c.envio_id, []);
      m.get(c.envio_id)!.push(c);
    }
    return m;
  }, [datos.cobrosTodos]);

  const tienda = datos.cuentaTienda;
  const porAbonar = Number(tienda?.saldo ?? 0);
  const sinEspecificar = metodos.find((m) => m.metodo === 'sin_especificar')?.saldo ?? 0;

  const bloques: { id: Bloque; label: string; badge?: string }[] = [
    { id: 'metodos', label: 'Por forma de pago' },
    { id: 'manos', label: 'En manos de',
      badge: saldos.enOtrasManos > 0.5 ? mxn(saldos.enOtrasManos) : undefined },
    { id: 'libro', label: 'Libro de movimientos', badge: String(movimientos.length) },
    { id: 'meses', label: 'Caja por mes' },
  ];

  return (
    <div className="space-y-5">
      <Aviso error={error} />

      {/* Las tres bolsas. La de la tienda es la que no se podía representar
          antes: cobrado, real, y sin embargo nunca va a llegar a tu caja. */}
      <div className="grid gap-3 md:grid-cols-3">
        <Bolsa titulo="Quedó en el periodo" monto={flujo.quedo}
          detalle={hayFiltro && Math.abs(saldos.fuera.caja) > 0.5
            ? `y ${mxn(saldos.fuera.caja)} de antes del periodo`
            : `entró ${mxn(flujo.entro)}, salió ${mxn(flujo.salio)}`}
          tono={flujo.quedo < 0 ? 'malo' : undefined} />
        <Bolsa titulo="Lo trae alguien más" monto={saldos.enOtrasManos}
          detalle={saldos.cuentasAbiertas
            ? `${saldos.cuentasAbiertas} cuenta${saldos.cuentasAbiertas === 1 ? '' : 's'} abierta${saldos.cuentasAbiertas === 1 ? '' : 's'}`
            : 'todo el dinero está en tu caja'}
          tono={saldos.enOtrasManos > 0.5 ? 'aviso' : undefined}
          onIr={saldos.enOtrasManos > 0.5 ? () => setBloque('manos') : undefined} />
        <Bolsa titulo="Cobrado en tienda" monto={porAbonar}
          detalle={tienda == null ? 'falta correr fase6.sql'
            : porAbonar > 0.5
              ? `de ${mxn(Number(tienda.cobrado))} cobrados, faltan por abonar a la renta`
              : `${mxn(Number(tienda.aplicado))} ya abonados a la renta`}
          tono={porAbonar > 0.5 ? 'info' : undefined}
          accion={porAbonar > 0.5
            ? <BotonMini onClick={() => { setError(null); setAbonando(true); }}>Abonar a la renta</BotonMini>
            : undefined} />
      </div>

      <div className="flex flex-wrap gap-2">
        {bloques.map((b) => (
          <Chip key={b.id} activo={bloque === b.id} onClick={() => { setError(null); setBloque(b.id); }}>
            {b.label}{b.badge ? ` · ${b.badge}` : ''}
          </Chip>
        ))}
      </div>

      {bloque === 'metodos' && (
        <section className="tarjeta p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-line px-5 py-3">
            <h2 className="text-sm font-semibold">Por forma de pago · {etiqueta}</h2>
            <span className="text-xs text-ink-mute">Para cuadrar contra el banco y contra el efectivo</span>
          </div>

          {metodos.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-mute">
              Sin movimientos en {etiqueta}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-ink-mute">
                    <th className="px-5 py-2 text-left">Forma de pago</th>
                    <th className="px-3 py-2 text-right">Entró</th>
                    <th className="px-3 py-2 text-right">Salió</th>
                    <th className="px-5 py-2 text-right">Debería haber</th>
                  </tr>
                </thead>
                <tbody>
                  {metodos.map((m) => {
                    const info = m.metodo === 'sin_especificar' ? null : METODO_INFO[m.metodo as Metodo];
                    return (
                      <tr key={m.metodo} className="fila">
                        <td className="px-5 py-2.5">
                          <span className="font-medium">
                            {info ? `${info.emoji} ${info.label}` : '❓ Sin especificar'}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-mute">
                            {info?.donde ?? 'Fletes que se dan por cobrados al entregar, sin decir cómo.'}
                          </span>
                        </td>
                        <td className="cifra px-3 py-2.5 text-right text-ink-soft">
                          {m.entradas ? mxn(m.entradas) : '—'}
                        </td>
                        <td className="cifra px-3 py-2.5 text-right text-ink-soft">
                          {m.salidas ? `−${mxn(m.salidas)}` : '—'}
                        </td>
                        <td className={`cifra px-5 py-2.5 text-right font-medium ${
                          m.saldo < 0 ? 'text-bad' : ''}`}>
                          {mxn(m.saldo)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-surface-line bg-surface-raised font-semibold">
                    <td className="px-5 py-2 text-xs uppercase tracking-wide text-ink-mute">Total</td>
                    <td className="cifra px-3 py-2 text-right">
                      {mxn(metodos.reduce((s, m) => s + m.entradas, 0))}
                    </td>
                    <td className="cifra px-3 py-2 text-right">
                      −{mxn(metodos.reduce((s, m) => s + m.salidas, 0))}
                    </td>
                    <td className="cifra px-5 py-2 text-right">
                      {mxn(metodos.reduce((s, m) => s + m.saldo, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {sinEspecificar > 0.5 && (
            <p className="border-t border-surface-line px-5 py-3 text-sm text-ink-mute">
              Los {mxn(sinEspecificar)} sin especificar son fletes que la app da por cobrados en
              efectivo al entregar. Mientras no digas cómo se pagaron, esta tabla no puede cuadrar
              contra el banco. Se aterrizan uno por uno desde <strong>Entra</strong>.
            </p>
          )}
        </section>
      )}

      {bloque === 'manos' && (
        <EnManosDe saldos={datos.custodia} entregas={datos.entregas} contactos={datos.contactos}
          cargando={cargando} accion={accion} disponible={datos.fase5} />
      )}

      {bloque === 'libro' && (
        <Movimientos movimientos={movimientos} etiquetaPeriodo={etiqueta}
          cobrosPorEnvio={cobrosPorEnvio} contactos={datos.contactos}
          cargando={cargando} accion={accion} setError={setError} error={error} />
      )}

      {bloque === 'meses' && <Caja caja={datos.caja} />}

      {/* La key lo reconstruye al abrirlo y cuando cambia el saldo: sin ella,
          el campo se quedaría con el monto que había la primera vez. */}
      <ModalAbonar key={`${abonando}-${porAbonar}`}
        abierto={abonando} porAbonar={porAbonar} cargando={cargando} error={error}
        onCerrar={() => setAbonando(false)}
        onGuardar={(monto, fecha, notas) => accion(async () => {
          const nota = notas || 'Fletes cobrados en la caja de Tiendas MAF, a cuenta de la renta.';
          await api('/api/pagos-renta', { method: 'POST', body: {
            monto, fecha, concepto: 'cobrado_en_tienda', metodo: 'tienda', notas: nota,
          } });
          // El comprobante solo después de que el servidor confirmó: emitirlo
          // antes daría por bueno un abono que pudo no guardarse.
          setRecibo({ monto, fecha, nota });
          setAbonando(false);
        })} />

      {recibo && (
        <Comprobante abierto onCerrar={() => setRecibo(null)}
          titulo="Comprobante de abono" concepto="Fletes cobrados en tienda, a cuenta de la renta"
          para={TIENDAS_MAF} monto={recibo.monto} fecha={recibo.fecha} nota={recibo.nota} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */

function Bolsa({ titulo, monto, detalle, tono, onIr, accion }: {
  titulo: string; monto: number; detalle: string;
  tono?: 'aviso' | 'malo' | 'info'; onIr?: () => void; accion?: React.ReactNode;
}) {
  const color = tono === 'malo' ? 'text-bad' : tono === 'aviso' ? 'text-warn'
    : tono === 'info' ? 'text-acento' : 'text-ink';
  const borde = tono === 'aviso' ? 'border-warn/25 bg-warn/[0.06]'
    : tono === 'info' ? 'border-acento/25 bg-acento/[0.06]'
    : 'border-surface-line bg-surface-raised';

  const cuerpo = (
    <>
      <p className="etiqueta">{titulo}</p>
      <p className={`cifra mt-1.5 text-3xl font-light leading-none tracking-tight ${color}`}>
        {mxn(monto)}
      </p>
      <p className="mt-2 text-xs leading-tight text-ink-mute">{detalle}</p>
      {accion && <div className="mt-3">{accion}</div>}
    </>
  );

  if (onIr) {
    return (
      <button onClick={onIr} className={`rounded-xl border p-4 text-left transition hover:border-ink-mute ${borde}`}>
        {cuerpo}
      </button>
    );
  }
  return <div className={`rounded-xl border p-4 ${borde}`}>{cuerpo}</div>;
}

/**
 * Abonar a la renta lo que la tienda cobró.
 *
 * No es un pago: no sale dinero de la caja. Es reconocer que un dinero que
 * Tiendas MAF ya tiene se toma a cuenta de lo que se le debe por las unidades.
 * Por eso baja el fondo de renta y no la caja.
 */
function ModalAbonar({
  abierto, porAbonar, onCerrar, onGuardar, error, cargando,
}: {
  abierto: boolean; porAbonar: number;
  onCerrar: () => void;
  onGuardar: (monto: number, fecha: string, notas: string) => void;
  error: string | null; cargando: boolean;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  // Arranca con el saldo completo: abonar todo es lo que se hace casi siempre,
  // y bajarlo para un abono parcial es borrar dígitos, no escribir la cifra.
  const [monto, setMonto] = useState(String(porAbonar));
  const [fecha, setFecha] = useState(hoy);
  const [notas, setNotas] = useState('');

  const n = Number(monto || 0);
  const excede = n > porAbonar + 0.005;

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Abonar a la renta"
      descripcion={`${TIENDAS_MAF} cobró ${mxn(porAbonar)} de fletes que no llegaron a tu caja.`}>
      <div className="space-y-4">
        <div className="rounded-xl border border-surface-line bg-surface-raised p-3 text-sm text-ink-mute">
          Este movimiento no saca dinero de tu caja: ese dinero nunca estuvo ahí.
          Baja lo que le debes a {TIENDAS_MAF} por la renta de las unidades.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Cuánto abonar">
            <CampoMonto valor={monto} onCambio={setMonto} />
          </Campo>
          <Campo label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
        </div>

        <div className="flex gap-2">
          <Chip activo={n === porAbonar} onClick={() => setMonto(String(porAbonar))}>
            Todo · {mxn(porAbonar)}
          </Chip>
        </div>

        <Campo label="Nota" hint="Opcional. Aparece en el comprobante.">
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Corte de junio…" />
        </Campo>

        {excede && (
          <p className="rounded-xl border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
            No puedes abonar más de lo que la tienda cobró ({mxn(porAbonar)}).
          </p>
        )}

        <Aviso error={error} />

        <AccionesModal>
          <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
          <Boton disabled={cargando || !(n > 0) || excede}
            onClick={() => onGuardar(n, fecha, notas)}>
            {cargando ? 'Guardando…' : `Abonar ${mxn(n)}`}
          </Boton>
        </AccionesModal>
      </div>
    </Modal>
  );
}

/** El flujo mes a mes: la vista larga, para ver si la tendencia va bien. */
function Caja({ caja }: { caja: CajaMes[] }) {
  const mesActual = new Date().toISOString().slice(0, 7);
  const suma = (f: (m: CajaMes) => number) => caja.reduce((s, m) => s + Number(f(m)), 0);

  return (
    <section className="tarjeta p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-line px-5 py-3">
        <h2 className="text-sm font-semibold">Caja por mes</h2>
        <span className="text-xs text-ink-mute">Todo el histórico, sin filtrar</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-mute">
              <th className="px-5 py-2 text-left">Mes</th>
              <th className="px-3 py-2 text-right">Entradas</th>
              <th className="px-3 py-2 text-right">Operativos</th>
              <th className="px-3 py-2 text-right">Comisiones</th>
              <th className="px-3 py-2 text-right">Renta</th>
              <th className="px-3 py-2 text-right">Inversión</th>
              <th className="px-3 py-2 text-right">Retiros</th>
              <th className="px-5 py-2 text-right">Flujo neto</th>
            </tr>
          </thead>
          <tbody>
            {caja.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-ink-mute">Sin movimientos todavía.</td></tr>
            )}
            {caja.map((m) => {
              const esActual = m.mes.slice(0, 7) === mesActual;
              return (
                <tr key={m.mes} className={`border-t border-surface-line ${esActual ? 'bg-acento/[0.06]' : ''}`}>
                  <td className="px-5 py-2 font-medium">
                    {nombreMes(m.mes)}
                    {esActual && <span className="ml-2 text-xs font-normal text-brand">en curso</span>}
                  </td>
                  <td className="cifra px-3 py-2 text-right">{mxn(Number(m.entradas))}</td>
                  <td className="cifra px-3 py-2 text-right text-ink-soft">{mxn(Number(m.salidas_operativas))}</td>
                  <td className="cifra px-3 py-2 text-right text-ink-soft">{mxn(Number(m.salidas_comisiones))}</td>
                  <td className="cifra px-3 py-2 text-right text-ink-soft">{mxn(Number(m.salidas_renta ?? 0))}</td>
                  <td className="cifra px-3 py-2 text-right text-ink-soft">{mxn(Number(m.salidas_inversion))}</td>
                  <td className="cifra px-3 py-2 text-right text-ink-soft">{mxn(Number(m.salidas_retiro))}</td>
                  <td className={`cifra px-5 py-2 text-right font-medium ${Number(m.flujo_neto) < 0 ? 'text-bad' : 'text-good'}`}>
                    {mxn(Number(m.flujo_neto))}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {caja.length > 0 && (
            <tfoot>
              <tr className="border-t border-surface-line bg-surface-sunk/40 font-semibold">
                <td className="px-5 py-2 text-xs uppercase tracking-wide text-ink-mute">Acumulado</td>
                <td className="cifra px-3 py-2 text-right">{mxn(suma((m) => m.entradas))}</td>
                <td className="cifra px-3 py-2 text-right">{mxn(suma((m) => m.salidas_operativas))}</td>
                <td className="cifra px-3 py-2 text-right">{mxn(suma((m) => m.salidas_comisiones))}</td>
                <td className="cifra px-3 py-2 text-right">{mxn(suma((m) => m.salidas_renta ?? 0))}</td>
                <td className="cifra px-3 py-2 text-right">{mxn(suma((m) => m.salidas_inversion))}</td>
                <td className="cifra px-3 py-2 text-right">{mxn(suma((m) => m.salidas_retiro))}</td>
                <td className={`cifra px-5 py-2 text-right ${suma((m) => m.flujo_neto) < 0 ? 'text-bad' : 'text-good'}`}>
                  {mxn(suma((m) => m.flujo_neto))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function nombreMes(iso: string): string {
  const [a, m] = iso.split('-');
  const n = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
    'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${n[Number(m) - 1]} ${a}`;
}
