'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

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
      router.push(params.get('destino') || '/');
      router.refresh();
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Error de conexión' }));
      setError(error ?? 'Contraseña incorrecta');
      setCargando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="w-full max-w-sm space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Envíos MAF</h1>
        <p className="mt-1 text-sm text-ink-mute">Gestión y rentabilidad</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="etiqueta block">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="campo"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      <button type="submit" disabled={cargando || !password} className="boton w-full">
        {cargando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="tarjeta w-full max-w-sm">
        <Suspense fallback={null}>
          <Formulario />
        </Suspense>
      </div>
    </main>
  );
}
