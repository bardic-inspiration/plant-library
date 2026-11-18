"""Turn a plant-list PDF in docs/ into fixture plant entries.

    python3 -I plant_list_pdf.py extract <config.json> <rows.json>
    python3 -I plant_list_pdf.py build   <config.json> <rows.json> <repo root>

`extract` reads the PDF's tables and description pages into one JSON file of
rows, for review against the rendered pages. `build` writes content/plant/
entries from those rows and the config. Both are re-runnable: entries this
source made are rewritten, and entries it only adds to keep their own values.
See ../SKILL.md for the workflow and the config's keys.
"""
import json, os, re, sys

# ---------------------------------------------------------------- extract

# Header words of the attribute columns, left to right. A repeated word
# (Full, Forest, Wet/Wetland) names the next column of that kind.
ATTR_TOKENS = {'Life': 'life', 'Full': 'full', 'Part': 'partsun', 'Dry': 'dry', 'Moist': 'moist', 'Seas.': 'seaswet', 'Seas': 'seaswet',
               'Pernl.': 'pernlwet', 'Pernl': 'pernlwet', 'Sub': 'sub', 'T/E': 'te', 'Wet': 'wet', 'Wetland': 'wet', 'Riparian': 'h_riparian',
               'Forest': 'forest', 'Thicket': 'h_thicket', 'Grass': 'h_grass', 'Rocky': 'h_rocky'}
REPEATS = {'full': ('fullsun', 'fullshade'), 'forest': ('h_forest', 'h_forestslope'), 'wet': ('h_wetland', 'indicator')}
LIFE = ('P', 'EP', 'A', 'B')


def table_rows(pdf, first_page, label):
    """One table, which may run across a spread: the left page's words carry
    the facing page's too, at x beyond the page width."""
    p = pdf.pages[first_page - 1]
    words = p.extract_words()
    tops = [w['top'] for w in words if w['text'] == 'Latin']
    if not tops:
        print(f'page {first_page}: no "Latin" header, skipped', file=sys.stderr)
        return []
    lt = min(tops)
    hdr = [w for w in words if lt - 15 < w['top'] < lt + 18]
    t = max(p.find_tables(), key=lambda t: len(t.rows))
    xs = sorted({round(c[0]) for c in t.cells}) + [p.width]
    cols = list(zip(xs, xs[1:]))

    def col(label_word):
        w = [w for w in hdr if w['text'] == label_word and w['x0'] < p.width]
        if not w:
            return None
        c = (w[0]['x0'] + w[0]['x1']) / 2
        return next(((a, b) for a, b in cols if a <= c < b), None)

    common, height, color, form, showy = col('Common'), col('Mature'), col('Color'), col('Form'), col('Showy')
    latin = (xs[0] - 8, common[0])
    months = sorted((w['x0'] + w['x1']) / 2 for w in hdr if re.fullmatch('[JFMASOND]', w['text']) and w['x0'] < p.width)
    centers, seen = {}, {}
    for w in sorted((w for w in hdr if w['text'] in ATTR_TOKENS), key=lambda w: w['x0']):
        k, c = ATTR_TOKENS[w['text']], (w['x0'] + w['x1']) / 2
        if k in REPEATS:
            n = seen.get(k, 0); seen[k] = n + 1
            if n > 1:
                continue
            k = REPEATS[k][n]
        if k == 'life':
            c += 7  # "Life" sits left of "cycle"
        centers[k] = w['x0'] - 15 if k == 'indicator' else c
    hend = max(w['bottom'] for w in hdr)
    rects = [r for r in p.rects if r['width'] < 10 and r['height'] < 10]
    out = []
    for r in (r for r in t.rows if r.bbox[1] >= hend - 4):
        top, bot = r.bbox[1], r.bbox[3]
        bw = [w for w in words if top - 1 <= (w['top'] + w['bottom']) / 2 <= bot + 1]

        def txt(rng):
            if not rng:
                return ''
            return ' '.join(w['text'] for w in sorted(bw, key=lambda w: (round(w['top']), w['x0'])) if rng[0] - 2 <= w['x0'] < rng[1] - 1).strip()

        rec = {'page': first_page, 'table': label, 'latin': txt(latin), 'common': txt(common), 'height': txt(height),
               'color': txt(color), 'form': txt(form), 'showy': bool(txt(showy)) if showy else None}
        if not rec['latin'] and not rec['common']:
            continue
        ms = set()
        for q in rects:  # bloom months are small filled squares
            if top <= q['top'] <= bot and months:
                cx = (q['x0'] + q['x1']) / 2
                i = min(range(12), key=lambda i: abs(months[i] - cx))
                if abs(months[i] - cx) < 8:
                    ms.add(i + 1)
        rec['months'] = sorted(ms)
        attrs, life = set(), ''
        for w in bw:
            cx = (w['x0'] + w['x1']) / 2
            if 'indicator' in centers and w['x0'] >= centers['indicator']:
                rec['indicator'] = (rec.get('indicator', '') + ' ' + w['text']).strip()
            elif w['text'] in ('•', 'X', 'x'):
                k = min((k for k in centers if k != 'indicator'), key=lambda k: abs(centers[k] - cx))
                if abs(centers[k] - cx) < 14:
                    attrs.add(k)
            elif w['text'] in LIFE and abs(centers.get('life', -99) - cx) < 20:
                life = w['text']
        rec['life'], rec['attrs'] = life, sorted(attrs)
        out.append(rec)
    return out


