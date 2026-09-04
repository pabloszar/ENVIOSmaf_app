'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import { Input, BotonMini, Aviso, Chip, Etiqueta, useAccion } from '@/components/ui';
import ModalComoSePago, { type ObjetoCobro } from '../ModalComoSePago';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import { dentro } from '@/components/FiltroPeriodo';
import { METODO_INFO, desgloseABody, esMetodo } from '@/lib/cobro';
import { usePeriodo } from '../periodo';
import type { DatosDinero } from '../datos';
import type { MovVenta, MovCobro } from '../tipos';

type Filtro = 'todo' | 'falta' | 'sin_desglose' | 'vencidas';

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'falta', label: 'Falta cobrar' },
  { id: 'vencidas', label: 'Vencidas' },
  { id: 'sin_desglose', label: 'Sin desglose' },
];

/**
 * Lo que entra: cada envío del periodo con lo que se vendió, lo que se cobró y
 * cómo se pagó.
 *
 * Sustituye a la lista de cuentas por cobrar, que era la mitad de la historia.
 * Ver solo lo que falta no deja contestar la pregunta que de verdad importaba
 * —por qué lo que la app dice que entró no es lo que hay en la mano— porque la
 * respuesta casi siempre está en un envío que la app da por cobrado y no lo
 * está del todo. Aquí los dos casos viven en la misma tabla, y desde cualquier
 * renglón se puede aterrizar lo que de verdad pasó.
 */
