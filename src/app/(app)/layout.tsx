import Navegacion from '@/components/Navegacion';
import BarraMetricas from '@/components/BarraMetricas';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Navegacion />
      <div className="pl-16">
        {/* Las métricas vivas viajan con el scroll: siempre a la vista. */}
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-surface-sunk/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-3">
            <BarraMetricas />
            <span className="hidden text-xs text-ink-mute sm:block">Envíos MAF</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
