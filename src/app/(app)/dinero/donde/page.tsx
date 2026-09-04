import { cargarDinero } from '../datos';
import Marco from '../Marco';
import Donde from './Donde';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const datos = await cargarDinero();
  return (
    <div className="space-y-5">
      <Marco datos={datos} activa="/dinero/donde" />
      <Donde datos={datos} />
    </div>
  );
}
