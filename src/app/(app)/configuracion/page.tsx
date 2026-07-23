import { configVigente } from '@/lib/config';
import Configuracion from './Configuracion';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const cfg = await configVigente();
  return <Configuracion inicial={cfg} />;
}
