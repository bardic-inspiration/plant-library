/**
 * A plant's cut sheet for the print view (spec: library.md, Exports): its
 * names, one image, its traits as plain text in the plant page's groups and
 * order, and its sources. Pure, so the print view and the tests agree.
 * Client-safe: no Node imports.
 */
import vocabJson from '../config/vocab.json' with { type: 'json' };
import sourcesJson from '../config/sources.json' with { type: 'json' };
import { renderCitation } from './citation';
import { formatMetric, formatMonths, formatRange } from './format';
import { fullName, nameSegments, type NameSegment } from './names';
import { formatZoneRange } from './zones';
import { url } from './site';
import type { PlantData, SourceDef, Vocab } from './types';

const defaultVocab = vocabJson as unknown as Vocab;
const defaultSources = sourcesJson as unknown as Record<string, SourceDef>;

/** The most cut sheets one print view shows; the rest are named by count, to narrow the selection (P10, D57). */
export const MAX_SHEETS = 100;

export interface CutSheet {
  key: string;
  name: string;
  parts: NameSegment[];
  commonNames: string[];
  family: string;
  summary?: string;
  image?: { src: string; alt: string; credit: string };
  groups: { title: string; rows: { label: string; text: string }[] }[];
  /** Each citation: the source's name, the rendered citation, its page, the trait paths it supports, and when it was read. */
  sources: { name: string; citation: string; url?: string; fields: string[]; accessed: string }[];
}

function labeller(vocab: Vocab) {
  const maps = new Map<string, Map<string, string>>();
  return (list: string, id: string) => {
    let m = maps.get(list);
    if (!m) maps.set(list, (m = new Map(((vocab[list] as { id: string; label: string }[]) ?? []).map((v) => [v.id, v.label]))));
    return m.get(id) ?? id;
  };
}

/**
 * The cut sheet of a plant entry, `key` being its `plant/<id>`. Its image is
 * the pinned one, else the first. A trait the entry leaves empty has no
 * row, and a group with no rows is left out.
 */
export function cutSheet(key: string, entry: { summary?: string; data: PlantData }, vocab: Vocab = defaultVocab, sources: Record<string, SourceDef> = defaultSources): CutSheet {
  const d = entry.data;
  const label = labeller(vocab);
  const list = (vocabList: string, ids?: string[]) => (ids ?? []).map((id) => label(vocabList, id)).join(', ');
  const range = (r: PlantData['height']) => (r ? `${formatRange(r)} (${formatMetric(r)})` : '');
  const native = d.nativeRange ? (d.nativeRange.states.length ? `Native to ${list('state', d.nativeRange.states)}` : 'Not native to Washington, Oregon, or California') : '';
  const groups = [
    {
      title: 'Size and habit',
      rows: [
        ['Form', label('form', d.form)],
        ['Life cycle', d.lifeCycle ? label('lifeCycle', d.lifeCycle) : ''],
        ['Foliage', d.foliage ? label('foliage', d.foliage) : ''],
        ['Height', range(d.height)],
        ['Spread', range(d.spread)],
        ['Growth rate', d.growthRate ? label('growthRate', d.growthRate) : ''],
      ],
    },
    {
      title: 'Site',
      rows: [
        ['Sun', list('sun', d.sun)],
        ['Moisture', list('moisture', d.moisture)],
        ['Soil texture', list('soilTexture', d.soil?.texture)],
        ['Soil drainage', list('soilDrainage', d.soil?.drainage)],
        ['Soil pH', d.soil?.ph ? formatRange(d.soil.ph, '') : ''],
        ['Hardiness', d.hardiness ? `USDA ${formatZoneRange(d.hardiness)}` : ''],
        ['Water use', d.waterUse ? label('waterUse', d.waterUse) : ''],
        ['Tolerates', list('tolerates', d.tolerates)],
      ],
    },
    {
      title: 'Seasonal interest',
      rows: [
        ['Bloom period', formatMonths(d.bloom?.months)],
        ['Bloom color', list('bloomColor', d.bloom?.colors)],
        ['Fall color', list('fallColor', d.fallColor)],
        ['Fruit', d.fruit ?? ''],
      ],
    },
    {
      title: 'Ecology',
      rows: [
        ['Native status', native],
        ['Wetland indicator', Object.entries(d.wetlandIndicator ?? {}).map(([r, v]) => `${label('wetlandRegion', r)}: ${label('wetlandRating', v)} (${v})`).join('; ')],
        ['Wildlife', list('wildlife', d.wildlife)],
      ],
    },
    { title: 'Uses', rows: [['Uses', list('uses', d.uses)]] },
  ]
    .map((g) => ({ title: g.title, rows: g.rows.filter(([, text]) => text).map(([l, text]) => ({ label: l, text })) }))
    .filter((g) => g.rows.length);
  const img = (d.images ?? []).find((i) => i.pinned) ?? d.images?.[0];
  const sheet: CutSheet = {
    key,
    name: fullName(d),
    parts: nameSegments(d),
    commonNames: d.commonNames,
    family: d.family,
    groups,
    sources: d.sources.map((c) => {
      const src = sources[c.source];
      const s = { name: src?.name ?? c.source, citation: src ? renderCitation(src, c) : c.source, fields: c.fields, accessed: c.accessed } as CutSheet['sources'][number];
      if (c.url) s.url = c.url;
      return s;
    }),
  };
  if (entry.summary) sheet.summary = entry.summary;
  if (img) sheet.image = { src: url(img.file), alt: img.alt, credit: `${img.credit}, ${label('license', img.license)}` };
  return sheet;
}
