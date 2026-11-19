/**
 * The print view (`/print/`, spec: library.md, Exports): a plant list as a
 * schedule, or plant cut sheets for the workspace's list, named plants, or
 * the Library's filtered results. What to print comes from the query string:
 *
 * - `?list=…` (a share link's list): its schedule; with `sheets=1`, the cut
 *   sheets of the plants on it.
 * - `?plants=plant/a,plant/b`: those plants' cut sheets (a plant page).
 * - `?sheets=1&…` with the Library's query: the cut sheets of its results'
 *   plants, in its order.
 *
 * Cut sheets fetch the plants' full entries (P10), at most `MAX_SHEETS`.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ScheduleLine } from '../../../lib/build-data';
import { cutSheet, MAX_SHEETS, type CutSheet } from '../../../lib/cutsheet';
import { PRINT_PLANTS, PRINT_SHEETS } from '../../../lib/export';
import { applyQuery, parseQuery, sortOptions, sortRecords } from '../../../lib/filter';
import { decodeList, SHARE_PARAM, type WorkspaceList } from '../../../lib/workspace';
import { url } from '../../../lib/site';
import { TYPES } from '../../../lib/registry';
import type { IndexRecord, LibraryIndex, PlantData } from '../../../lib/types';
import { Schedule } from '../components/ui/Schedule';
import { PlantName } from '../components/ui/PlantName';
import { labels } from '../lib/vocab';
import { traitLabel } from '../lib/traits';
import { buildSearch } from '../lib/search';
import './print.css';

const SORTS = sortOptions(TYPES);
const KEY = /^plant\/[a-z0-9]+(-[a-z0-9]+)*$/;
const number = new Intl.NumberFormat('en-US');

type Request = { kind: 'schedule'; list: WorkspaceList } | { kind: 'sheets'; title: string; keys?: string[]; list?: WorkspaceList; search?: string } | { kind: 'none'; reason?: string };

/** What the query string asks to print. */
export function readRequest(search: string): Request {
  const p = new URLSearchParams(search);
  const sheets = p.has(PRINT_SHEETS);
  const shared = p.get(SHARE_PARAM);
  if (shared) {
    const list = decodeList(shared);
    if (!list) return { kind: 'none', reason: "The list in this link couldn't be read." };
    return sheets ? { kind: 'sheets', title: `Cut sheets: ${list.name}`, list } : { kind: 'schedule', list };
  }
  const plants = p.get(PRINT_PLANTS);
  if (plants) return { kind: 'sheets', title: 'Cut sheets', keys: [...new Set(plants.split(',').filter((k) => KEY.test(k)))] };
  if (sheets) return { kind: 'sheets', title: 'Cut sheets: Library results', search };
  return { kind: 'none' };
}

function useIndex(): { index?: LibraryIndex; error?: string } {
  const [state, setState] = useState<{ index?: LibraryIndex; error?: string }>({});
  useEffect(() => {
    fetch(url('library.json'), { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`The library index didn't load (${r.status}).`);
        return r.json() as Promise<LibraryIndex>;
      })
      .then((index) => setState({ index }))
      .catch((e: Error) => setState({ error: e.message }));
  }, []);
  return state;
}

function PrintButton() {
  return (
    <p class="print-actions">
      <button type="button" class="add-button" onClick={() => print()}>
        Print
      </button>
    </p>
  );
}

/** A list's schedule, from the index's records (forms and common names are on the cards). */
function SchedulePrint({ list, index }: { list: WorkspaceList; index: LibraryIndex }) {
  const byKey = useMemo(() => new Map(index.records.map((r) => [r.key, r])), [index]);
  const lines: ScheduleLine[] = list.lines.map((item) => {
    const k = typeof item.plant === 'string' ? undefined : item.plant.ref;
    const r = k ? byKey.get(k) : undefined;
    const text = typeof item.plant === 'string' ? item.plant : (k ?? '');
    if (!r || r.type !== 'plant') return { item, text };
    const common = typeof r.card.commonName === 'string' ? [r.card.commonName] : [];
    return { item, text, plant: { form: r.card.form, commonNames: common } as unknown as PlantData, parts: r.nameParts, url: r.url };
  });
  const site = list.site;
  const conditions = [
    site.sun && `Sun: ${labels('sun', site.sun)}`,
    site.moisture && `Moisture: ${labels('moisture', site.moisture)}`,
    site.soil?.drainage && `Soil drainage: ${labels('soilDrainage', site.soil.drainage)}`,
    site.hardinessZone && `Hardiness zone ${site.hardinessZone}`,
  ].filter(Boolean);
  const total = list.lines.reduce((n, l) => n + (l.quantity ?? 0), 0);
  return (
    <article class="print-schedule">
      <h1>{list.name}</h1>
      <p class="print-meta">
        Plant schedule, {list.lines.length} {list.lines.length === 1 ? 'line' : 'lines'}
        {total > 0 && `, ${number.format(total)} plants`}.{conditions.length > 0 && ` ${conditions.join('; ')}.`}
      </p>
      <PrintButton />
      <Schedule lines={lines} empty="The list has no plants." />
    </article>
  );
}

