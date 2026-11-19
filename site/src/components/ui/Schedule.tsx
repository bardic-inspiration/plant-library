import type { ScheduleLine } from '../../../../lib/build-data';
import { PlantName } from './PlantName';
import { label, vocabList } from '../../lib/vocab';

const number = new Intl.NumberFormat('en-US');

/**
 * A plant list as a schedule: one table per form in vocabulary order, names
 * the library doesn't hold last under "Not in the library", each group in
 * list order. The quantity column shows when any line has a quantity (a
 * project's always do), and the size, spacing, and note columns when any
 * line has one.
 */
export function Schedule({ lines, empty, quantity = lines.some((l) => l.item.quantity !== undefined) }: { lines: ScheduleLine[]; empty: string; quantity?: boolean }) {
  if (!lines.length) return <p>{empty}</p>;
  const groups = [
    ...vocabList('form').map((f) => ({ id: f.id, title: label('form', f.id), lines: lines.filter((l) => l.plant?.form === f.id) })),
    { id: 'unsourced', title: 'Not in the library', lines: lines.filter((l) => !l.plant) },
  ].filter((g) => g.lines.length);
  const hasCol = (k: 'size' | 'spacing' | 'note') => lines.some((l) => l.item[k]);
  return (
    <>
      {groups.map((g) => (
        <div class="schedule-group">
          <h3>{g.title}</h3>
          <div class="table-scroll" role="region" aria-label={`${g.title} schedule`} tabindex={0}>
            <table class="schedule">
              <thead>
                <tr>
                  <th scope="col">Botanical name</th>
                  <th scope="col">Common name</th>
                  {quantity && <th scope="col" class="num">Quantity</th>}
                  {hasCol('size') && <th scope="col">Size</th>}
                  {hasCol('spacing') && <th scope="col">Spacing</th>}
                  {hasCol('note') && <th scope="col">Note</th>}
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => (
                  <tr>
                    <th scope="row">
                      {l.url ? (
                        <a href={l.url}>
                          <PlantName parts={l.parts} fallback={l.text} />
                        </a>
                      ) : (
                        l.text
                      )}
                    </th>
                    <td>{l.plant?.commonNames[0]}</td>
                    {quantity && <td class="num">{l.item.quantity === undefined ? '' : number.format(l.item.quantity)}</td>}
                    {hasCol('size') && <td>{l.item.size}</td>}
                    {hasCol('spacing') && <td>{l.item.spacing}</td>}
                    {hasCol('note') && <td>{l.item.note}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