def page_set(spec):
    a, _, b = spec.partition('-')
    return range(int(a), int(b or a) + 1)


def detail_rows(pdf, cfg):
    """Description pages: a name, then "Label: value" lines, until the next name."""
    d = cfg.get('details')
    if not d:
        return {}
    pages = [(n, extra) for spec, extra in d['pages'].items() for n in page_set(spec)]
    full = '\n'.join(f'@@PAGE {n}\n' + (pdf.pages[n - 1].extract_text() or '') for n, _ in pages)
    extras = {n: e for n, e in pages}
    aliases = d.get('aliases', {})
    names = [p[0] for l in cfg.get('lists', []) for p in l['plants']]
    pos = []
    for name in names:
        for alt in [name] + aliases.get(name, []):
            pat = re.escape(alt).replace(r'\ ', r'\s+')
            pos += [(m.start(), name) for m in re.finditer(pat, full)]
    pos.sort()
    out = {}
    for i, (st, name) in enumerate(pos):
        blk = full[st:pos[i + 1][0] if i + 1 < len(pos) else len(full)]
        if 'Mature height' not in blk or name in out:
            continue
        page = int(re.findall(r'@@PAGE (\d+)', full[:st])[-1])
        g = lambda k: (m.group(1).strip() if (m := re.search(k + r':\s*([^\n]+)', blk)) else None)
        out[name] = {'page': page, **extras[page], 'height': (g('Mature height') or '').split(' Mature')[0], 'spread': g('Mature spread'),
                     'growth': g('Growth rate'), 'conditions': g('Conditions')}
    return out


def extract(cfg_path, rows_path):
    import pdfplumber
    cfg = json.load(open(cfg_path))
    pdf = pdfplumber.open(cfg['pdf'])
    rows = []
    for t in cfg.get('tables', []):
        for n in range(t['first'], t['last'] + 1, t.get('step', 1)):
            rows += table_rows(pdf, n, t['label'])
    json.dump({'tables': rows, 'details': detail_rows(pdf, cfg)}, open(rows_path, 'w'), indent=1, ensure_ascii=False)
    print(f'{len(rows)} table rows, {len(cfg.get("lists", []))} transcribed lists; render pages with pdftoppm and compare before building')

# ---------------------------------------------------------------- build

