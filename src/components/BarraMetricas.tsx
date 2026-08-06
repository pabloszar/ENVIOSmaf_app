import Link from 'next/link';
import { db } from '@/lib/db';
import { mxn } from '@/lib/pricing';

/**
 * La barra de métricas vivas de las referencias, con los cuatro números que
 * un dueño quiere traer siempre a la vista: qué se mueve hoy, qué le deben,
 * qué debe y cómo va el margen. Cada chip lleva a su pantalla.
 *
 * Si una consulta falla —por ejemplo, porque falta correr una migración— el
 * chip se omite en vez de tumbar toda la app.
 */
export default async function BarraMetricas() {
  const sb = db();
  const hoy = new Date();
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const mesActual = fechaHoy.slice(0, 7);

  const [rutasHoy, cxc, coms, pnl] = await Promise.all([
    sb.from('rutas').select('id', { count: 'exact', head: true }).eq('fecha', fechaHoy),
    sb.from('v_cuentas_por_cobrar').select('saldo'),
    sb.from('v_comisiones_por_pagar').select('total_devengado'),
    sb.from('v_pnl_mensual').select('mes, margen_neto_pct').limit(24),
  ]);

  const saldo = (cxc.data ?? []).reduce((s, c: { saldo: number }) => s + Number(c.saldo), 0);
  const porPagar = (coms.data ?? [])
    .reduce((s, c: { total_devengado: number }) => s + Number(c.total_devengado), 0);
  const margen = (pnl.data ?? [])
    .find((m: { mes: string }) => String(m.mes).slice(0, 7) === mesActual)?.margen_neto_pct;

  const chips = [
    { href: '/rutas', etiqueta: 'Rutas hoy', valor: String(rutasHoy.count ?? 0), tono: 'ink' },
    { href: '/dinero', etiqueta: 'Por cobrar', valor: mxn(saldo), tono: saldo > 0 ? 'warn' : 'ink' },
    { href: '/dinero', etiqueta: 'Comisiones', valor: mxn(porPagar), tono: porPagar > 0 ? 'warn' : 'ink' },
    {
      href: '/', etiqueta: 'Margen del mes',
      valor: margen != null ? `${Number(margen).toFixed(1)}%` : '—',
      tono: margen == null ? 'ink' : Number(margen) < 0 ? 'bad' : Number(margen) < 15 ? 'warn' : 'good',
    },
  ];

  const color = { ink: 'text-ink', good: 'text-good', warn: 'text-warn', bad: 'text-bad' };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <Link key={c.etiqueta} href={c.href}
          className="flex items-center gap-2 rounded-full border border-white/[0.07]
            bg-white/[0.035] px-3 py-1.5 text-xs backdrop-blur transition hover:border-white/20">
          <span className="text-ink-mute">{c.etiqueta}</span>
          <span className={`cifra font-medium ${color[c.tono as keyof typeof color]}`}>{c.valor}</span>
        </Link>
      ))}
    </div>
  );
}