/** One plant's cut sheet. */
function Sheet({ s }: { s: CutSheet }) {
  return (
    <section class="cut-sheet" aria-labelledby={`sheet-${s.key.replace('/', '-')}`}>
      <header class="cut-sheet-head">
        <p class="label">
          {s.family} · {s.groups[0]?.rows[0]?.text}
        </p>
        <h2 id={`sheet-${s.key.replace('/', '-')}`}>
          <PlantName parts={s.parts} fallback={s.name} />
        </h2>
        <p class="cut-sheet-common">{s.commonNames.join(', ')}</p>
        {s.summary && <p>{s.summary}</p>}
      </header>
      <div class="cut-sheet-body">
        {s.image && (
          <figure class="cut-sheet-image">
            <img src={s.image.src} alt={s.image.alt} />
            <figcaption>{s.image.credit}</figcaption>
          </figure>
        )}
        <div class="cut-sheet-traits">
          {s.groups.length === 0 && <p>No traits are sourced yet.</p>}
          {s.groups.map((g) => (
            <table class="traits">
              <caption>{g.title}</caption>
              <tbody>
                {g.rows.map((r) => (
                  <tr>
                    <th scope="row">{r.label}</th>
                    <td>{r.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
      <h3>Sources</h3>
      <ul class="cut-sheet-sources">
        {s.sources.map((c) => (
          <li>
            {c.citation} Supports: {c.fields.map(traitLabel).join(', ')}. Accessed {c.accessed}.{c.url && <> {c.url}</>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The plants a cut-sheet request names, by key, in order: a list's refs, named plants, or the Library's results. */
function sheetKeys(req: Extract<Request, { kind: 'sheets' }>, index: LibraryIndex): string[] {
  const plants = new Set(index.records.filter((r) => r.type === 'plant').map((r) => r.key));
  if (req.keys) return req.keys.filter((k) => plants.has(k));
  if (req.list) return [...new Set(req.list.lines.flatMap((l) => (typeof l.plant === 'string' ? [] : [l.plant.ref])))].filter((k) => plants.has(k));
  const query = parseQuery(req.search ?? '');
  const hits = query.q.trim() ? buildSearch(index).search(query.q.trim()).map((h) => String(h.id)) : null;
  const sortId = query.sort === 'relevance' && !hits ? 'name' : query.sort;
  return sortRecords(applyQuery(index.records, query, hits), sortId, SORTS, hits)
    .filter((r: IndexRecord) => r.type === 'plant')
    .map((r) => r.key);
}

function SheetsPrint({ req, index }: { req: Extract<Request, { kind: 'sheets' }>; index: LibraryIndex }) {
  const all = useMemo(() => sheetKeys(req, index), [req, index]);
  const keys = all.slice(0, MAX_SHEETS);
  const [sheets, setSheets] = useState<(CutSheet | null)[] | undefined>(undefined);
  useEffect(() => {
    let live = true;
    Promise.all(
      keys.map((k) =>
        fetch(url(`data/${k}.json`))
          .then((r) => (r.ok ? (r.json() as Promise<{ summary?: string; data: PlantData }>) : null))
          .then((e) => (e ? cutSheet(k, e) : null))
          .catch(() => null),
      ),
    ).then((s) => live && setSheets(s));
    return () => {
      live = false;
    };
  }, [keys.join(',')]);
  const missing = sheets?.filter((s) => s === null).length ?? 0;
  return (
    <article class="print-sheets">
      <h1>{req.title}</h1>
      <p class="print-meta">
        {all.length === 0
          ? 'No plants to print.'
          : all.length > keys.length
            ? `The first ${keys.length} of ${number.format(all.length)} plants; narrow the filters or the list to print the rest.`
            : `${keys.length} ${keys.length === 1 ? 'plant' : 'plants'}.`}
        {req.list && req.list.lines.some((l) => typeof l.plant === 'string') && ' Names not in the library have no cut sheet.'}
      </p>
      {keys.length > 0 && !sheets && <p aria-live="polite">Loading the cut sheets…</p>}
      {sheets && (
        <>
          <PrintButton />
          {missing > 0 && <p class="ws-note">{missing} {missing === 1 ? 'plant' : 'plants'} didn't load and are left out.</p>}
          {sheets.map((s) => s && <Sheet s={s} />)}
        </>
      )}
    </article>
  );
}

export default function Print() {
  const { index, error } = useIndex();
  const req = useMemo(() => readRequest(location.search), []);
  useEffect(() => {
    const fallback = document.getElementById('print-fallback');
    if (fallback) fallback.hidden = true;
  }, []);
  if (error) return <p class="ws-note">{error}</p>;
  if (req.kind === 'none')
    return (
      <>
        <h1>Print</h1>
        <p>
          {req.reason ? `${req.reason} ` : ''}This page prints a plant schedule or plant cut sheets. Open it from a project or palette page (Print schedule), a plant page (Print cut sheet), the{' '}
          <a href={url('workspace/')}>Workspace</a>, or the <a href={url()}>Library</a>'s results.
        </p>
      </>
    );
  if (!index) return <p aria-live="polite">Loading…</p>;
  return req.kind === 'schedule' ? <SchedulePrint list={req.list} index={index} /> : <SheetsPrint req={req} index={index} />;
}