SUN = {'fullsun': 'full-sun', 'partsun': 'part-shade', 'fullshade': 'shade'}
MOISTURE = {'dry': 'dry', 'moist': 'moist', 'seaswet': 'wet', 'pernlwet': 'wet', 'sub': 'wet'}
LEVELS = ['dry', 'moist', 'wet']
RATE = {'very slow': 'slow', 'slow': 'slow', 'medium': 'moderate', 'moderate': 'moderate', 'fast': 'fast', 'very fast': 'fast'}
TRAITS = ['form', 'foliage', 'height', 'spread', 'growthRate', 'sun', 'moisture', 'bloom']
NAME_FIELDS = ['commonNames', 'synonyms']


def inches(s):
    """'8"–20"', "1'–3'", '24–36"', '18"–2\'' -> (min, max) in inches."""
    s = re.sub(r'\s', '', s.replace('’', "'").replace('′', "'").replace('”', '"').replace('″', '"').replace('—', '–'))
    m = re.fullmatch(r'''(\d+(?:\.\d+)?)(['"]?)(?:[–/-](\d+(?:\.\d+)?)(['"]?))?''', s)
    if not m:
        return None
    a, ua, b, ub = m.groups()
    if b is None:
        b, ub = a, ua
    ua, ub = ua or ub, ub or ua
    if not ua:
        return None
    f = lambda v, u: float(v) * (12 if u == "'" else 1)
    return f(a, ua), f(b, ub)


def feet(rng):
    r = lambda x: round(x / 12, 2) if x < 60 else round(x / 12, 1)
    return {'min': r(rng[0]), 'max': r(rng[1])}


def detail_size(s):
    s = s.strip()
    if 'inch' in s:
        return inches(re.sub(r'\s*inch(es)?', '"', s).replace('–', '"–', 1) if '–' in s else re.sub(r'\s*inch(es)?', '"', s))
    s = s.replace(' ft.', '').replace(' ft', '').replace('/', '–')
    return inches(s.replace('–', "'–") + "'")


def conditions(c):
    """'Full to part sun, dry, moist to seasonally wet soil' -> sun, moisture."""
    c = c.lower()
    sunp, _, moip = c.partition(',')
    sun = []
    if 'full sun' in sunp or sunp.startswith('full to'):
        sun.append('full-sun')
    if 'part sun' in sunp or 'part shade' in sunp or 'full sun to full shade' in sunp:
        sun.append('part-shade')
    if 'full shade' in sunp:
        sun.append('shade')
    lv = [i for i, k in enumerate(LEVELS) if k in moip]
    if ' to ' in moip and lv:
        lv = list(range(min(lv), max(lv) + 1))
    return sun, [LEVELS[i] for i in lv]


def slug(latin):
    return re.sub(r'[^a-z0-9]+', '-', latin.lower().replace('.', '')).strip('-')


def name_parts(latin):
    w = latin.split()
    assert len(w) in (2, 4), f'unhandled name shape: {latin}'
    d = {'genus': w[0], 'species': w[1]}
    if len(w) == 4:
        d['infraRank'], d['infraEpithet'] = w[2], w[3]
    return d


def fmt_height(h):
    """Whole feet in feet; otherwise inches up to 5 ft, then feet to one decimal."""
    a, b = h['min'], h['max']
    span = lambda f: f(a) if a == b else f'{f(a)}–{f(b)}'
    if float(a).is_integer() and float(b).is_integer():
        return span(lambda x: str(int(x))) + ' ft'
    if b <= 5:
        return span(lambda x: str(round(x * 12))) + ' in'
    return span(lambda x: f'{x:g}' if float(x).is_integer() else f'{round(x, 1):g}') + ' ft'


FORM_WORDS = {'graminoid': 'grass or grasslike plant'}


def summary(d, label):
    """A fresh sentence from the entry's own values; never the source's prose."""
    form = label or FORM_WORDS.get(d['form'], d['form'])
    adj = d.get('foliage')
    first = (adj or form)[0]
    s = f"{'An' if first in 'aeiou' else 'A'} {adj + ' ' if adj else ''}{form}"
    if 'height' in d:
        s += ' ' + ('about ' if d['height']['min'] == d['height']['max'] else '') + f"{fmt_height(d['height'])} tall"
    tail, m, sn = [], d.get('moisture'), d.get('sun')
    sl = {'full-sun': 'sun', 'part-shade': 'part shade', 'shade': 'shade'}
    if m:
        tail.append(f"for {m[0] if len(m) == 1 else m[0] + ' to ' + m[-1]} soil")
    if sn:
        tail.append(f"in {sl[sn[0]] if len(sn) == 1 else sl[sn[0]] + ' to ' + sl[sn[-1]]}")
    return s + (', ' + ' '.join(tail) if tail else '') + '.'


