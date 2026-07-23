export default function Proximamente({ titulo, descripcion, fase }: { titulo: string; descripcion: string; fase: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
      <div className="tarjeta max-w-xl">
        <span className="etiqueta">{fase}</span>
        <p className="mt-2 text-sm text-ink-soft">{descripcion}</p>
      </div>
    </div>
  );
}
