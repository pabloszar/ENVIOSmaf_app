import Navegacion from '@/components/Navegacion';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Navegacion />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
