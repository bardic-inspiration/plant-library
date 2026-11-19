/**
 * The contribution forms (`/contribute/`; spec: submissions.md, Forms). One
 * island, routed by the URL: `?form=add&type=<type>`, `?form=edit|photo|note&target=<type>/<id>`,
 * and no `form` for the hub and My submissions. An entry's fields come from
 * its schema, computed at build (lib/form.ts); an edit opens filled with
 * the published entry and files only the differences, each with its basis.
 * Forms are lenient: only what makes a submission unusable blocks it.
 * Drafts and the person's name and role stay in the browser; a sent
 * submission goes to this browser's store (sent-store.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  BASES,
  NOTE_TYPES,
  PHOTO_TYPES,
  RIGHTS,
  buildSubmission,
  contributeUrl,
  linesFromPaste,
  safeFileName,
  submissionProblems,
  type ChangeInput,
  type FieldNoteInput,
  type FileMeta,
  type Rights,
  type Submission,
  type SubmissionKind,
  type Submitter,
} from '../../../lib/contribute';
import { fieldWarnings, flatFields, getPath, prune, setPath, traitOptions, type Field } from '../../../lib/form';
import { editDifferences, entryHash, type Basis } from '../../../lib/submission';
import { sniff, type FileRole, type Sniffed } from '../../../lib/sniff';
import { recordNameIndex } from '../../../lib/export';
import { decodeList, SHARE_PARAM } from '../../../lib/workspace';
import { normalizeName } from '../../../lib/names';
import { entryUrl, url } from '../../../lib/site';
import type { LibraryIndex, PlantListItem } from '../../../lib/types';
import { vocabList } from '../lib/vocab';
import { list as listSent, put as putSent, type Sent } from '../lib/sent-store';
import './contribute.css';

export interface TypeModel {
  type: string;
  label: string;
  fields: Field[];
}

interface Props {
  types: TypeModel[];
  noteFields: Field[];
  maxBytes: Record<FileRole, number>;
  fixturesOnly: boolean;
}

type Obj = Record<string, unknown>;

interface Route {
  form?: 'add' | 'edit' | 'photo' | 'note';
  type?: string;
  target?: string;
  /** Add plant: the name to start from (an unsourced name on a project page). */
  name?: string;
  /** Submit palette: the workspace list, as its share link encodes it. */
  list?: string;
}

const SUBMITTER_KEY = 'plant-library:submitter';
const DRAFT_PREFIX = 'plant-library:draft:';

function readRoute(): Route {
  const q = new URLSearchParams(location.search);
  const form = q.get('form');
  return {
    form: form === 'add' || form === 'edit' || form === 'photo' || form === 'note' ? form : undefined,
    type: q.get('type') ?? undefined,
    target: q.get('target') ?? undefined,
    name: q.get('name') ?? undefined,
    list: q.get(SHARE_PARAM) ?? undefined,
  };
}

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** The index, loaded once, for pickers and plant names. */
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

