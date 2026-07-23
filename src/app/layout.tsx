import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Envíos MAF',
  description: 'Gestión y rentabilidad de la unidad de negocio de fletes',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
