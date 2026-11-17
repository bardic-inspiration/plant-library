/**
 * npm run validate — check config and every entry. Exits 1 on any error.
 * Flags: --quiet hides warnings; --json prints the report as JSON.
 */
import { formatReport, loadLibrary } from '../lib/library';

const args = new Set(process.argv.slice(2));
const { entries, report } = loadLibrary();

if (args.has('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const shown = args.has('--quiet') ? { ...report, warnings: [] } : report;
  const text = formatReport(shown);
  if (text) console.log(text);
  console.log(`\n${entries.length} entries: ${report.errors.length} errors, ${report.warnings.length} warnings`);
}
process.exit(report.errors.length ? 1 : 0);
