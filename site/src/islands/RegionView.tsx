/**
 * What gets planted here (spec map.md, distribution analysis): for the
 * regions the query selects (picked on the map, or under the region facets
 * in the tree), the plants listed on every project in them, ranked, with the
 * taxa, the native share, and the mix by form, each with the projects behind
 * it, and the table as CSV. It reads site/public/analysis.json, fetched the
 * first time a region is selected (P10), and computes the figures with the
 * build's own functions (lib/analysis.ts, P3).
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { projectsIn, rankPlants, regionSummary, type RegionSummary } from '../../../lib/analysis';
import { ANALYSIS_FILE, regionFilterKeys, selectedRegions, type AnalysisFile } from '../../../lib/analysis-data';
import { fileName, recordPlant, regionCsv } from '../../../lib/export';
import { OVERLAYS } from '../../../lib/registry';
import { url } from '../../../lib/site';
import type { IndexRecord, LibraryIndex } from '../../../lib/types';
import { PlantName } from '../components/ui/PlantName';
import { download } from '../lib/download';
import { label } from '../lib/vocab';

const REGION_KEYS = regionFilterKeys(OVERLAYS);
/** Plants shown before *Show all*. */
const SHOWN = 20;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** The selected regions' names, from the index facets: "King County, WA; Oregon". */
function regionNames(index: LibraryIndex, filters: Record<string, string[]>): string[] {
  const out = new Set<string>();
  for (const k of REGION_KEYS) for (const id of filters[k] ?? []) out.add(index.facets.find((f) => f.key === k)?.values.find((v) => v.id === id)?.label ?? id);
  return [...out];
}

function useAnalysis(wanted: boolean): { file?: AnalysisFile; error?: string } {
  const [state, setState] = useState<{ file?: AnalysisFile; error?: string }>({});
  useEffect(() => {
    if (!wanted || state.file || state.error) return;
    fetch(url(ANALYSIS_FILE), { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`The analysis didn't load (${r.status}).`);
        return r.json() as Promise<AnalysisFile>;
      })
      .then((file) => setState({ file }))
      .catch((e: Error) => setState({ error: e.message }));
  }, [wanted]);
  return state;
}

