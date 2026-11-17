import { Icon } from './Icon';
import type { IconName } from '../../lib/icons';
import { label } from '../../lib/vocab';

/** Sun and moisture as icons, each with its text label. */
export function Conditions({ sun, moisture }: { sun?: string[]; moisture?: string[] }) {
  const items = [...(sun ?? []).map((s) => ['sun', s] as const), ...(moisture ?? []).map((m) => ['moisture', m] as const)];
  if (!items.length) return null;
  return (
    <ul class="conditions" role="list">
      {items.map(([list, v]) => (
        <li>
          <Icon name={v as IconName} />
          {label(list, v)}
        </li>
      ))}
    </ul>
  );
}