export default function Contribute(props: Props) {
  const [route, setRoute] = useState<Route>(() => readRoute());
  const { index, error } = useIndex();
  useEffect(() => {
    document.getElementById('contribute-fallback')?.remove();
    const pop = () => setRoute(readRoute());
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  const go = (r: Route) => {
    history.pushState(null, '', contributeUrl({ form: r.form, type: r.type, target: r.target, name: r.name, [SHARE_PARAM]: r.list }));
    setRoute(r);
    scrollTo(0, 0);
  };
  return (
    <div class="contribute">
      {error && <p class="c-alert" role="alert">{error}</p>}
      {route.form ? <FormPage {...props} route={route} index={index} go={go} /> : <Hub types={props.types} go={go} />}
    </div>
  );
}

/** Contribute's front page: the forms, and what this browser has sent. */
function Hub({ types, go }: { types: TypeModel[]; go: (r: Route) => void }) {
  const link = (r: Route, text: string, help: string) => (
    <li>
      <a
        href={contributeUrl({ form: r.form, type: r.type })}
        onClick={(e) => {
          e.preventDefault();
          go(r);
        }}
      >
        {text}
      </a>
      <p>{help}</p>
    </li>
  );
  return (
    <>
      <h1>Contribute</h1>
      <p class="c-intro">
        Add what you know. A form doesn't change the library: it files a submission, which is checked for licensing and
        quality and enters the library through a pull request that a person reviews.
      </p>
      <h2>Forms</h2>
      <ul class="c-forms" role="list">
        {types.map((t) => link({ form: 'add', type: t.type }, addTitle(t), addHelp(t.type)))}
        {link({ form: 'photo' }, 'Add photo', 'A photo of a plant or a project, with what licensing needs.')}
        {link({ form: 'edit' }, 'Suggest an edit', 'Correct or add to an entry; each change says what it is based on.')}
        {link({ form: 'note' }, 'Add field note', 'Your professional opinion of how a plant performs, kept beside the published facts.')}
      </ul>
      <MySubmissions types={types} />
    </>
  );
}

const addTitle = (t: { type: string; label: string }) => (t.type === 'palette' ? 'Submit palette' : `Add ${t.label.toLowerCase()}`);
const addHelp = (type: string) =>
  type === 'plant'
    ? 'A plant the library lacks.'
    : type === 'project'
      ? 'A project and its plant list: picked, pasted, or attached as a file.'
      : type === 'palette'
        ? 'A plant list for a condition or a design; start one in the workspace.'
        : 'A new entry.';

const KIND_LABELS: Record<SubmissionKind, string> = { add: 'New entry', edit: 'Edit', photo: 'Photos', note: 'Field note' };

/** What this browser has sent, newest first. */
function MySubmissions({ types }: { types: TypeModel[] }) {
  const [sent, setSent] = useState<Sent[] | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    listSent()
      .then(setSent)
      .catch(() => setFailed(true));
  }, []);
  const typeLabel = (t: string) => types.find((x) => x.type === t)?.label ?? t;
  return (
    <section aria-labelledby="mine-heading" id="mine">
      <h2 id="mine-heading">My submissions</h2>
      {failed ? (
        <p>This browser doesn't allow keeping submissions, so none are listed.</p>
      ) : !sent ? (
        <p>Loading…</p>
      ) : !sent.length ? (
        <p>Nothing sent from this browser yet.</p>
      ) : (
        <div class="table-scroll" role="region" aria-label="My submissions" tabindex={0}>
          <table class="c-table">
            <thead>
              <tr>
                <th scope="col">Sent</th>
                <th scope="col">Kind</th>
                <th scope="col">About</th>
                <th scope="col" class="num">Files</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {sent.map((s) => {
                const sub = s.submission;
                const [type, id] = sub.target.split('/');
                return (
                  <tr>
                    <td>
                      <time dateTime={sub.submittedAt}>{new Date(sub.submittedAt).toLocaleString()}</time>
                    </td>
                    <td>{KIND_LABELS[sub.kind]}</td>
                    <td>{id ? <a href={entryUrl(sub.target)}>{sub.target}</a> : `A new ${typeLabel(type).toLowerCase()}`}</td>
                    <td class="num">{sub.files?.length ?? 0}</td>
                    <td>Not yet checked</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface FileItem {
  key: string;
  file: File;
  meta: FileMeta;
  sniffed?: Sniffed;
}

interface Draft {
  savedAt?: string;
  basedOn?: string;
  entry?: Obj;
  basis?: Basis | '';
  sourceUrl?: string;
  citation?: string;
  /** Per changed path: its basis and note. */
  changeMeta?: Record<string, { basis?: Basis | ''; note?: string; sourceUrl?: string; citation?: string }>;
  notes?: FieldNoteInput[];
  comment?: string;
}

/** The form for a route: picks a target first when the form needs one. */
function FormPage({ types, noteFields, maxBytes, fixturesOnly, route, index, go }: Props & { route: Route; index?: LibraryIndex; go: (r: Route) => void }) {
  const { form } = route;
  const type = form === 'add' ? route.type : route.target?.split('/')[0];
  const model = types.find((t) => t.type === type);
  const allowed = form === 'photo' ? PHOTO_TYPES : form === 'note' ? NOTE_TYPES : types.map((t) => t.type);
  const title = form === 'add' ? (model ? addTitle(model) : 'Add an entry') : form === 'edit' ? 'Suggest an edit' : form === 'photo' ? 'Add photo' : 'Add field note';
  const back = (
    <p class="c-back">
      <a
        href={contributeUrl()}
        onClick={(e) => {
          e.preventDefault();
          go({});
        }}
      >
        All forms
      </a>
    </p>
  );
  if (form === 'add' && !model) {
    return (
      <>
        {back}
        <h1>{title}</h1>
        <p>Choose what kind of entry to add:</p>
        <ul class="c-forms" role="list">
          {types.map((t) => (
            <li>
              <a href={contributeUrl({ form: 'add', type: t.type })}>{addTitle(t)}</a>
            </li>
          ))}
        </ul>
      </>
    );
  }
  const targetOk = form === 'add' || (route.target && type && allowed.includes(type) && route.target.includes('/'));
  if (!targetOk) {
    return (
      <>
        {back}
        <h1>{title}</h1>
        <TargetPicker index={index} types={allowed} typeLabel={(t) => types.find((x) => x.type === t)?.label ?? t} onPick={(target) => go({ ...route, target })} />
      </>
    );
  }
  return (
    <>
      {back}
      <EntryForm key={`${form}:${route.target ?? type}`} route={route} model={model!} title={title} index={index} noteFields={noteFields} maxBytes={maxBytes} fixturesOnly={fixturesOnly} />
    </>
  );
}

function TargetPicker({ index, types, typeLabel, onPick }: { index?: LibraryIndex; types: string[]; typeLabel: (t: string) => string; onPick: (target: string) => void }) {
  const [text, setText] = useState('');
  const [miss, setMiss] = useState(false);
  const records = useMemo(() => (index?.records ?? []).filter((r) => types.includes(r.type)), [index, types]);
  const what = types.map((t) => typeLabel(t).toLowerCase()).join(' or ');
  const pick = (e: Event) => {
    e.preventDefault();
    const want = normalizeName(text);
    const r = records.find((x) => normalizeName(x.name) === want || x.key === text.trim());
    if (r) onPick(r.key);
    else setMiss(true);
  };
  return (
    <form class="c-picker" onSubmit={pick}>
      <label class="c-field">
        <span>Which {what}?</span>
        <input
          type="text"
          list="c-targets"
          value={text}
          autocomplete="off"
          aria-describedby={miss ? 'c-target-miss' : undefined}
          onInput={(e) => {
            setText((e.currentTarget as HTMLInputElement).value);
            setMiss(false);
          }}
        />
      </label>
      <datalist id="c-targets">
        {records.map((r) => (
          <option value={r.name} />
        ))}
      </datalist>
      <button type="submit" class="c-button" disabled={!index}>
        Continue
      </button>
      {miss && (
        <p id="c-target-miss" class="c-warn" role="alert">
          No {what} in the library has that name. Pick one from the suggestions.
        </p>
      )}
    </form>
  );
}

/** The published entry an edit opens with, and the hash of its bytes (basedOn). */
function useEntry(target: string | undefined): { entry?: Obj; hash?: string; error?: string } {
  const [state, setState] = useState<{ entry?: Obj; hash?: string; error?: string }>({});
  useEffect(() => {
    if (!target) return;
    fetch(url(`data/${target}.json`), { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`${target} didn't load (${r.status}).`);
        return r.json() as Promise<Obj>;
      })
      .then(async (entry) => setState({ entry, hash: await entryHash(entry) }))
      .catch((e: Error) => setState({ error: e.message }));
  }, [target]);
  return state;
}

function EntryForm({ route, model, title, index, noteFields, maxBytes, fixturesOnly }: { route: Route; model: TypeModel; title: string; index?: LibraryIndex; noteFields: Field[]; maxBytes: Record<FileRole, number>; fixturesOnly: boolean }) {
  const form = route.form!;
  const kind: SubmissionKind = form;
  const target = form === 'add' ? model.type : route.target!;
  const draftKey = `${DRAFT_PREFIX}${form}:${target}`;
  const loaded = useEntry(form === 'add' ? undefined : target);
  const record = index?.records.find((r) => r.key === target);

  const [submitter, setSubmitter] = useState<Partial<Submitter>>(() => readJson<Submitter>(SUBMITTER_KEY) ?? {});
  const [draft, setDraft] = useState<Draft>(() => readJson<Draft>(draftKey) ?? {});
  const [restored, setRestored] = useState(() => readJson<Draft>(draftKey)?.savedAt);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [shown, setShown] = useState<{ blocking: string[]; warnings: string[] } | undefined>();
  const [sent, setSent] = useState<Submission | undefined>();
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  // A new entry starts from the route: a name for a plant, the workspace's list for a palette.
  useEffect(() => {
    if (form !== 'add' || draft.entry) return;
    let entry: Obj = {};
    if (route.list) {
      const list = decodeList(route.list);
      if (list) {
        entry = { name: list.name, data: { plantList: list.lines, ...(Object.keys(list.site).length ? { site: list.site } : {}) } };
      }
    }
    if (route.name && model.type === 'plant') {
      const [genus, species] = route.name.trim().split(/\s+/);
      entry = setPath(entry, 'data.genus', genus);
      if (species && /^[a-z]+(-[a-z]+)?$/.test(species)) entry = setPath(entry, 'data.species', species);
    }
    setDraft((d) => ({ ...d, entry, basis: d.basis ?? (model.type === 'plant' ? '' : 'observation') }));
  }, []);

  // An edit starts from the published entry, unless a draft of the same version is kept.
  useEffect(() => {
    if (form !== 'edit' || !loaded.entry) return;
    setDraft((d) => (d.entry && d.basedOn === loaded.hash ? d : { ...d, entry: structuredClone(loaded.entry), basedOn: loaded.hash, changeMeta: {} }));
    if (restored && draft.basedOn && draft.basedOn !== loaded.hash) setRestored(undefined);
  }, [loaded.entry]);

  const update = (change: (d: Draft) => Draft) => {
    setDraft((d) => {
      const next = { ...change(d), savedAt: new Date().toISOString() };
      writeJson(draftKey, next);
      return next;
    });
  };
  const saveSubmitter = (s: Partial<Submitter>) => {
    setSubmitter(s);
    writeJson(SUBMITTER_KEY, s);
  };

  const entryDraft = draft.entry ?? {};
  const pruned = (prune(entryDraft, form === 'edit' ? loaded.entry : undefined) as Obj | undefined) ?? {};
  const diffs = form === 'edit' && loaded.entry ? editDifferences(loaded.entry, { ...pruned }) : [];
  const flat = useMemo(() => flatFields(model.fields), [model]);
  const labelOf = (path: string) => {
    const parts = path.split('.');
    const names: string[] = [];
    for (let i = 1; i <= parts.length; i++) {
      const f = flat.find((x) => x.path === parts.slice(0, i).join('.'));
      if (f) names.push(f.label);
    }
    return names.join(': ') || path;
  };
  const warnings = form === 'add' || form === 'edit' ? fieldWarnings(model.fields, form === 'add' ? entryDraft : { ...pruned }) : [];
  // Field warnings show beside their fields once the person first tries to send, not while a blank form is filled in.
  const warningAt = new Map(shown ? warnings.map((w) => [w.path, w.message]) : []);

  const submission = (): Submission => {
    const changes: ChangeInput[] = diffs.map((d) => ({ ...d, ...(draft.changeMeta?.[d.path] ?? {}) }));
    return buildSubmission({
      kind,
      target,
      submitter,
      now: new Date(),
      random: crypto.getRandomValues(new Uint8Array(3)),
      entry: form === 'add' ? pruned : undefined,
      basis: draft.basis,
      sourceUrl: draft.sourceUrl,
      citation: draft.citation,
      basedOn: form === 'edit' ? loaded.hash : undefined,
      changes: form === 'edit' ? changes : undefined,
      fieldNotes: form === 'note' ? (draft.notes ?? [{}]) : undefined,
      files: files.map((f) => f.meta),
      comment: draft.comment,
      app: { version: '1' },
    });
  };

  const send = async (e: Event) => {
    e.preventDefault();
    const sub = submission();
    const p = submissionProblems(sub, {
      sniffed: Object.fromEntries(files.map((f) => [f.meta.name, f.sniffed])),
      maxBytes,
      fixturesOnly,
      topics: vocabList('fieldNoteTopic').map((v) => v.id),
      label: labelOf,
    });
    const ws = [...warnings.map((w) => w.message), ...p.warnings];
    setShown({ blocking: p.blocking, warnings: ws });
    if (p.blocking.length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSending(true);
    setSendError('');
    try {
      await putSent({ id: sub.id, submission: sub, files: files.map((f) => ({ name: f.meta.name, blob: f.file })) });
      writeJson(draftKey, undefined);
      setSent(sub);
      scrollTo(0, 0);
    } catch (err) {
      setSendError(`Not filed: this browser refused to keep the submission (${(err as Error).message}). Your draft is kept.`);
    } finally {
      setSending(false);
    }
  };

  const startOver = () => {
    writeJson(draftKey, undefined);
    setRestored(undefined);
    setFiles([]);
    setShown(undefined);
    setDraft(form === 'edit' && loaded.entry ? { entry: structuredClone(loaded.entry), basedOn: loaded.hash, changeMeta: {} } : { basis: model.type === 'plant' ? '' : 'observation' });
  };

  if (sent) {
    return (
      <>
        <h1>{title}</h1>
        <div class="c-done" role="status">
          <p>
            Filed as submission <code>{sent.id}</code>. It is kept in this browser until it reaches the inbox, where it is
            checked and, if it passes, enters the library by a pull request.
          </p>
          <p>
            <a href={`${contributeUrl()}#mine`}>My submissions</a>
            {form !== 'add' && (
              <>
                {' · '}
                <a href={entryUrl(target)}>Back to {record?.name ?? target}</a>
              </>
            )}
          </p>
        </div>
      </>
    );
  }

  const about = form === 'add' ? undefined : (record?.name ?? target);
  return (
    <form class="c-form" onSubmit={send} noValidate>
      <h1>
        {title}
        {about && (
          <>
            : <a href={entryUrl(target)}>{about}</a>
          </>
        )}
      </h1>
      <p class="c-intro">{formIntro(form, model)}</p>
      {restored && (
        <p class="c-note" role="status">
          Your draft from {new Date(restored).toLocaleString()} is restored.{' '}
          <button type="button" class="c-link" onClick={startOver}>
            Start over
          </button>
        </p>
      )}

      {(form === 'add' || form === 'edit') && (
        <section aria-labelledby="entry-heading">
          <h2 id="entry-heading">{form === 'add' ? `The ${model.label.toLowerCase()}` : 'The entry'}</h2>
          {form === 'edit' && !loaded.entry ? (
            <p role={loaded.error ? 'alert' : undefined}>{loaded.error ?? 'Loading the entry…'}</p>
          ) : (
            <>
              <p class="c-hint">
                {form === 'edit'
                  ? 'Change what you know to be different. Only what you change is sent.'
                  : 'Fill in what you know; leave the rest blank. Odd or missing values are flagged, not refused.'}
              </p>
              <Fields fields={model.fields} value={entryDraft} warnings={warningAt} index={index} onChange={(path, v) => update((d) => ({ ...d, entry: setPath(d.entry ?? {}, path, v) }))} />
            </>
          )}
        </section>
      )}

      {form === 'add' && (
        <BasisFields
          legend={`What is this ${model.label.toLowerCase()} based on?`}
          idPrefix="entry-basis"
          value={{ basis: draft.basis, sourceUrl: draft.sourceUrl, citation: draft.citation }}
          noCorrection
          onChange={(v) => update((d) => ({ ...d, ...v }))}
        />
      )}

      {form === 'edit' && loaded.entry && (
        <section aria-labelledby="changes-heading">
          <h2 id="changes-heading">Your changes</h2>
          {!diffs.length ? (
            <p>No changes yet.</p>
          ) : (
            <ol class="c-changes">
              {diffs.map((d, i) => {
                const meta = draft.changeMeta?.[d.path] ?? {};
                const what = 'value' in d ? (d.value === null ? 'cleared' : `set to ${show(d.value)}`) : 'add' in d ? `adds ${show(d.add)}` : `removes ${show(d.remove)}`;
                return (
                  <li>
                    <p class="c-change">
                      <strong>{labelOf(d.path)}</strong> {what}
                    </p>
                    <BasisFields
                      legend={`Basis for this change to ${labelOf(d.path)}`}
                      idPrefix={`change-${i}`}
                      value={meta}
                      withNote
                      onChange={(v) => update((dr) => ({ ...dr, changeMeta: { ...dr.changeMeta, [d.path]: { ...meta, ...v } } }))}
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {form === 'note' && (
        <NoteFields
          fields={noteFields}
          notes={draft.notes ?? [{}]}
          plantFields={model.fields}
          index={index}
          onChange={(notes) => update((d) => ({ ...d, notes }))}
        />
      )}

      {fileRoles(form, model).length > 0 && <FilesSection roles={fileRoles(form, model)} files={files} onChange={setFiles} fixturesOnly={fixturesOnly} required={form === 'photo'} />}

      <section aria-labelledby="comment-heading">
        <h2 id="comment-heading">Anything else</h2>
        <label class="c-field">
          <span>Comment (optional)</span>
          <textarea rows={3} value={draft.comment ?? ''} onInput={(e) => update((d) => ({ ...d, comment: (e.currentTarget as HTMLTextAreaElement).value }))} />
        </label>
      </section>

      <Who value={submitter} onChange={saveSubmitter} />

      {shown && (shown.blocking.length > 0 || shown.warnings.length > 0) && (
        <div class="c-summary" ref={summaryRef} tabindex={-1} role={shown.blocking.length ? 'alert' : 'status'}>
          {shown.blocking.length > 0 && (
            <>
              <p>
                <strong>Not sent yet. Fix {shown.blocking.length === 1 ? 'this' : 'these'} first:</strong>
              </p>
              <ul>
                {shown.blocking.map((b) => (
                  <li>{b}</li>
                ))}
              </ul>
            </>
          )}
          {shown.warnings.length > 0 && (
            <>
              <p>{shown.blocking.length ? 'Also worth a look (these don’t stop it):' : 'Sent with these to look at:'}</p>
              <ul>
                {shown.warnings.map((w) => (
                  <li>{w}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {sendError && (
        <p class="c-alert" role="alert">
          {sendError}
        </p>
      )}
      <p class="c-actions">
        <button type="submit" class="c-button c-primary" disabled={sending}>
          {sending ? 'Sending…' : 'Send submission'}
        </button>
        <span class="c-hint">Your draft saves in this browser as you type.</span>
      </p>
    </form>
  );
}

function formIntro(form: Route['form'], model: TypeModel): string {
  switch (form) {
    case 'add':
      return model.type === 'palette'
        ? 'Submit a plant list to the library as a palette. Start from the workspace’s “Submit to library” to bring a list you built there.'
        : `Describe a ${model.label.toLowerCase()} the library lacks.`;
    case 'edit':
      return 'The form opens with the entry as published. Change what you know is different, and say for each change what it is based on.';
    case 'photo':
      return 'Add photos with what licensing needs: whose they are, the license, where and when, what they show, and alt text.';
    default:
      return 'Your professional opinion is kept beside the published facts as a field note, never over them.';
  }
}

/** The file roles a form takes (spec: submissions.md, the forms table). */
function fileRoles(form: Route['form'], model: TypeModel): FileRole[] {
  if (form === 'photo') return ['image'];
  if (form === 'edit') return ['supporting'];
  if (form !== 'add') return [];
  const roles: FileRole[] = [];
  if (model.fields.some((f) => f.kind === 'plantList' && f.quantityRequired)) roles.push('plant-list');
  if (PHOTO_TYPES.includes(model.type)) roles.push('image');
  return roles;
}

function show(v: unknown): string {
  if (Array.isArray(v)) return v.map(show).join(', ');
  if (v && typeof v === 'object') {
    const o = v as Obj;
    if ('ref' in o) return String(o.ref);
    if ('plant' in o) return show(o.plant);
    return Object.entries(o)
      .map(([k, x]) => `${k} ${show(x)}`)
      .join(', ');
  }
  return String(v);
}

const fid = (path: string) => `f-${path.replace(/[^A-Za-z0-9-]/g, '-')}`;

/** The generated fields of an entry, nested by group. */
function Fields({ fields, value, warnings, index, onChange }: { fields: Field[]; value: Obj; warnings: Map<string, string>; index?: LibraryIndex; onChange: (path: string, v: unknown) => void }) {
  return (
    <div class="c-fields">
      {fields.map((f) => (
        <FieldInput field={f} value={value} warnings={warnings} index={index} onChange={onChange} />
      ))}
    </div>
  );
}

function Hint({ id, field, warning }: { id: string; field: Field; warning?: string }) {
  return (
    <>
      {field.description && (
        <span class="c-hint" id={`${id}-hint`}>
          {field.description}
        </span>
      )}
      {warning && (
        <span class="c-warn" id={`${id}-warn`}>
          {warning}
        </span>
      )}
    </>
  );
}

const describedBy = (id: string, field: Field, warning?: string) => [field.description ? `${id}-hint` : '', warning ? `${id}-warn` : ''].filter(Boolean).join(' ') || undefined;

function FieldInput({ field: f, value, warnings, index, onChange }: { field: Field; value: Obj; warnings: Map<string, string>; index?: LibraryIndex; onChange: (path: string, v: unknown) => void }) {
  const id = fid(f.path);
  const v = getPath(value, f.path);
  const warning = warnings.get(f.path);
  const name = `${f.label}${f.required ? '' : ' (optional)'}`;
  const desc = describedBy(id, f, warning);
  switch (f.kind) {
    case 'group':
      return (
        <fieldset class="c-group">
          <legend>
            {f.label}
            {f.unit ? ` (${f.unit})` : ''}
          </legend>
          <Hint id={id} field={f} warning={warning} />
          <div class="c-group-fields">
            {f.fields.map((c) => (
              <FieldInput field={c} value={value} warnings={warnings} index={index} onChange={onChange} />
            ))}
          </div>
        </fieldset>
      );
    case 'choices': {
      const chosen = Array.isArray(v) ? (v as string[]) : [];
      return (
        <fieldset class="c-group c-choices" aria-describedby={desc}>
          <legend>{name}</legend>
          <Hint id={id} field={f} warning={warning} />
          <div class="c-options">
            {f.options.map((o) => (
              <label class="c-check">
                <input
                  type="checkbox"
                  checked={chosen.includes(o.id)}
                  onChange={(e) => {
                    const on = (e.currentTarget as HTMLInputElement).checked;
                    // Keep the existing order and add at the end, so an edit is an add or remove.
                    const next = on ? [...chosen, o.id] : chosen.filter((x) => x !== o.id);
                    onChange(f.path, next.length ? next : undefined);
                  }}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case 'plantList':
      return <PlantListInput field={f} value={Array.isArray(v) ? (v as PlantListItem[]) : []} index={index} onChange={(lines) => onChange(f.path, lines.length ? lines : undefined)} />;
    case 'boolean':
      return (
        <div class="c-field c-inline">
          <label class="c-check">
            <input type="checkbox" checked={v === true} aria-describedby={desc} onChange={(e) => onChange(f.path, (e.currentTarget as HTMLInputElement).checked ? true : undefined)} />
            {f.label}
          </label>
          <Hint id={id} field={f} warning={warning} />
        </div>
      );
    case 'choice':
      return (
        <div class="c-field">
          <label for={id}>{name}</label>
          <select id={id} aria-describedby={desc} value={typeof v === 'string' ? v : ''} onChange={(e) => onChange(f.path, (e.currentTarget as HTMLSelectElement).value || undefined)}>
            <option value="">—</option>
            {f.options.map((o) => (
              <option value={o.id}>{o.label}</option>
            ))}
          </select>
          <Hint id={id} field={f} warning={warning} />
        </div>
      );
    case 'number':
      return (
        <div class="c-field c-number">
          <label for={id}>
            {name}
            {f.unit ? ` (${f.unit})` : ''}
          </label>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            aria-describedby={desc}
            value={v === undefined || v === null ? '' : String(v)}
            onInput={(e) => {
              const t = (e.currentTarget as HTMLInputElement).value.trim();
              const n = Number(t.replace(/,/g, ''));
              onChange(f.path, t === '' ? undefined : Number.isFinite(n) ? n : t);
            }}
          />
          <Hint id={id} field={f} warning={warning} />
        </div>
      );
    case 'strings':
      return (
        <div class="c-field c-wide">
          <label for={id}>
            {name} <span class="c-hint">one per line</span>
          </label>
          <textarea
            id={id}
            rows={Math.max(2, Array.isArray(v) ? v.length + 1 : 2)}
            aria-describedby={desc}
            value={Array.isArray(v) ? (v as string[]).join('\n') : ''}
            onInput={(e) => {
              const lines = (e.currentTarget as HTMLTextAreaElement).value.split('\n');
              onChange(f.path, lines.some((l) => l.trim()) ? lines : undefined);
            }}
          />
          <Hint id={id} field={f} warning={warning} />
        </div>
      );
    default:
      return (
        <div class={`c-field${f.multiline ? ' c-wide' : ''}`}>
          <label for={id}>{name}</label>
          {f.multiline ? (
            <textarea id={id} rows={4} aria-describedby={desc} value={typeof v === 'string' ? v : ''} onInput={(e) => onChange(f.path, (e.currentTarget as HTMLTextAreaElement).value)} />
          ) : (
            <input id={id} type="text" aria-describedby={desc} value={typeof v === 'string' ? v : ''} onInput={(e) => onChange(f.path, (e.currentTarget as HTMLInputElement).value)} />
          )}
          <Hint id={id} field={f} warning={warning} />
        </div>
      );
  }
}

/** A plant list: picked from the library with autocomplete (free text allowed), or pasted from a spreadsheet. */
function PlantListInput({ field, value, index, onChange }: { field: Field & { kind: 'plantList' }; value: PlantListItem[]; index?: LibraryIndex; onChange: (lines: PlantListItem[]) => void }) {
  const plants = useMemo(() => (index?.records ?? []).filter((r) => r.type === 'plant'), [index]);
  const byKey = useMemo(() => new Map(plants.map((r) => [r.key, r])), [plants]);
  const names = useMemo(() => recordNameIndex(index?.records ?? []), [index]);
  const [paste, setPaste] = useState('');
  const [status, setStatus] = useState('');
  const id = fid(field.path);
  const nameOf = (l: PlantListItem) => (typeof l.plant === 'string' ? l.plant : (byKey.get(l.plant.ref)?.name ?? l.plant.ref));
  const resolveText = (t: string): PlantListItem['plant'] => {
    const key = names.get(normalizeName(t));
    return key ? { ref: key } : t;
  };
  const set = (i: number, line: PlantListItem) => onChange(value.map((l, j) => (j === i ? line : l)));
  const unsourced = value.filter((l) => typeof l.plant === 'string' && l.plant.trim()).length;
  return (
    <fieldset class="c-group c-plantlist">
      <legend>{field.label}</legend>
      <datalist id={`${id}-names`}>
        {plants.map((r) => (
          <option value={r.name} />
        ))}
      </datalist>
      {value.length > 0 && (
        <div class="table-scroll" role="region" aria-label={`${field.label} rows`} tabindex={0}>
          <table class="c-table">
            <thead>
              <tr>
                <th scope="col">Plant</th>
                <th scope="col">Quantity{field.quantityRequired ? '' : ' (optional)'}</th>
                <th scope="col">Size</th>
                <th scope="col">Spacing</th>
                <th scope="col">Note</th>
                <th scope="col">
                  <span class="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {value.map((l, i) => (
                <tr>
                  <td>
                    <input
                      type="text"
                      list={`${id}-names`}
                      aria-label={`Plant, row ${i + 1}`}
                      value={nameOf(l)}
                      onChange={(e) => set(i, { ...l, plant: resolveText((e.currentTarget as HTMLInputElement).value) })}
                    />
                    {typeof l.plant === 'string' && l.plant.trim() && <span class="c-hint">Not in the library; kept as text.</span>}
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      class="c-qty"
                      aria-label={`Quantity, row ${i + 1}`}
                      value={l.quantity === undefined ? '' : String(l.quantity)}
                      onInput={(e) => {
                        const n = Number((e.currentTarget as HTMLInputElement).value.replace(/,/g, ''));
                        const { quantity: _q, ...rest } = l;
                        set(i, Number.isInteger(n) && n >= 1 ? { ...rest, quantity: n } : rest);
                      }}
                    />
                  </td>
                  {(['size', 'spacing', 'note'] as const).map((k) => (
                    <td>
                      <input
                        type="text"
                        aria-label={`${k.charAt(0).toUpperCase()}${k.slice(1)}, row ${i + 1}`}
                        value={l[k] ?? ''}
                        onInput={(e) => {
                          const t = (e.currentTarget as HTMLInputElement).value;
                          const { [k]: _old, ...rest } = l;
                          set(i, t ? { ...rest, [k]: t } : rest);
                        }}
                      />
                    </td>
                  ))}
                  <td>
                    <button type="button" class="c-button" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unsourced > 0 && (
        <p class="c-hint">
          {unsourced} {unsourced === 1 ? 'name matches' : 'names match'} no plant in the library; {unsourced === 1 ? 'it enters' : 'they enter'} as text.
        </p>
      )}
      <p>
        <button type="button" class="c-button" onClick={() => onChange([...value, { plant: '' }])}>
          Add a row
        </button>
      </p>
      <div class="c-field c-wide">
        <label for={`${id}-paste`}>Paste rows from a spreadsheet</label>
        <span class="c-hint" id={`${id}-paste-hint`}>
          Botanical name, quantity, size, spacing, and note, one plant per row; a header row may name the columns.
        </span>
        <textarea id={`${id}-paste`} rows={3} aria-describedby={`${id}-paste-hint`} value={paste} onInput={(e) => setPaste((e.currentTarget as HTMLTextAreaElement).value)} />
      </div>
      <p>
        <button
          type="button"
          class="c-button"
          disabled={!paste.trim()}
          onClick={() => {
            const read = linesFromPaste(paste, names);
            onChange([...value.filter((l) => typeof l.plant !== 'string' || l.plant.trim()), ...read.lines]);
            setPaste('');
            setStatus(`Added ${read.lines.length} ${read.lines.length === 1 ? 'row' : 'rows'}${read.skipped ? `; ${read.skipped} without a plant name ${read.skipped === 1 ? 'was' : 'were'} left out` : ''}.`);
          }}
        >
          Add pasted rows
        </button>{' '}
        <span role="status" class="c-hint">
          {status}
        </span>
      </p>
    </fieldset>
  );
}

/** A claim's basis: observation, a source (with its URL or citation), or a correction; with a note when the claim needs one. */
function BasisFields({ legend, idPrefix, value, onChange, withNote, noCorrection }: { legend: string; idPrefix: string; value: { basis?: Basis | ''; note?: string; sourceUrl?: string; citation?: string }; onChange: (v: { basis?: Basis | ''; note?: string; sourceUrl?: string; citation?: string }) => void; withNote?: boolean; noCorrection?: boolean }) {
  return (
    <fieldset class="c-group c-basis">
      <legend>{legend}</legend>
      <div class="c-options">
        {BASES.filter((b) => !(noCorrection && b.id === 'correction')).map((b) => (
          <label class="c-check">
            <input type="radio" name={`${idPrefix}-basis`} checked={value.basis === b.id} onChange={() => onChange({ basis: b.id })} />
            {b.label} <span class="c-hint">{b.help}</span>
          </label>
        ))}
      </div>
      {value.basis === 'source' && (
        <div class="c-group-fields">
          <div class="c-field c-wide">
            <label for={`${idPrefix}-url`}>Source URL</label>
            <input id={`${idPrefix}-url`} type="url" value={value.sourceUrl ?? ''} onInput={(e) => onChange({ sourceUrl: (e.currentTarget as HTMLInputElement).value })} />
          </div>
          <div class="c-field c-wide">
            <label for={`${idPrefix}-citation`}>Or a citation</label>
            <input id={`${idPrefix}-citation`} type="text" value={value.citation ?? ''} onInput={(e) => onChange({ citation: (e.currentTarget as HTMLInputElement).value })} />
          </div>
        </div>
      )}
      {withNote && (
        <div class="c-field c-wide">
          <label for={`${idPrefix}-note`}>Why</label>
          <textarea id={`${idPrefix}-note`} rows={2} value={value.note ?? ''} onInput={(e) => onChange({ note: (e.currentTarget as HTMLTextAreaElement).value })} />
        </div>
      )}
    </fieldset>
  );
}

/** Field notes, from the submission schema's fieldNote; a trait is one of the entry's fields, a project one of the library's. */
function NoteFields({ fields, notes, plantFields, index, onChange }: { fields: Field[]; notes: FieldNoteInput[]; plantFields: Field[]; index?: LibraryIndex; onChange: (n: FieldNoteInput[]) => void }) {
  const traits = useMemo(() => traitOptions(plantFields), [plantFields]);
  const projects = useMemo(() => (index?.records ?? []).filter((r) => r.type === 'project'), [index]);
  return (
    <section aria-labelledby="notes-heading">
      <h2 id="notes-heading">Field notes</h2>
      <datalist id="c-projects">
        {projects.map((r) => (
          <option value={r.key}>{r.name}</option>
        ))}
      </datalist>
      {notes.map((n, i) => {
        const set = (k: keyof FieldNoteInput, v: string) => onChange(notes.map((x, j) => (j === i ? { ...x, [k]: v || undefined } : x)));
        return (
          <fieldset class="c-group">
            <legend>{notes.length > 1 ? `Field note ${i + 1}` : 'Field note'}</legend>
            <div class="c-group-fields">
              {fields.map((f) => {
                const id = `note-${i}-${f.key}`;
                const v = (n[f.key as keyof FieldNoteInput] as string | undefined) ?? '';
                const name = `${f.label}${f.required ? '' : ' (optional)'}`;
                if (f.key === 'trait') {
                  return (
                    <div class="c-field">
                      <label for={id}>Trait it speaks to (optional)</label>
                      <select id={id} value={v} onChange={(e) => set('trait', (e.currentTarget as HTMLSelectElement).value)}>
                        <option value="">—</option>
                        {traits.map((o) => (
                          <option value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                }
                if (f.key === 'project') {
                  return (
                    <div class="c-field">
                      <label for={id}>{name}</label>
                      <input id={id} type="text" list="c-projects" value={v} onInput={(e) => set('project', (e.currentTarget as HTMLInputElement).value)} />
                    </div>
                  );
                }
                if (f.kind === 'choice') {
                  return (
                    <div class="c-field">
                      <label for={id}>{name}</label>
                      <select id={id} value={v} onChange={(e) => set(f.key as keyof FieldNoteInput, (e.currentTarget as HTMLSelectElement).value)}>
                        <option value="">—</option>
                        {f.options.map((o) => (
                          <option value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                }
                return (
                  <div class="c-field c-wide">
                    <label for={id}>{name}</label>
                    <textarea id={id} rows={4} value={v} onInput={(e) => set(f.key as keyof FieldNoteInput, (e.currentTarget as HTMLTextAreaElement).value)} />
                  </div>
                );
              })}
            </div>
            {notes.length > 1 && (
              <button type="button" class="c-button" onClick={() => onChange(notes.filter((_, j) => j !== i))}>
                Remove this note
              </button>
            )}
          </fieldset>
        );
      })}
      <p>
        <button type="button" class="c-button" onClick={() => onChange([...notes, {}])}>
          Add another note
        </button>
      </p>
    </section>
  );
}

const ROLE_TITLES: Record<FileRole, { title: string; accept: string; help: string }> = {
  image: { title: 'Photos', accept: 'image/jpeg,image/png,image/webp', help: 'JPEG, PNG, or WebP.' },
  'plant-list': { title: 'Plant list file', accept: '.pdf,.csv,.xlsx,application/pdf,text/csv', help: 'The planting schedule as a PDF, CSV, or XLSX file, for the routine to transcribe.' },
  supporting: { title: 'Supporting files', accept: 'image/jpeg,image/png,image/webp,.pdf,.csv,.xlsx', help: 'Anything that backs up the changes: a photo, a PDF, a spreadsheet.' },
};

async function sha256Hex(b: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Files by role, each with the metadata licensing needs. */
function FilesSection({ roles, files, onChange, fixturesOnly, required }: { roles: FileRole[]; files: FileItem[]; onChange: (f: FileItem[]) => void; fixturesOnly: boolean; required: boolean }) {
  const [reading, setReading] = useState(false);
  const latest = useRef(files);
  latest.current = files;
  const add = async (role: FileRole, list: FileList | null) => {
    if (!list?.length) return;
    setReading(true);
    const used = new Set(latest.current.map((f) => f.meta.name));
    const added: FileItem[] = [];
    for (const file of [...list]) {
      const buf = await file.arrayBuffer();
      const name = safeFileName(file.name, used);
      used.add(name);
      added.push({
        key: `${name}-${Date.now()}-${Math.random()}`,
        file,
        sniffed: sniff(new Uint8Array(buf)),
        meta: { name, sha256: await sha256Hex(buf), bytes: file.size, role, ...(role === 'image' && file.lastModified ? { takenAt: new Date(file.lastModified).toISOString().slice(0, 10) } : {}) },
      });
    }
    onChange([...latest.current, ...added]);
    setReading(false);
  };
  const set = (key: string, meta: Partial<FileMeta>) => onChange(latest.current.map((f) => (f.key === key ? { ...f, meta: { ...f.meta, ...meta } } : f)));
  const licenses = vocabList('license');
  const shows = vocabList('imageShows');
  return (
    <section aria-labelledby="files-heading">
      <h2 id="files-heading">Files{required ? '' : ' (optional)'}</h2>
      <p class="c-hint">Files aren't kept in a draft: add them last, just before sending.</p>
      {roles.map((role) => (
        <div class="c-files">
          <div class="c-field c-wide">
            <label for={`files-${role}`}>{ROLE_TITLES[role].title}</label>
            <span class="c-hint" id={`files-${role}-hint`}>
              {ROLE_TITLES[role].help}
            </span>
            <input
              id={`files-${role}`}
              type="file"
              multiple={role !== 'plant-list'}
              accept={ROLE_TITLES[role].accept}
              aria-describedby={`files-${role}-hint`}
              onChange={(e) => {
                const input = e.currentTarget as HTMLInputElement;
                void add(role, input.files).then(() => (input.value = ''));
              }}
            />
          </div>
          {files
            .filter((f) => f.meta.role === role)
            .map((f, i) => {
              const p = `file-${role}-${i}`;
              const m = f.meta;
              return (
                <fieldset class="c-group c-file">
                  <legend>{m.name}</legend>
                  <p class="c-hint">
                    {(m.bytes / 1048576).toFixed(1)} MB{f.sniffed ? '' : ' · not a type the library takes'}{' '}
                    <button type="button" class="c-link" onClick={() => onChange(latest.current.filter((x) => x.key !== f.key))}>
                      Remove {m.name}
                    </button>
                  </p>
                  <fieldset class="c-group">
                    <legend>Whose is it?</legend>
                    <div class="c-options">
                      {RIGHTS.map((r) => (
                        <label class="c-check">
                          <input type="radio" name={`${p}-rights`} checked={m.rights === r.id} onChange={() => set(f.key, { rights: r.id as Rights })} />
                          {r.label} <span class="c-hint">{r.id === 'organization-owned' && fixturesOnly ? 'Accepted only in the company copy, not this prototype.' : r.help}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div class="c-group-fields">
                    {m.rights === 'third-party' && (
                      <div class="c-field c-wide">
                        <label for={`${p}-source`}>The page it came from</label>
                        <input id={`${p}-source`} type="url" value={m.sourceUrl ?? ''} onInput={(e) => set(f.key, { sourceUrl: (e.currentTarget as HTMLInputElement).value })} />
                      </div>
                    )}
                    {role === 'image' && (
                      <>
                        {m.rights === 'own-work' && (
                          <div class="c-field">
                            <label for={`${p}-license`}>License you grant</label>
                            <select id={`${p}-license`} value={m.license ?? ''} onChange={(e) => set(f.key, { license: (e.currentTarget as HTMLSelectElement).value || undefined })}>
                              <option value="">—</option>
                              {licenses.map((l) => (
                                <option value={l.id}>{l.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div class="c-field">
                          <label for={`${p}-photographer`}>Who took it</label>
                          <input id={`${p}-photographer`} type="text" value={m.photographer ?? ''} onInput={(e) => set(f.key, { photographer: (e.currentTarget as HTMLInputElement).value })} />
                        </div>
                        <div class="c-field">
                          <label for={`${p}-taken`}>When</label>
                          <input id={`${p}-taken`} type="date" value={m.takenAt ?? ''} onInput={(e) => set(f.key, { takenAt: (e.currentTarget as HTMLInputElement).value })} />
                        </div>
                        <div class="c-field">
                          <label for={`${p}-place`}>Where</label>
                          <input id={`${p}-place`} type="text" value={m.place ?? ''} onInput={(e) => set(f.key, { place: (e.currentTarget as HTMLInputElement).value })} />
                        </div>
                        <div class="c-field">
                          <label for={`${p}-shows`}>What it shows</label>
                          <select id={`${p}-shows`} value={m.shows ?? ''} onChange={(e) => set(f.key, { shows: (e.currentTarget as HTMLSelectElement).value || undefined })}>
                            <option value="">—</option>
                            {shows.map((s) => (
                              <option value={s.id}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                        <div class="c-field c-wide">
                          <label for={`${p}-alt`}>Alt text</label>
                          <input id={`${p}-alt`} type="text" value={m.alt ?? ''} onInput={(e) => set(f.key, { alt: (e.currentTarget as HTMLInputElement).value })} />
                        </div>
                      </>
                    )}
                  </div>
                </fieldset>
              );
            })}
        </div>
      ))}
      {reading && <p role="status">Reading files…</p>}
    </section>
  );
}

/** Who is contributing: a statement, not an identity; remembered in this browser. */
function Who({ value, onChange }: { value: Partial<Submitter>; onChange: (v: Partial<Submitter>) => void }) {
  const field = (k: keyof Submitter, text: string, auto: string) => (
    <div class="c-field">
      <label for={`who-${k}`}>{text}</label>
      {k === 'email' ? (
        <input id={`who-${k}`} type="email" autocomplete={auto} value={value[k] ?? ''} onInput={(e) => onChange({ ...value, [k]: (e.currentTarget as HTMLInputElement).value })} />
      ) : (
        <input id={`who-${k}`} type="text" autocomplete={auto} value={value[k] ?? ''} onInput={(e) => onChange({ ...value, [k]: (e.currentTarget as HTMLInputElement).value })} />
      )}
    </div>
  );
  return (
    <section aria-labelledby="who-heading">
      <h2 id="who-heading">Who you are</h2>
      <p class="c-hint">There are no accounts: your name is a statement, remembered in this browser for next time.</p>
      <div class="c-group-fields">
        {field('name', 'Name', 'name')}
        {field('role', 'Role', 'organization-title')}
        {field('email', 'Email (optional)', 'email')}
      </div>
    </section>
  );
}

