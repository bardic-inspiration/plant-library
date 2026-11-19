/**
 * The compare page (`/compare/`, spec map.md, distribution analysis): two
 * plants, or two regions, side by side on the same measures, each figure
 * with the projects behind it. What is compared lives in the query string
 * (`?plants=plant/a,plant/b` or `?regions=state:WA,county:53033`, lib/compare.ts).
 * It reads the index for names and site/public/analysis.json for the
 * figures, which it computes with the build's own functions (P3).
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ANALYSIS_FILE, type AnalysisFile } from '../../../lib/analysis-data';
import type { UseFigure } from '../../../lib/analysis';
import { comparePlants, compareRegions, comparisonSearch, parseRegion, readComparison, regionParam, type Comparison, type Paired, type RegionRef } from '../../../lib/compare';
import { mapUrl } from '../../../lib/filter';
import { url } from '../../../lib/site';
import type { IndexRecord, LibraryIndex } from '../../../lib/types';
import { PlantName } from '../components/ui/PlantName';
import { label } from '../lib/vocab';
import './compare.css';

const number = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, one: string, many = `${one}s`) => `${number(n)} ${n === 1 ? one : many}`;
/** Plants in each region's top list. */
const TOP = 10;

function useJson<T>(file: string, what: string): { data?: T; error?: string } {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    fetch(url(file), { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`The ${what} didn't load (${r.status}).`);
        return r.json() as Promise<T>;
      })
      .then((data) => setState({ data }))
      .catch((e: Error) => setState({ error: e.message }));
  }, []);
  return state;
}

/** A region the page can offer: its level, id, and name from the index facets. */
interface RegionOption extends RegionRef {
  name: string;
  group: string;
}

/** The regions holding at least one project, by level as the overlays list them, each named by its facet value. */
function regionOptions(file: AnalysisFile, index: LibraryIndex): RegionOption[] {
  const out: RegionOption[] = [];
  for (const r of file.regions) {
    const ids = [...new Set(file.projects.flatMap((p) => (p.geo[r.level] ? [p.geo[r.level]!] : [])))];
    const values = r.keys.flatMap((k) => index.facets.find((f) => f.key === k)?.values ?? []);
    const name = (id: string) => values.find((v) => v.id === id)?.label ?? id;
    out.push(...ids.map((id) => ({ level: r.level, id, name: name(id), group: r.label })).sort((a, b) => a.name.localeCompare(b.name)));
  }
  return out;
}

/** A figure with its sample size: "12 plants on 3 projects". */
function Fig({ f }: { f: UseFigure }) {
  if (f.projects === 0) return <span class="muted">None</span>;
  return (
    <>
      {plural(f.quantity, 'plant')} <span class="muted">on {plural(f.projects, 'project')}</span>
    </>
  );
}

function Side({ children }: { children: ComponentChildren }) {
  return <td>{children}</td>;
}

/** A side-by-side table: one column per side, the measure in the first. */
function Table({ caption, heads, first = 'Measure', children }: { caption: string; heads: [ComponentChildren, ComponentChildren]; first?: string; children: ComponentChildren }) {
  return (
    <div class="table-scroll" role="region" aria-label={caption} tabindex={0}>
      <table class="compare-table">
        <caption class="label">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{first}</th>
            <th scope="col">{heads[0]}</th>
            <th scope="col">{heads[1]}</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function PairedRows({ rows, name }: { rows: Paired[]; name: (id: string) => string }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.id}>
          <th scope="row">{name(r.id)}</th>
          <Side>
            <Fig f={r.a} />
          </Side>
          <Side>
            <Fig f={r.b} />
          </Side>
        </tr>
      ))}
    </>
  );
}

function PlantLabel({ record, plantKey }: { record?: IndexRecord; plantKey: string }) {
  if (!record) return <>{plantKey.replace(/^plant\//, '')}</>;
  return (
    <a href={record.url}>
      <PlantName parts={record.nameParts} fallback={record.name} />
    </a>
  );
}

/** The names of states, counties, and ecoregions as the index's facets give them. */
function useRegionName(index: LibraryIndex) {
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const f of index.facets) if (/^project\.(state|county|ecoregion|hardinessZone)$/.test(f.key)) for (const v of f.values) names.set(`${f.key.slice(8)}:${v.id}`, v.label);
    return (level: string, id: string) => names.get(`${level}:${id}`) ?? (level === 'state' ? label('state', id) : id);
  }, [index]);
}