def collect(cfg, rows):
    """Plants from the tables, the transcribed lists, and the extras, keyed by name."""
    fix, cfix = cfg.get('nameFixes', {}), cfg.get('commonFixes', {})
    lifeforms, evergreen = cfg.get('lifeCycleForms', {}), set(cfg.get('evergreenLifeCycles', []))
    tables = {t['label']: t for t in cfg.get('tables', [])}

    def cname(c):
        c = re.sub(r'\s+', ' ', c.replace('–', '-')).strip().replace('- ', '-')
        return cfix.get(c, c)

    plants = {}

    def add(latin, common, form, pages, **kw):
        latin = fix.get(latin, latin)
        if latin in plants:  # in more than one list: the first wins, pages add up
            plants[latin]['pages'] |= set(pages)
            return
        plants[latin] = {'latin': latin, 'common': cname(common), 'form': form, 'pages': set(pages), **kw}

    for l in cfg.get('lists', []):  # woody lists first: their form outranks a table's
        for latin, common in l['plants']:
            kw, det = {}, rows['details'].get(latin)
            pages = [l['page']]
            if det:
                pages.append(det['page'])
                h = detail_size(det['height']) if det['height'] else None
                if h: kw['height'] = feet(h)
                sp = detail_size(det['spread']) if det.get('spread') else None
                if sp: kw['spread'] = feet(sp)
                if det.get('growth'): kw['growthRate'] = RATE[det['growth'].lower()]
                c = cfg.get('details', {}).get('conditionsOverride', {}).get(latin, det.get('conditions'))
                if c:
                    sun, moi = conditions(c)
                    if sun: kw['sun'] = sun
                    if moi: kw['moisture'] = moi
                if det.get('foliage'): kw['foliage'] = det['foliage']
            add(latin, common, l['form'], pages, **kw)
    for h in rows['tables']:
        t = tables[h['table']]
        kw = {}
        rng = inches(h['height']) if h['height'] else None
        if rng: kw['height'] = feet(rng)
        sun = [v for k, v in SUN.items() if k in h['attrs']]
        moi = sorted({v for k, v in MOISTURE.items() if k in h['attrs']}, key=LEVELS.index)
        if sun: kw['sun'] = sun
        if moi: kw['moisture'] = moi
        if h['life'] in evergreen: kw['foliage'] = 'evergreen'
        bloom = {}
        if h['color']: bloom['colors'] = [c.lower() for c in h['color'].split()]
        if h['months']: bloom['months'] = {'start': min(h['months']), 'end': max(h['months'])}
        if bloom: kw['bloom'] = bloom
        form = lifeforms.get(h['life'], t['form'])
        add(h['latin'], h['common'], form, [h['page']], label=None if form in lifeforms.values() else t.get('summaryLabel'), **kw)
    for x in cfg.get('extra', []):
        kw = {'height': feet(x['heightInches'])} if 'heightInches' in x else {}
        add(x['latin'], x['common'], x['form'], [x['page']], **kw)
    for latin, o in cfg.get('overrides', {}).items():
        p = plants[latin]
        p['pages'] |= set(o.get('pages', []))
        if 'form' in o: p['form'] = o['form']
        if 'synonyms' in o: p['synonyms'] = o['synonyms']
    return plants


def write(f, e):
    with open(f, 'w') as h:
        json.dump(e, h, indent=2, ensure_ascii=False)
        h.write('\n')


