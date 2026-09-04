import { cargarDinero } from '../datos';
import Marco from '../Marco';
import Entra from './Entra';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const datos = await cargarDinero();
  return (
    <div className="space-y-5">
      <Marco datos={datos} activa="/dinero/entra" />
      <Entra datos={datos} />
    </div>
  );
}
