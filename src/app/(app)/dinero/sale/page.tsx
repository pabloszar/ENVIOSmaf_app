import { cargarDinero } from '../datos';
import Marco from '../Marco';
import Sale from './Sale';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const datos = await cargarDinero();
  return (
    <div className="space-y-5">
      <Marco datos={datos} activa="/dinero/sale" />
      <Sale datos={datos} />
    </div>
  );
}