function PlantsCompared({ keys, file, index }: { keys: [string, string]; file: AnalysisFile; index: LibraryIndex }) {
  const records = useMemo(() => new Map(index.records.map((r) => [r.key, r] as const)), [index]);
  const regionName = useRegionName(index);
  const c = useMemo(() => comparePlants(keys[0], keys[1], file.projects, new Map(Object.entries(file.plants))), [keys[0], keys[1], file]);
  const heads: [ComponentChildren, ComponentChildren] = [<PlantLabel plantKey={keys[0]} record={records.get(keys[0])} />, <PlantLabel plantKey={keys[1]} record={records.get(keys[1])} />];
  const range = (k: string) => {
    const states = file.plants[k]?.nativeRange?.states;
    return states ? (states.length ? states.map((s) => label('state', s)).join(', ') : 'None of the three states') : 'Unknown';
  };
  const outside = (k: string, s: string[]) => (!file.plants[k]?.nativeRange ? 'Unknown' : s.length ? s.map((x) => label('state', x)).join(', ') : <span class="muted">None</span>);
  return (
    <>
      <p class="compare-sample">
        From {plural(c.a.projects, 'project')} listing the first and {plural(c.b.projects, 'project')} listing the second; {plural(c.both, 'project lists', 'projects list')} both. The library reflects the projects entered, not the region's planting as a whole.
      </p>
      <Table caption="Use" heads={heads}>
        <tr>
          <th scope="row">Projects</th>
          <Side>{number(c.a.projects)}</Side>
          <Side>{number(c.b.projects)}</Side>
        </tr>
        <tr>
          <th scope="row">Total quantity</th>
          <Side>
            <Fig f={c.a} />
          </Side>
          <Side>
            <Fig f={c.b} />
          </Side>
        </tr>
        <tr>
          <th scope="row">Native range</th>
          <Side>{range(keys[0])}</Side>
          <Side>{range(keys[1])}</Side>
        </tr>
        <tr>
          <th scope="row">Used outside its native range</th>
          <Side>{outside(keys[0], c.a.outsideNativeRange)}</Side>
          <Side>{outside(keys[1], c.b.outsideNativeRange)}</Side>
        </tr>
      </Table>
      {c.byState.length > 0 && (
        <Table caption="By state" heads={heads}>
          <PairedRows rows={c.byState} name={(id) => label('state', id)} />
        </Table>
      )}
      {c.byEcoregion.length > 0 && (
        <Table caption="By ecoregion" heads={heads}>
          <PairedRows rows={c.byEcoregion} name={(id) => regionName('ecoregion', id)} />
        </Table>
      )}
      {c.byCounty.length > 0 && (
        <Table caption="By county" heads={heads}>
          <PairedRows rows={c.byCounty} name={(id) => regionName('county', id)} />
        </Table>
      )}
      {(c.byYear.length > 0 || c.a.undated.projects + c.b.undated.projects > 0) && (
        <Table caption="By completion year" heads={heads}>
          <PairedRows rows={c.byYear} name={(id) => id} />
          {c.a.undated.projects + c.b.undated.projects > 0 && (
            <tr>
              <th scope="row">No completion date</th>
              <Side>
                <Fig f={c.a.undated} />
              </Side>
              <Side>
                <Fig f={c.b.undated} />
              </Side>
            </tr>
          )}
        </Table>
      )}
    </>
  );
}