def build(cfg_path, rows_path, root, accessed):
    cfg, rows = json.load(open(cfg_path)), json.load(open(rows_path))
    src, url = cfg['source'], cfg['citationUrl']
    order = list(json.load(open(f'{root}/schemas/plant.schema.json'))['properties'])
    same = cfg.get('sameAs', {})
    counts = {'new': 0, 'rewritten': 0, 'added to': 0}
    for latin, r in sorted(collect(cfg, rows).items()):
        ps = sorted(r['pages'])
        note = cfg['note'].format(pages=('pages ' if len(ps) > 1 else 'page ') + ', '.join(map(str, ps)))
        pid = same.get(latin, slug(latin.replace(' ssp. ', ' subsp. ')))
        f = f'{root}/content/plant/{pid}.json'
        old = json.load(open(f)) if os.path.exists(f) else None
        others = [c for c in (old or {'data': {'sources': []}})['data']['sources'] if c['source'] not in (src, 'placeholder')]
        if old and others:
            # Another source's entry: add a citation, a common name, a synonym,
            # and only the traits it leaves empty. Undo this source's last run first.
            d = old['data']
            prev = next((c for c in d['sources'] if c['source'] == src), None)
            if prev:
                for k in prev['fields']:
                    if k not in NAME_FIELDS and not any(k in c['fields'] for c in others):
                        d.pop(k, None)
            d['sources'] = others
            norm = lambda x: re.sub(r'[^a-z]', '', x.lower())
            if all(norm(c) != norm(r['common']) for c in d['commonNames']):
                d['commonNames'].append(r['common'])
            fields = ['commonNames']
            if latin in same:
                if latin not in d.setdefault('synonyms', []):
                    d['synonyms'].append(latin)
                fields.append('synonyms')
            for t in TRAITS:
                if t in r and t not in d and t != 'form':
                    d[t] = r[t]; fields.append(t)
            d['sources'].append({'source': src, 'url': url, 'accessed': accessed, 'fields': fields,
                                 'note': note + (f' Listed as {latin}.' if latin in same else '')})
            old['data'] = {k: d[k] for k in order if k in d}
            counts['added to'] += 1
            e = old
        else:
            d = name_parts(latin.replace(' ssp. ', ' subsp. '))
            d['commonNames'] = [r['common']]
            fields = ['commonNames']
            if r.get('synonyms'):
                d['synonyms'] = r['synonyms']; fields.append('synonyms')
            d['family'] = cfg.get('familyPlaceholder', 'Placeholderaceae')
            for t in TRAITS:
                if t in r:
                    d[t] = r[t]; fields.append(t)
            d['sources'] = [{'source': src, 'url': url, 'accessed': accessed, 'fields': fields, 'note': note},
                            {'source': 'placeholder', 'accessed': accessed, 'fields': ['family'], 'note': cfg['placeholderNote']}]
            e = {'type': 'plant', 'id': pid, 'summary': summary(d, r.get('label')), 'data': {k: d[k] for k in order if k in d},
                 'meta': {'createdAt': old['meta']['createdAt'] if old else accessed, 'revisedAt': accessed, 'method': 'import', 'fixture': True}}
            counts['rewritten' if old else 'new'] += 1
        if old is not None:
            # An unchanged entry keeps its dates.
            prior = json.load(open(f))
            strip = lambda x: json.dumps({**x, 'meta': {**x['meta'], 'revisedAt': ''}, 'data': {**x['data'], 'sources': [{**c, 'accessed': ''} for c in x['data']['sources']]}}, sort_keys=True)
            if strip(prior) == strip(e):
                continue
            e['meta']['revisedAt'] = accessed
        write(f, e)
    print(', '.join(f'{v} {k}' for k, v in counts.items()) + ' (unchanged entries are left as they were)')


if __name__ == '__main__':
    cmd, *args = sys.argv[1:] or ['']
    if cmd == 'extract' and len(args) == 2:
        extract(*args)
    elif cmd == 'build' and len(args) in (3, 4):
        import datetime
        build(args[0], args[1], args[2], args[3] if len(args) == 4 else datetime.date.today().isoformat())
    else:
        sys.exit(__doc__)
