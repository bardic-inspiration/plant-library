/** npm run coverage — unsourced plant names, most used first, and everything resting on a non-commercial source or image. */
import { buildData } from '../lib/build-data';
import { coverage } from '../lib/coverage';

const c = coverage(buildData());
console.log('Unsourced plants (named as text in a plant list):');
if (!c.unsourced.length) console.log('  none');
for (const u of c.unsourced) console.log(`  ${u.name}: ${u.lists.length} lists, quantity ${u.quantity} (${u.lists.join(', ')})`);
console.log('\nNon-commercial dependencies (clear before commercial use):');
if (!c.nonCommercial.length) console.log('  none');
for (const n of c.nonCommercial) console.log(`  ${n.entry}: ${n.what}`);
if (process.argv.includes('--json')) console.log(JSON.stringify(c, null, 2));
