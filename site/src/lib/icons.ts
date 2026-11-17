/** The few Lucide icons the site uses (ISC), inlined as SVG text. */
import sun from 'lucide-static/icons/sun.svg?raw';
import cloudSun from 'lucide-static/icons/cloud-sun.svg?raw';
import cloud from 'lucide-static/icons/cloud.svg?raw';
import dropletOff from 'lucide-static/icons/droplet-off.svg?raw';
import droplet from 'lucide-static/icons/droplet.svg?raw';
import droplets from 'lucide-static/icons/droplets.svg?raw';
import search from 'lucide-static/icons/search.svg?raw';
import filter from 'lucide-static/icons/sliders-horizontal.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';
import plus from 'lucide-static/icons/plus.svg?raw';
import externalLink from 'lucide-static/icons/external-link.svg?raw';
import chevronDown from 'lucide-static/icons/chevron-down.svg?raw';

const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\s*class="[^"]*"/, '').replace(/\s+/g, ' ').trim();

export const ICONS = {
  'full-sun': strip(sun),
  'part-shade': strip(cloudSun),
  shade: strip(cloud),
  dry: strip(dropletOff),
  moist: strip(droplet),
  wet: strip(droplets),
  search: strip(search),
  filter: strip(filter),
  close: strip(x),
  add: strip(plus),
  external: strip(externalLink),
  expand: strip(chevronDown),
} as const;

export type IconName = keyof typeof ICONS;
