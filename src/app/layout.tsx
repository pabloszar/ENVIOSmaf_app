import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'Envíos MAF',
  description: 'Gestión y rentabilidad de la unidad de negocio de fletes',
};

/**
 * Geist se sirve desde el propio dominio: sin llamadas a Google Fonts, así que
 * no se filtra quién usa la app ni se depende de una red ajena para que cargue.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
