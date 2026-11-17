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

/** A card for any index record. Plants get the full plant card; other types a plain one. */
export function Card({ record, headingLevel = 3 }: { record: IndexRecord; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  if (record.type !== 'plant') {
    return (
      <article class="card">
        <div class="card-body">
          <H class="card-title">
            <a href={record.url}>{record.name}</a>
          </H>
          <p class="card-summary">{record.summary}</p>
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
      </div>
    </article>
  );
}