function RegionsCompared({ sides, file, index }: { sides: [RegionRef, RegionRef]; file: AnalysisFile; index: LibraryIndex }) {
  const records = useMemo(() => new Map(index.records.map((r) => [r.key, r] as const)), [index]);
  const regionName = useRegionName(index);
  const [a, b] = sides;
  const c = useMemo(() => compareRegions(a, b, file.projects, new Map(Object.entries(file.plants))), [regionParam(a), regionParam(b), file]);
  const keyOf = (r: RegionRef) => file.regions.find((x) => x.level === r.level)?.keys[0];
  const head = (r: RegionRef) => {
    const k = keyOf(r);
    const name = regionName(r.level, r.id);
    return k ? <a href={mapUrl({ [k]: [r.id] })}>{name}</a> : name;
  };
  const heads: [ComponentChildren, ComponentChildren] = [head(a), head(b)];
  const share = (s: typeof c.a) =>
    s.nativeShare ? (
      <>
        {Math.round(s.nativeShare.share * 100)}% <span class="muted">of {plural(s.nativeShare.quantity, 'plant')} with a known range, on {plural(s.nativeShare.projects, 'project')}</span>
      </>
    ) : (
      'Unknown'
    );
  const count = (n: { count: number; projects: number }, one: string, many?: string) => (
    <>
      {plural(n.count, one, many)} <span class="muted">on {plural(n.projects, 'project')}</span>
    </>
  );
  const plantName = (k: string) => <PlantLabel plantKey={k} record={records.get(k)} />;
  const top = (s: typeof c.a) => s.plants.slice(0, TOP);
  const ranks = Math.max(top(c.a).length, top(c.b).length);
  return (
    <>
      <p class="compare-sample">
        From {plural(c.a.projects, 'project')} in the first and {plural(c.b.projects, 'project')} in the second
        {c.overlap > 0 ? `; ${plural(c.overlap, 'project is', 'projects are')} in both` : ''}. The library reflects the projects entered, not the region's planting as a whole.
      </p>
      <Table caption="What gets planted" heads={heads}>
        <tr>
          <th scope="row">Projects</th>
          <Side>{number(c.a.projects)}</Side>
          <Side>{number(c.b.projects)}</Side>
        </tr>
        <tr>
          <th scope="row">Taxa</th>
          <Side>{count(c.a.taxa, 'taxon', 'taxa')}</Side>
          <Side>{count(c.b.taxa, 'taxon', 'taxa')}</Side>
        </tr>
        <tr>
          <th scope="row">Not in the library</th>
          <Side>{count(c.a.unsourced, 'name')}</Side>
          <Side>{count(c.b.unsourced, 'name')}</Side>
        </tr>
        <tr>
          <th scope="row">Native share</th>
          <Side>{share(c.a)}</Side>
          <Side>{share(c.b)}</Side>
        </tr>
        <tr>
          <th scope="row">Total quantity</th>
          <Side>{number(c.a.quantity)}</Side>
          <Side>{number(c.b.quantity)}</Side>
        </tr>
      </Table>
      {c.byForm.length > 0 && (
        <Table caption="Mix by form" heads={heads}>
          <PairedRows rows={c.byForm} name={(f) => (f === 'unknown' ? 'Unknown (not in the library)' : label('form', f))} />
        </Table>
      )}
      {ranks > 0 && (
        <Table caption={`Most planted, by projects (the first ${TOP})`} heads={heads} first="Rank">
          {Array.from({ length: ranks }, (_, i) => (
            <tr key={i}>
              <th scope="row">{i + 1}</th>
              {[c.a, c.b].map((s) => {
                const p = s.plants[i];
                return <Side>{p ? <>{plantName(p.plant)} <span class="muted">on {plural(p.projects, 'project')}</span></> : ''}</Side>;
              })}
            </tr>
          ))}
        </Table>
      )}
      <h2 class="compare-shared-heading">Planted in both</h2>
      {c.shared.length === 0 ? (
        <p>No plant is listed in both yet.</p>
      ) : (
        <Table caption={`${plural(c.shared.length, 'plant')} listed in both`} heads={heads} first="Plant">
          {c.shared.map((p) => (
            <tr key={p.plant}>
              <th scope="row">{plantName(p.plant)}</th>
              <Side>
                <Fig f={p.a} />
              </Side>
              <Side>
                <Fig f={p.b} />
              </Side>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

export default function Compare() {
  const { data: index, error: indexError } = useJson<LibraryIndex>('library.json', 'library index');
  const { data: file, error: fileError } = useJson<AnalysisFile>(ANALYSIS_FILE, 'analysis');
  const [c, setC] = useState<Comparison>(() => readComparison(location.search));
  useEffect(() => {
    const fallback = document.getElementById('compare-fallback');
    if (fallback) fallback.hidden = true;
  }, []);
  useEffect(() => {
    history.replaceState(null, '', comparisonSearch(c));
  }, [c]);
  const error = indexError ?? fileError;

  const plantOptions = useMemo(() => {
    if (!index || !file) return [];
    const used = new Set(file.projects.flatMap((p) => p.data.plantList.flatMap((i) => (typeof i.plant === 'string' ? [] : [i.plant.ref]))));
    return index.records.filter((r) => r.type === 'plant' && used.has(r.key)).sort((a, b) => a.name.localeCompare(b.name));
  }, [index, file]);
  const regions = useMemo(() => (index && file ? regionOptions(file, index) : []), [index, file]);
  const groups = [...new Set(regions.map((r) => r.group))];

  const setKind = (kind: Comparison['kind']) => setC({ kind, sides: [undefined, undefined] } as Comparison);
  const setSide = (i: 0 | 1, v: string) => {
    if (c.kind === 'plants') {
      const sides: [string | undefined, string | undefined] = [...c.sides];
      sides[i] = v || undefined;
      setC({ kind: 'plants', sides });
    } else {
      const sides: [RegionRef | undefined, RegionRef | undefined] = [...c.sides];
      sides[i] = v ? parseRegion(v) : undefined;
      setC({ kind: 'regions', sides });
    }
  };
  const ordinal = ['First', 'Second'] as const;

  return (
    <div class="compare">
      <fieldset class="compare-kind">
        <legend class="label">Compare</legend>
        {(['plants', 'regions'] as const).map((k) => (
          <label key={k}>
            <input type="radio" name="compare-kind" value={k} checked={c.kind === k} onChange={() => setKind(k)} /> Two {k}
          </label>
        ))}
      </fieldset>
      {error && <p class="compare-note">{error}</p>}
      {!error && (!index || !file) && (
        <p class="compare-note" aria-live="polite">
          Loading the figures…
        </p>
      )}
      {index && file && (
        <>
          <div class="compare-pickers">
            {([0, 1] as const).map((i) => (
              <label key={`${c.kind}-${i}`}>
                <span class="label">
                  {ordinal[i]} {c.kind === 'plants' ? 'plant' : 'region'}
                </span>
                {c.kind === 'plants' ? (
                  <select value={c.sides[i] ?? ''} onChange={(e) => setSide(i, (e.target as HTMLSelectElement).value)}>
                    <option value="">Choose a plant</option>
                    {c.sides[i] && !plantOptions.some((r) => r.key === c.sides[i]) && <option value={c.sides[i]}>{c.sides[i]!.replace(/^plant\//, '')} (on no project)</option>}
                    {plantOptions.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select value={c.sides[i] ? regionParam(c.sides[i]!) : ''} onChange={(e) => setSide(i, (e.target as HTMLSelectElement).value)}>
                    <option value="">Choose a region</option>
                    {c.sides[i] && !regions.some((r) => regionParam(r) === regionParam(c.sides[i]!)) && <option value={regionParam(c.sides[i]!)}>{c.sides[i]!.id} (no project)</option>}
                    {groups.map((g) => (
                      <optgroup key={g} label={g}>
                        {regions
                          .filter((r) => r.group === g)
                          .map((r) => (
                            <option key={regionParam(r)} value={regionParam(r)}>
                              {r.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </label>
            ))}
          </div>
          {c.sides[0] && c.sides[1] ? (
            <section class="compare-results" aria-label="Comparison">
              {c.kind === 'plants' ? (
                <PlantsCompared keys={[c.sides[0], c.sides[1]]} file={file} index={index} />
              ) : (
                <RegionsCompared sides={[c.sides[0], c.sides[1]]} file={file} index={index} />
              )}
            </section>
          ) : (
            <p class="compare-note">
              Choose two {c.kind === 'plants' ? 'plants listed on projects' : 'regions with projects'} to see their figures side by side.
            </p>
          )}
        </>
      )}
    </div>
  );
}
