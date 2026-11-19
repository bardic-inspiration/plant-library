import type { Compatibility, CompatSite } from '../../../../lib/compat';
import { AXIS_LABELS, AXIS_VOCAB, conflictPlants, describeAxis, gridColumns, siteValues, type ValueLabel } from '../../../../lib/compat-text';
import { PlantName } from './PlantName';
import { label } from '../../lib/vocab';

export interface CompatPlant {
  name: string;
  parts?: [string, 'i' | 'r' | 't'][];
  url: string;
}

const valueLabel: ValueLabel = (axis, v) => (AXIS_VOCAB[axis] ? label(AXIS_VOCAB[axis]!, v) : v);
const FIT_TEXT = { pass: 'Suits', fail: 'Not suited', unknown: 'Unknown' } as const;

/**
 * The compatibility panel: per axis, a plant-by-value grid with the shared
 * columns and the site's marked in words, unknowns written out, conflicting
 * plants tagged, and sentences naming the conflict and each tied
 * alternative, so color is never the only signal. Static: the pages render
 * it at build, and the workspace can render it from the same result.
 */
export function CompatPanel({ compat, plants, site, idPrefix = 'compat' }: { compat: Compatibility; plants: ReadonlyMap<string, CompatPlant>; site?: CompatSite; idPrefix?: string }) {
  const nameOf = (k: string) => plants.get(k)?.name ?? k;
  if (!compat.plants.length) return <p>No plant on the list is in the library, so there is nothing to compare.</p>;
  return (
    <div class="compat">
      <p class="compat-note">
        Whether the plants on the list share growing conditions{site ? ', and how each suits the site' : ''}. A plant with no data on a condition is unknown there, never a conflict;
        names not in the library are left out.
      </p>
      {compat.axes.map((r) => {
        const cols = gridColumns(r, site);
        const shared = new Set(r.shared ?? []);
        const wanted = new Set(siteValues(r.axis, site) ?? []);
        const odd = conflictPlants(r);
        const id = `${idPrefix}-${r.axis}`;
        const status = r.shared === null ? 'unknown' : r.shared.length ? 'shared' : 'conflict';
        // A Site column only where the site states the axis; a grid only where some plant has data.
        const fit = wanted.size > 0 ? r.siteFit : undefined;
        return (
          <section class="compat-axis" data-status={status} aria-labelledby={id}>
            <h3 id={id}>
              {AXIS_LABELS[r.axis]}
              <span class="compat-status">{status === 'unknown' ? 'No data' : status === 'shared' ? 'Shared' : 'Conflict'}</span>
            </h3>
            {describeAxis(r, nameOf, valueLabel, site).map((t) => (
              <p class="compat-text">{t}</p>
            ))}
            {status !== 'unknown' && cols.length > 0 && (
              <div class="table-scroll" role="region" aria-label={`${AXIS_LABELS[r.axis]} grid`} tabindex={0}>
                <table class="compat-grid">
                  <thead>
                    <tr>
                      <th scope="col">Plant</th>
                      {cols.map((v) => (
                        <th scope="col" class={shared.has(v) ? 'is-shared' : undefined}>
                          {valueLabel(r.axis, v)}
                          {shared.has(v) && <span class="compat-tag">shared</span>}
                          {wanted.has(v) && <span class="compat-tag">site</span>}
                        </th>
                      ))}
                      {fit && <th scope="col">Site</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {r.plants.map((p) => {
                      const plant = plants.get(p.key);
                      return (
                        <tr class={odd.has(p.key) ? 'is-conflict' : undefined}>
                          <th scope="row">
                            {plant ? (
                              <a href={plant.url}>
                                <PlantName parts={plant.parts} fallback={plant.name} />
                              </a>
                            ) : (
                              p.key
                            )}
                            {odd.has(p.key) && <span class="compat-tag">conflict</span>}
                          </th>
                          {p.accepts === null ? (
                            <td colSpan={cols.length} class="compat-unknown">
                              No data
                            </td>
                          ) : (
                            cols.map((v) =>
                              p.accepts!.includes(v) ? (
                                <td class={shared.has(v) ? 'on is-shared' : 'on'}>
                                  <span aria-hidden="true">●</span>
                                  <span class="visually-hidden">Yes</span>
                                </td>
                              ) : (
                                <td class={shared.has(v) ? 'is-shared' : undefined}>
                                  <span class="visually-hidden">No</span>
                                </td>
                              ),
                            )
                          )}
                          {fit && <td class={`fit-${fit[p.key]}`}>{FIT_TEXT[fit[p.key]]}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