export default function Entra({ datos }: { datos: DatosDinero }) {
  const router = useRouter();
  const { activo, etiqueta } = usePeriodo();
  const { cargando, error, correr, setError } = useAccion();

  const [filtro, setFiltro] = useState<Filtro>('todo');
  const [busca, setBusca] = useState('');
  const [cobrando, setCobrando] = useState<ObjetoCobro | null>(null);

  async function accion(fn: () => Promise<void>) {
    await correr(async () => { await fn(); router.refresh(); });
  }

  const cobrosPorEnvio = useMemo(() => {
    const m = new Map<string, MovCobro[]>();
    for (const c of datos.cobrosTodos) {
      if (!m.has(c.envio_id)) m.set(c.envio_id, []);
      m.get(c.envio_id)!.push(c);
    }
    return m;
  }, [datos.cobrosTodos]);

  const cxcPorEnvio = useMemo(
    () => new Map(datos.cxc.map((c) => [c.envio_id, c])),
    [datos.cxc]);

  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return datos.enviosCobro
      .filter((e) => dentro(e.fecha, activo))
      .map((e) => {
        const cobros = cobrosPorEnvio.get(e.envio_id) ?? [];
        const cxc = cxcPorEnvio.get(e.envio_id) ?? null;
        const venta = Number(e.venta);
        const cobrado = Number(e.cobrado);
        return {
          e, cobros, cxc, venta, cobrado,
          falta: Math.round((venta - cobrado) * 100) / 100,
          // Sin desglose la app supone que se cobró completo al entregar. Es
          // cierto casi siempre, y es también donde se esconde el descuadre.
          supuesto: !e.cobro_detallado && !e.a_credito && cobros.length === 0,
          folio: datos.folioPorRuta[e.ruta_id] ?? null,
          cliente: e.cliente_id ? datos.nombrePorId[e.cliente_id] ?? null : null,
        };
      })
      .filter((f) => {
        if (filtro === 'falta' && f.falta <= 0.005) return false;
        if (filtro === 'vencidas' && !f.cxc?.vencido) return false;
        if (filtro === 'sin_desglose' && !f.supuesto) return false;
        if (!q) return true;
        return `${f.folio ?? ''} ${f.cliente ?? ''} ${f.e.destino}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.e.fecha.localeCompare(a.e.fecha));
  }, [datos, activo, filtro, busca, cobrosPorEnvio, cxcPorEnvio]);

  const tot = filas.reduce((a, f) => ({
    venta: a.venta + f.venta, cobrado: a.cobrado + f.cobrado, falta: a.falta + Math.max(0, f.falta),
  }), { venta: 0, cobrado: 0, falta: 0 });

  const cuentas = {
    todo: datos.enviosCobro.filter((e) => dentro(e.fecha, activo)).length,
    falta: datos.enviosCobro.filter((e) =>
      dentro(e.fecha, activo) && Number(e.venta) - Number(e.cobrado) > 0.005).length,
    vencidas: datos.cxc.filter((c) => dentro(c.fecha, activo) && c.vencido).length,
    sin_desglose: datos.enviosCobro.filter((e) =>
      dentro(e.fecha, activo) && !e.cobro_detallado && !e.a_credito).length,
  };

  return (
    <div className="space-y-5">
      <Aviso error={error} />

      {cuentas.sin_desglose > 0 && datos.fase6 && (
        <p className="rounded-xl border border-surface-line bg-surface-raised px-3.5 py-2.5 text-sm text-ink-mute">
          {cuentas.sin_desglose} {cuentas.sin_desglose === 1 ? 'envío se da' : 'envíos se dan'} por
          cobrado{cuentas.sin_desglose === 1 ? '' : 's'} en efectivo al entregar, sin comprobante.
          Si alguno se pagó distinto o de menos, ahí está la diferencia contra lo que traes en la mano.
        </p>
      )}

      <section className="tarjeta p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-surface-line px-5 py-3">
          <h2 className="text-sm font-semibold">Envíos de {etiqueta}</h2>
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <Chip key={f.id} activo={filtro === f.id} onClick={() => setFiltro(f.id)}>
                {f.label} ({cuentas[f.id]})
              </Chip>
            ))}
          </div>
          <Input className="ml-auto max-w-[14rem]" placeholder="Cliente, destino o folio…"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-mute">
                <th className="px-5 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Folio</th>
                <th className="px-3 py-2 text-left">Destino</th>
                <th className="px-3 py-2 text-left">Cómo se pagó</th>
                <th className="px-3 py-2 text-right">Venta</th>
                <th className="px-3 py-2 text-right">Cobrado</th>
                <th className="px-3 py-2 text-right">Falta</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-ink-mute">
                  {cuentas.todo === 0
                    ? `No hay envíos en ${etiqueta}.`
                    : 'Ningún envío coincide con el filtro.'}
                </td></tr>
              )}
              {filas.map((f) => (
                <tr key={f.e.envio_id} className="fila">
                  <td className="whitespace-nowrap px-5 py-2 text-ink-soft">{fechaCorta(f.e.fecha, false)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/rutas/${f.e.ruta_id}`} className="cifra text-brand hover:underline">
                      #{f.folio ?? '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block truncate">{f.e.destino}</span>
                    {f.cliente && <span className="text-xs text-ink-mute">{f.cliente}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <ChipsMetodo cobros={f.cobros} supuesto={f.supuesto}
                      credito={f.e.a_credito && f.cobros.length === 0} />
                  </td>
                  <td className="cifra px-3 py-2 text-right">{mxn(f.venta)}</td>
                  <td className={`cifra px-3 py-2 text-right ${f.supuesto ? 'text-ink-mute' : ''}`}>
                    {mxn(f.cobrado)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {f.falta > 0.005 ? (
                      f.cxc?.vencido
                        ? <Etiqueta tono="malo">{mxn(f.falta)} · {f.cxc.dias_transcurridos}d</Etiqueta>
                        : <span className="cifra font-medium text-warn">{mxn(f.falta)}</span>
                    ) : <span className="text-ink-mute">—</span>}
                  </td>
                  <td className="px-5 py-2 text-right">
                    {datos.fase6 && (
                      <BotonMini onClick={() => {
                        setError(null);
                        setCobrando({
                          envioId: f.e.envio_id, destino: f.e.destino, fecha: f.e.fecha,
                          precio: f.venta, aCredito: f.e.a_credito,
                          dias: f.cxc?.dias_transcurridos ?? null, vencido: f.cxc?.vencido,
                        });
                      }}>
                        {f.supuesto ? 'Aterrizar' : f.falta > 0.005 ? 'Cobrar' : 'Cambiar'}
                      </BotonMini>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr className="border-t border-surface-line bg-surface-raised font-semibold">
                  <td className="px-5 py-2 text-xs uppercase tracking-wide text-ink-mute" colSpan={4}>
                    {filas.length} {filas.length === 1 ? 'envío' : 'envíos'}
                  </td>
                  <td className="cifra px-3 py-2 text-right">{mxn(tot.venta)}</td>
                  <td className="cifra px-3 py-2 text-right">{mxn(tot.cobrado)}</td>
                  <td className="cifra px-3 py-2 text-right text-warn">
                    {tot.falta > 0.005 ? mxn(tot.falta) : '—'}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <ModalComoSePago objeto={cobrando}
        cobros={cobrando ? cobrosPorEnvio.get(cobrando.envioId) ?? [] : []}
        contactos={datos.contactos} error={error} cargando={cargando}
        onCerrar={() => setCobrando(null)}
        onGuardar={(envioId, d) => accion(async () => {
          await api('/api/envios/cobro', {
            method: 'PUT', body: { envio_id: envioId, ...desgloseABody(d) },
          });
          setCobrando(null);
        })} />
    </div>
  );
}

/** Cómo se pagó un envío, en etiquetas. */
function ChipsMetodo({ cobros, supuesto, credito }: {
  cobros: MovCobro[]; supuesto: boolean; credito: boolean;
}) {
  if (supuesto) return <Etiqueta tono="neutro">se supone efectivo</Etiqueta>;
  if (cobros.length === 0) {
    return credito
      ? <Etiqueta tono="aviso">a crédito</Etiqueta>
      : <Etiqueta tono="aviso">sin pagar</Etiqueta>;
  }
  const usados = [...new Set(cobros.map((c) => c.metodo).filter(esMetodo))];
  return (
    <span className="flex flex-wrap gap-1">
      {usados.map((m) => (
        <Etiqueta key={m} tono={m === 'tienda' ? 'info' : 'neutro'}>{METODO_INFO[m].corto}</Etiqueta>
      ))}
      {usados.length === 0 && <Etiqueta tono="neutro">sin método</Etiqueta>}
    </span>
  );
}
