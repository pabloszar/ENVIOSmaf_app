'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Quien { id: string; nombre: string }

/**
 * Entrar a la app del chofer.
 *
 * Se elige el nombre de una lista en vez de teclearlo: son seis personas, y
 * escribir "Cuauhtemoc" sin acento ni error, de pie junto a la camioneta, es
 * pedir demasiado. La lista es pública —quién maneja para MAF no es secreto—
 * y no sirve para entrar: sin el PIN no se pasa.
 *
 * El teclado es de dígitos grandes y no un `<input>` a secas. Con un teclado
 * de sistema encima, la pantalla de un teléfono se queda en un tercio y ya no
 * se ve ni a quién se eligió; y con guantes o con las manos sucias, un campo
 * de texto de 16 px no se atina.
 */
export default function EntrarChofer() {
  const router = useRouter();
  const [choferes, setChoferes] = useState<Quien[] | null>(null);
  const [quien, setQuien] = useState<Quien | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    fetch('/api/auth/chofer')
      .then((r) => r.json())
      .then((r) => (r.error ? setError(r.error) : setChoferes(r.data ?? [])))
      .catch(() => setError('No se pudo cargar la lista. Revisa tu señal.'));
  }, []);

  async function entrar(clave: string) {
    if (!quien || entrando) return;
    setEntrando(true);
    setError(null);

    const res = await fetch('/api/auth/chofer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacto_id: quien.id, pin: clave }),
    });

    if (res.ok) {
      router.push('/chofer');
      router.refresh();
      return;
    }
    const { error } = await res.json().catch(() => ({ error: 'Error de conexión' }));
    setError(error ?? 'Nombre o PIN incorrecto');
    setPin('');
    setEntrando(false);
  }

  function teclear(d: string) {
    if (entrando) return;
    setError(null);
    const nuevo = (pin + d).slice(0, 8);
    setPin(nuevo);
    // Seis es el largo que se reparte; a los seis se intenta solo, para no
    // pedir un "Entrar" de más al que ya tecleó completo.
    if (nuevo.length === 6) entrar(nuevo);
  }

  // ── Elegir quién eres ──
  if (!quien) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-6 py-10">
        <h1 className="text-2xl font-medium tracking-tight">¿Quién maneja hoy?</h1>
        <p className="mt-1.5 text-sm text-ink-mute">Toca tu nombre.</p>

        {error && <p role="alert" className="mt-5 text-sm text-bad">{error}</p>}

        {choferes === null && !error && (
          <p className="mt-6 text-sm text-ink-mute">Cargando…</p>
        )}
        {choferes?.length === 0 && (
          <p className="mt-6 text-sm leading-relaxed text-ink-mute">
            Todavía no hay ningún chofer con PIN. Pídele al administrador que te
            ponga uno desde Contactos.
          </p>
        )}

        <ul className="mt-7 space-y-2.5">
          {(choferes ?? []).map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { setQuien(c); setPin(''); setError(null); }}
                className="lamina flex w-full items-center gap-3 px-5 py-4 text-left
                  text-lg transition active:border-brand">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full
                  bg-brand/25 text-base font-medium text-brand">
                  {c.nombre.trim()[0]?.toUpperCase()}
                </span>
                {c.nombre}
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  // ── Tu PIN ──
  return (
    <main className="flex min-h-dvh flex-col px-6 py-8">
      <button type="button" onClick={() => { setQuien(null); setPin(''); setError(null); }}
        className="self-start text-sm text-ink-mute transition active:text-ink">
        ← Cambiar de nombre
      </button>

      <div className="mt-8">
        <h1 className="text-2xl font-medium tracking-tight">Hola, {quien.nombre}</h1>
        <p className="mt-1.5 text-sm text-ink-mute">Teclea tu PIN.</p>
      </div>

      {/* Puntos y no los dígitos: la pantalla se ve desde atrás. */}
      <div aria-hidden className="mt-8 flex justify-center gap-3">
        {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => (
          <span key={i} className={`h-3.5 w-3.5 rounded-full transition ${
            i < pin.length ? 'bg-ink' : 'bg-white/[0.14]'}`} />
        ))}
      </div>

      <p role="alert" aria-live="polite"
        className={`mt-5 min-h-[1.25rem] text-center text-sm ${error ? 'text-bad' : 'text-ink-mute'}`}>
        {error ?? (entrando ? 'Entrando…' : '')}
      </p>

      <div className="mt-auto grid grid-cols-3 gap-3 pt-6">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Tecla key={d} onClick={() => teclear(d)}>{d}</Tecla>
        ))}
        <Tecla onClick={() => setPin('')} tenue>Borrar</Tecla>
        <Tecla onClick={() => teclear('0')}>0</Tecla>
        <Tecla onClick={() => entrar(pin)} tenue={pin.length < 4}>Entrar</Tecla>
      </div>
    </main>
  );
}

/** Alta de sobra para el pulgar: 64 px es el mínimo que no se falla en marcha. */
function Tecla({ onClick, tenue, children }: {
  onClick: () => void; tenue?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`lamina flex h-16 items-center justify-center rounded-2xl text-xl
        transition active:bg-white/[0.10] ${tenue ? 'text-sm text-ink-mute' : 'cifra text-ink'}`}>
      {children}
    </button>
  );
}
