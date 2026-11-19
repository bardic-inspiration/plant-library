/** The Library's search over the index, shared by the Library island and the workspace. */
import MiniSearch from 'minisearch';
import type { IndexRecord, LibraryIndex } from '../../../lib/types';

/** MiniSearch over the records' search fields: prefix and light fuzzy matching, all terms required, names boosted. */
export function buildSearch(index: LibraryIndex): MiniSearch<IndexRecord> {
  const fields = [...index.searchFields.boosted, ...index.searchFields.fields];
  const ms = new MiniSearch<IndexRecord>({
    idField: 'key',
    fields,
    extractField: (doc, field) => (field === 'key' ? doc.key : doc.search[field] ?? ''),
    searchOptions: {
      boost: Object.fromEntries(index.searchFields.boosted.map((f) => [f, 3])),
      prefix: true,
      fuzzy: 0.15,
      combineWith: 'AND',
    },
  });
  ms.addAll(index.records);
  return ms;
}