function Figures({ s }: { s: RegionSummary }) {
  const forms = Object.entries(s.byForm).sort(([a, x], [b, y]) => y.quantity - x.quantity || a.localeCompare(b));
  return (
    <>
      <dl class="region-figures">
        <dt>Taxa</dt>
        <dd>
          {s.taxa.count} <span class="muted">(on {plural(s.taxa.projects, 'project')})</span>
        </dd>
        <dt>Not in the library</dt>
        <dd>
          {plural(s.unsourced.count, 'name')} <span class="muted">(on {plural(s.unsourced.projects, 'project')})</span>
        </dd>
        <dt>Native share</dt>
        <dd>
          {s.nativeShare ? (
            <>
              {Math.round(s.nativeShare.share * 100)}% <span class="muted">of {plural(s.nativeShare.quantity, 'plant')} with a known range, native to its project's state (on {plural(s.nativeShare.projects, 'project')})</span>
            </>
          ) : (
            'Unknown'
          )}
        </dd>
        <dt>Total quantity</dt>
        <dd>{s.quantity.toLocaleString('en-US')}</dd>
      </dl>
      {forms.length > 0 && (
        <div class="table-scroll">
          <table class="region-forms">
            <caption class="label">Mix by form</caption>
            <thead>
              <tr>
                <th scope="col">Form</th>
                <th scope="col">Quantity</th>
                <th scope="col">Projects</th>
              </tr>
            </thead>
            <tbody>
              {forms.map(([f, v]) => (
                <tr key={f}>
                  <th scope="row">{f === 'unknown' ? 'Unknown (not in the library)' : label('form', f)}</th>
                  <td>{v.quantity.toLocaleString('en-US')}</td>
                  <td>{v.projects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function RegionView({ index, filters }: { index: LibraryIndex; filters: Record<string, string[]> }) {
  const any = REGION_KEYS.some((k) => (filters[k] ?? []).length > 0);
  const { file, error } = useAnalysis(any);
  const [by, setBy] = useState<'projects' | 'quantity'>('projects');
  const [all, setAll] = useState(false);
  const records = useMemo(() => new Map(index.records.map((r) => [r.key, r] as const)), [index]);
  const summary = useMemo(() => {
    if (!file || !any) return undefined;
    const projects = projectsIn(file.projects, selectedRegions(file.regions, filters));
    return regionSummary(projects, new Map(Object.entries(file.plants)));
  }, [file, any, JSON.stringify(filters)]);
  const names = regionNames(index, filters);

  if (!any) {
    return (
      <section class="region-view" aria-labelledby="region-heading">
        <h2 id="region-heading">What gets planted here</h2>
        <p class="map-results-note">Pick regions on the map (switch on a region layer and click a region), or choose them under Location or Used in among the filters, to see what is planted on the projects in them.</p>
      </section>
    );
  }

  const ranked = summary ? rankPlants(summary.plants, by) : [];
  const rows = ranked.map((p) => {
    const r: IndexRecord | undefined = records.get(p.plant);
    const named = r ? recordPlant(r) : { botanicalName: p.plant };
    return { ...p, record: r, botanicalName: named.botanicalName, commonName: named.commonName, form: r ? label('form', String(r.card.form ?? '')) : undefined };
  });
  const shown = all ? rows : rows.slice(0, SHOWN);

  return (
    <section class="region-view" aria-labelledby="region-heading">
      <h2 id="region-heading">What gets planted here</h2>
      <p class="region-names">{names.join('; ')}</p>
      {error && <p class="map-results-note">{error}</p>}
      {!summary && !error && (
        <p class="map-results-note" aria-live="polite">
          Loading the figures…
        </p>
      )}
      {summary && (
        <>
          <p class="region-sample">
            From {plural(summary.projects, 'project')} in {names.length === 1 ? 'this region' : 'these regions'}, whatever the other filters. The library reflects the projects entered, not the region's planting as a whole.
          </p>
          {summary.projects === 0 ? (
            <p class="map-results-note">No project in the library is in {names.length === 1 ? 'this region' : 'these regions'} yet.</p>
          ) : (
            <>
              <Figures s={summary} />
              <div class="region-plants-head">
                <label class="sort">
                  <span class="label">Rank by</span>
                  <select value={by} onChange={(e) => setBy((e.target as HTMLSelectElement).value as 'projects' | 'quantity')}>
                    <option value="projects">Projects</option>
                    <option value="quantity">Quantity</option>
                  </select>
                </label>
                <button
                  type="button"
                  class="link-button"
                  onClick={() => download(regionCsv(rows), fileName(`planted-in-${names.join('-')}`, 'csv'), 'text/csv;charset=utf-8')}
                  disabled={rows.length === 0}
                >
                  Download as CSV
                </button>
              </div>
              {rows.length === 0 ? (
                <p class="map-results-note">The projects here list no plant the library holds.</p>
              ) : (
                <div class="table-scroll">
                  <table class="region-plants">
                    <caption class="label">Plants, by {by}</caption>
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Plant</th>
                        <th scope="col">Projects</th>
                        <th scope="col">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((p, i) => (
                        <tr key={p.plant}>
                          <td>{i + 1}</td>
                          <th scope="row">
                            {p.record ? (
                              <a href={p.record.url}>
                                <PlantName parts={p.record.nameParts} fallback={p.record.name} />
                              </a>
                            ) : (
                              p.botanicalName
                            )}
                            {p.commonName && <span class="muted"> {p.commonName}</span>}
                          </th>
                          <td>{p.projects}</td>
                          <td>{p.quantity.toLocaleString('en-US')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {rows.length > SHOWN && (
                <button type="button" class="link-button" onClick={() => setAll((a) => !a)}>
                  {all ? `Show the first ${SHOWN}` : `Show all ${rows.length}`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
