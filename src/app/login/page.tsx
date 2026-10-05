'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/* ══════════════════════════════════════════════════════════════════════════
   El umbral

   La única pantalla de la app que se toma su tiempo. Entrar pasa una vez cada
   treinta días, y es el momento en que conviene que el sistema se presente:
   que se sienta que se enciende algo.

   Nada de esto retrasa el trabajo. El campo tiene el foco desde el primer
   frame: quien ya sabe su contraseña la teclea mientras el resto todavía se
   arma, y entra antes de que termine la animación. Si el adorno obligara a
   esperar, sería un adorno mal puesto.
   ══════════════════════════════════════════════════════════════════════════ */

/** Los renglones que se teclean, con cuándo entra cada uno. */
const ARRANQUE = [
  { texto: 'enlace establecido', espera: 620 },
  { texto: 'canal cifrado', espera: 900 },
  { texto: 'esperando credenciales', espera: 1180 },
];

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      // La pantalla se abre antes de navegar. Son 260 ms y compran la
      // sensación de que el sistema te dejó pasar, en vez de que la página
      // simplemente cambió.
      setEntrando(true);
      setTimeout(() => {
        router.push(params.get('destino') || '/');
        router.refresh();
      }, 260);
      return;
    }
    const { error } = await res.json().catch(() => ({ error: 'Error de conexión' }));
    setError(error ?? 'Contraseña incorrecta');
    setCargando(false);
  }

  return (
    <div className={`w-full max-w-sm transition-all duration-[420ms] ${
      entrando ? 'scale-[1.06] opacity-0 blur-md' : 'scale-100 opacity-100 blur-0'}`}
      style={{ transitionTimingFunction: 'var(--curva-salida)' }}>

      {/* ── La marca ── */}
      <div className="entra flex items-center gap-3" style={{ animationDuration: '620ms' }}>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-acento
          text-base font-bold text-surface-sunk">
          M
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-medium leading-tight tracking-tight">Envíos MAF</h1>
          <p className="cifra text-[11px] uppercase tracking-[0.18em] text-ink-mute">
            Sistema de operación
          </p>
        </div>
      </div>

      {/* Una regla que se traza sola: separa la identidad del arranque. */}
      <span aria-hidden className="mt-5 block h-px origin-left bg-gradient-to-r
        from-brand/60 via-white/[0.10] to-transparent"
        style={{ animation: 'trazar 700ms var(--curva-entrada) 380ms backwards' }} />

      {/* ── El arranque ── */}
      <ul aria-hidden className="mt-4 space-y-1.5">
        {ARRANQUE.map((l, i) => (
          <li key={l.texto} className="flex items-center gap-2">
            <span className="pulsa h-1 w-1 shrink-0 rounded-full bg-brand"
              style={{ animationDelay: `${l.espera}ms`, opacity: 0 }} />
            <span className="teclea cifra text-[10.5px] uppercase tracking-[0.16em] text-ink-mute"
              style={{
                '--letras': l.texto.length,
                '--dur': `${l.texto.length * 22}ms`,
                '--espera': `${l.espera}ms`,
              } as React.CSSProperties}>
              {l.texto}
            </span>
            {i === ARRANQUE.length - 1 && (
              <span className="cursor-vivo cifra text-[10.5px] text-brand"
                style={{ animationDelay: `${l.espera + l.texto.length * 22}ms` }}>▮</span>
            )}
          </li>
        ))}
      </ul>

      {/* ── La puerta ── */}
      <form onSubmit={entrar}
        className={`entra mt-7 ${error ? 'niega' : ''}`}
        style={{ animationDelay: error ? '0ms' : '1280ms' }}>
        <label htmlFor="password"
          className="cifra block text-[10.5px] uppercase tracking-[0.16em] text-ink-soft">
          Contraseña
        </label>
        <div className="group relative mt-2">
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            className="w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-3.5
              text-base text-ink outline-none transition-colors duration-200
              focus:border-brand/70 focus:bg-white/[0.05]"
          />
          {/* El filo que se enciende bajo el campo al enfocarlo. Es lo que
              convierte un borde que cambia de color en algo que responde. */}
          <span aria-hidden className="pointer-events-none absolute inset-x-3 -bottom-px h-px
            origin-center scale-x-0 bg-brand transition-transform duration-[320ms]
            group-focus-within:scale-x-100"
            style={{ transitionTimingFunction: 'var(--curva-entrada)' }} />
        </div>

        <p role="alert" aria-live="polite"
          className={`mt-2.5 min-h-[1.1rem] text-xs transition-opacity duration-200 ${
            error ? 'text-bad opacity-100' : 'opacity-0'}`}>
          {error ?? '·'}
        </p>

        <button type="submit" disabled={cargando || !password}
          className="pulsable group relative mt-2 w-full overflow-hidden rounded-xl bg-brand
            py-3.5 text-sm font-medium text-surface-sunk
            disabled:cursor-not-allowed disabled:opacity-35">
          {/* El brillo que cruza el botón al pasar el cursor. Un solo gesto,
              rápido, y solo cuando está habilitado. */}
          <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r
            from-transparent via-white/25 to-transparent transition-transform duration-[620ms]
            group-enabled:group-hover:translate-x-full"
            style={{ transitionTimingFunction: 'var(--curva-entrada)' }} />
          <span className="relative">{cargando ? 'Verificando…' : 'Entrar'}</span>
        </button>
      </form>

      {/* Mientras verifica, una línea recorre la pantalla. Ocupa el tiempo de
          la red con algo que se mira, en vez de con un botón apagado. */}
      {cargando && <span aria-hidden className="barrido" />}
    </div>
  );
}

export default function LoginPage() {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      {/* ── El marco ──
          Cuatro escuadras que se trazan hacia afuera desde cada esquina. No
          encierran nada: solo dicen que la pantalla es un instrumento y tiene
          orillas. Se dibujan al final, cuando lo de adentro ya se leyó. */}
      {montado && (
        <>
          <span aria-hidden className="escuadra escuadra-si" style={{ '--espera': '1500ms' } as React.CSSProperties} />
          <span aria-hidden className="escuadra escuadra-sd" style={{ '--espera': '1580ms' } as React.CSSProperties} />
          <span aria-hidden className="escuadra escuadra-ii" style={{ '--espera': '1660ms' } as React.CSSProperties} />
          <span aria-hidden className="escuadra escuadra-id" style={{ '--espera': '1740ms' } as React.CSSProperties} />
        </>
      )}

      {/* El halo detrás de la tarjeta: hace que la luz parezca venir de algo. */}
      <span aria-hidden
        className="pointer-events-none absolute h-[32rem] w-[32rem] rounded-full opacity-0"
        style={{
          background: 'radial-gradient(circle, rgba(20,160,143,0.12), transparent 65%)',
          animation: 'aparecer 1400ms var(--curva-entrada) 200ms forwards',
        }} />

      <Suspense fallback={null}>
        <Formulario />
      </Suspense>
    </main>
  );
}
