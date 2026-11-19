import type { ComponentChildren } from 'preact';
import type { IndexRecord, Range, ZoneRange } from '../../../../lib/types';
import { formatRange } from '../../../../lib/format';
import { formatZoneRange } from '../../../../lib/zones';
import { PlantName } from './PlantName';
import { FormBadge } from './Badge';
import { Conditions } from './Conditions';
import { BloomStrip } from './BloomStrip';
import { label } from '../../lib/vocab';

interface PlantCardData {
  commonName: string;
  form: string;
  height?: Range;
  spread?: Range;
  sun?: string[];
  moisture?: string[];
  hardiness?: ZoneRange;
  bloomMonths?: number[];
  bloomColors?: string[];
  nativeStatus?: string;
}

interface ProjectCardData {
  place: string;
  projectType: string;
  status: string;
  completed?: string;
  sizeAcres: number;
  plantCount: number;
}

interface PaletteCardData {
  plantCount: number;
  place?: string;
  sun?: string[];
  moisture?: string[];
  drainage?: string[];
  hardinessZone?: string;
}

/** A palette's site conditions as text: "Part shade or shade; dry; well-drained; zone 8b". */
export function siteText(c: { sun?: string[]; moisture?: string[]; drainage?: string[]; hardinessZone?: string }): string {
  const or = (list: string, vals?: string[]) => (vals?.length ? vals.map((v, i) => (i ? label(list, v).toLowerCase() : label(list, v))).join(' or ') : undefined);
  const parts = [or('sun', c.sun), or('moisture', c.moisture), or('soilDrainage', c.drainage), c.hardinessZone && `zone ${c.hardinessZone}`].filter((x): x is string => Boolean(x));
  return parts.map((p, i) => (i ? p.charAt(0).toLowerCase() + p.slice(1) : p)).join('; ');
}

/** A card for any index record. Plants get the full plant card; other types a plain one. `action` (the island's "add to list") goes last in the card. */
export function Card({ record, headingLevel = 3, action }: { record: IndexRecord; headingLevel?: 2 | 3; action?: ComponentChildren }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  if (record.type === 'project') {
    const c = record.card as unknown as ProjectCardData;
    const facts = [label('projectType', c.projectType), label('projectStatus', c.status), c.completed, `${c.sizeAcres} acres`, `${c.plantCount} ${c.plantCount === 1 ? 'plant' : 'plants'}`];
    return (
      <article class="card" data-type="project">
        <div class="card-body">
          <H class="card-title">
            <a href={record.url}>{record.name}</a>
          </H>
          <p class="card-common">{c.place}</p>
          <dl class="card-facts">
            {[
              ['Type', facts[0]],
              ['Status', facts[1]],
              ...(c.completed ? [['Completed', facts[2]]] : []),
              ['Size', facts[3]],
              ['Plants', facts[4]],
            ].map(([k, v]) => (
              <div>
                <dt class="visually-hidden">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {action}
        </div>
      </article>
    );
  }
  if (record.type === 'palette') {
    const c = record.card as unknown as PaletteCardData;
    // Sun and moisture show as icons, as on a plant card; drainage and a stated zone as text.
    const soil = siteText({ drainage: c.drainage, hardinessZone: c.hardinessZone });
    const none = !c.sun?.length && !c.moisture?.length && !soil;
    return (
      <article class="card" data-type="palette">
        <div class="card-body">
          <H class="card-title">
            <a href={record.url}>{record.name}</a>
          </H>
          <p class="card-common">{c.place ? `Palette, ${c.place}` : 'Palette'}</p>
          <dl class="card-facts">
            <div>
              <dt class="visually-hidden">Plants</dt>
              <dd>{`${c.plantCount} ${c.plantCount === 1 ? 'plant' : 'plants'}`}</dd>
            </div>
            {(soil || none) && (
              <div>
                <dt class="visually-hidden">Site conditions</dt>
                <dd>{soil || 'No site conditions'}</dd>
              </div>
            )}
          </dl>
          <Conditions sun={c.sun} moisture={c.moisture} />
          {action}
        </div>
      </article>
    );
  }
  if (record.type !== 'plant') {
    return (
      <article class="card">
        <div class="card-body">
          <H class="card-title">
            <a href={record.url}>{record.name}</a>
          </H>
          <p class="card-summary">{record.summary}</p>
          {action}
        </div>
      </article>
    );
  }
  const c = record.card as unknown as PlantCardData;
  const size = [c.height && `${formatRange(c.height)} tall`, c.spread && `${formatRange(c.spread)} wide`].filter(Boolean).join(', ');
  const bloomLabel = c.bloomMonths?.length
    ? `Blooms ${c.bloomMonths.map((m) => label('month', String(m))).join(', ')}${c.bloomColors?.length ? `, ${c.bloomColors.map((x) => label('bloomColor', x).toLowerCase()).join(' and ')}` : ''}`
    : '';
  return (
    <article class="card" data-form={c.form}>
      {record.thumb && <img class="card-image" src={record.thumb.src} alt={record.thumb.alt} loading="lazy" decoding="async" />}
      <div class="card-body">
        <H class="card-title">
          <a href={record.url}>
            <PlantName parts={record.nameParts} fallback={record.name} />
          </a>
        </H>
        <p class="card-common">{c.commonName}</p>
        <p class="card-badges">
          <FormBadge form={c.form} />
          {c.nativeStatus === 'native' && <span class="badge badge-plain">Native</span>}
        </p>
        <dl class="card-facts">
          {size && (
            <div>
              <dt class="visually-hidden">Size</dt>
              <dd>{size}</dd>
            </div>
          )}
          {c.hardiness && (
            <div>
              <dt class="visually-hidden">Hardiness</dt>
              <dd>{formatZoneRange(c.hardiness)}</dd>
            </div>
          )}
        </dl>
        <Conditions sun={c.sun} moisture={c.moisture} />
        {bloomLabel && <BloomStrip months={c.bloomMonths} colors={c.bloomColors} label={bloomLabel} />}
        {action}
      </div>
    </article>
  );
}
