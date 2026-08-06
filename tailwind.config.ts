import type { Config } from 'tailwindcss';

/**
 * Sistema de diseño — Envíos MAF (F3.5)
 *
 * Dirección: oscuro operativo. La jerarquía se construye con elevación
 * (fondo hundido → tarjeta → elemento levantado), no con bordes gruesos.
 *
 * Regla del acento: el lima marca lo ACTIVO —la sección en la que estás, el
 * filtro encendido, el dato seleccionado— y nada más. Si el lima aparece más
 * de tres veces en una pantalla, deja de significar algo.
 *
 * Los colores de dato (brand y dato-alt) están validados para daltonismo
 * sobre el fondo #141416: separación CVD ΔE 13.3, visión normal 26.8.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Texto. mute cumple 5.4:1 sobre la tarjeta; soft, 7.2:1.
        ink: {
          DEFAULT: '#f4f4f5',
          soft: '#a1a1aa',
          mute: '#8b8b95',
        },
        // Superficies, de abajo hacia arriba.
        surface: {
          sunk: '#0b0b0c',      // fondo de la app
          DEFAULT: '#141416',   // tarjeta
          raised: '#1c1c20',    // input, hover, fila seleccionada
          line: '#26262b',      // borde
        },
        // Identidad MAF, ahora legible sobre negro.
        brand: {
          DEFAULT: '#14a08f',
          soft: '#0f2b28',
        },
        // El acento: solo para lo activo.
        acento: {
          DEFAULT: '#d7f000',
          soft: '#232a00',
        },
        // Segunda serie de dato (utilidad en las gráficas).
        dato: '#d95926',
        // Estados. Reservados: nunca se usan como color de serie.
        good: '#3ecf8e',
        warn: '#e8b046',
        bad: '#f26d6d',
      },
      borderRadius: {
        // Las referencias usan esquinas generosas: tarjetas suaves, controles pill.
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        panel: '0 24px 48px -12px rgba(0, 0, 0, 0.7)',
        // El vidrio necesita un filo de luz arriba para leerse como material.
        vidrio: 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 1px 2px 0 rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
