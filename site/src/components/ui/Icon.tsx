import { ICONS, type IconName } from '../../lib/icons';

/** A decorative inline icon. Its meaning is always carried by text beside it. */
export function Icon({ name }: { name: IconName }) {
  return <span class="icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}
