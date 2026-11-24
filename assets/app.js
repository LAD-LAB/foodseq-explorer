/* FoodSeq Reference Database portal.
 * A static, client-side browser for one release of the database.
 * Data comes from data/core.js (window.FSDB) and data/seq-<marker>.js
 * (window.FSDB_SEQ), both written by build/build_site_data.py.
 */
(function () {
  'use strict';
  const D = window.FSDB;
  const main = document.getElementById('main');
  if (!D) {
    main.innerHTML = '<p class="notice">The database files (data/core.js) could not be loaded. Run <code>python build/build_site_data.py</code> first.</p>';
    return;
  }

  // ------------------------------------------------------------------ helpers
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const fmt = n => Number(n).toLocaleString('en-US');
  const pct = (a, b) => (b ? Math.round(100 * a / b) : 0) + '%';
  const enc = encodeURIComponent;
  const META = D.meta;
  const RANKS = D.ranks;
  const MARKERS = D.markers;
  const MK = Object.fromEntries(MARKERS.map(m => [m.id, m]));
  const mcls = id => (/^\d/.test(id) ? 'm' + id : id);
  const dot = () => '';
  const bytes = n => n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' kB';
  const doiUrl = d => 'https://doi.org/' + d;
  const citeDoi = META.version_doi || META.concept_doi;

  // Inside a Claude artifact the page is framed and may not start downloads
  // itself; files go through the viewer's save prompt instead, which accepts
  // only some extensions (so FASTA and TSV are saved as .txt there).
  const inViewer = !!(window.claude && window.claude.use);
  const SAVE_OK = /\.(txt|json|md|csv|zip|html|pdf)$/i;
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 4500);
  }
  async function download(name, data, type) {
    if (!inViewer) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain' }));
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return;
    }
    const saver = await window.claude.use('downloads');
    if (!saver) { toast('Saving files is not available in this view.'); return; }
    if (!SAVE_OK.test(name)) name += '.txt';
    try { await saver.save({ filename: name, data }); }
    catch (err) { if (!err || err.code !== 'declined') toast('The file could not be saved' + (err && err.code === 'rate_limited' ? '; try again in a moment.' : '.')); }
  }
  function copyText(text, btn) {
    const done = () => { if (btn) { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = t), 1200); } };
    const fallback = () => {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  const wrap80 = s => s.replace(/(.{80})(?=.)/g, '$1\n');
  const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', N: 'N' };
  const revcomp = s => { let o = ''; for (let i = s.length - 1; i >= 0; i--) o += COMP[s[i]] || 'N'; return o; };

  // ------------------------------------------------------------ taxonomy tree
  const LIN = D.lineages.map(s => s.split(';'));
  const root = { id: 0, name: 'All taxa', rank: -1, parent: null, kids: new Map(), n: {}, recs: {}, ctrl: 0 };
  const nodes = [root];
  const byName = new Map();
  const linLeaf = new Array(LIN.length);
  LIN.forEach((parts, i) => {
    let p = root, prev = null;
    const synth = parts[0] === parts[6];           // synthetic controls repeat one label at every rank
    parts.forEach((nm, r) => {
      if (nm === 'NA' || nm === prev) return;
      let k = p.kids.get(nm);
      if (!k) {
        k = { id: nodes.length, name: nm, rank: r, parent: p, kids: new Map(), n: {}, recs: {}, ctrl: 0, synth };
        p.kids.set(nm, k); nodes.push(k);
        const key = nm.toLowerCase();
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(k);
      }
      p = k; prev = nm;
    });
    linLeaf[i] = p;
  });
  for (const m of MARKERS) {
    const R = D.records[m.id];
    for (let i = 0; i < R.acc.length; i++) {
      const leaf = linLeaf[R.lin[i]];
      (leaf.recs[m.id] || (leaf.recs[m.id] = [])).push(i);
      for (let q = leaf; q; q = q.parent) q.n[m.id] = (q.n[m.id] || 0) + 1;
      if (R.ctrl[i]) { let q = leaf; while (q.rank > 6) q = q.parent; q.ctrl = R.ctrl[i]; }
    }
  }
  const total = n => MARKERS.reduce((a, m) => a + (n.n[m.id] || 0), 0);
  const rankName = n => n.synth ? 'control' : (n.rank < 0 ? '' : RANKS[n.rank]);
  const CTRL = { 1: 'Synthetic spike-in control', 2: 'Host (not a food)', 3: 'Non-food control' };
  function speciesCount(n) {
    if (n.sp != null) return n.sp;
    let c = n.rank === 6 ? 1 : 0;
    for (const k of n.kids.values()) c += speciesCount(k);
    return (n.sp = c);
  }
  function speciesIn(n, mid) {          // species under n that this marker holds
    if (!n.n[mid]) return 0;
    let c = n.rank === 6 ? 1 : 0;
    for (const k of n.kids.values()) c += speciesIn(k, mid);
    return c;
  }
  const longDate = iso => {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : (iso || '');
  };
  const lineageOf = n => { const out = []; for (let q = n; q && q.rank >= 0; q = q.parent) out.unshift(q); return out; };
  const findNode = name => { const a = byName.get(String(name).toLowerCase()); return a ? a[0] : null; };

  // food list <-> tree
  const FOODS = D.foods;
  const foodByName = new Map();
  FOODS.forEach(f => { if (!foodByName.has(f.s)) foodByName.set(f.s, f); });
  FOODS.forEach(f => { if (f.b && !foodByName.has(f.b)) foodByName.set(f.b, f); });
  const foodNode = f => findNode(f.s) || (f.b ? findNode(f.b) : null);
  const commonOf = n => { const f = foodByName.get(n.name); return f && f.c ? f.c : ''; };

  const tname = n => (n.rank >= 5 && !n.synth) ? `<i>${esc(n.name)}</i>` : esc(n.name);
  const turl = name => '#/taxon/' + enc(name);
  const tlink = n => `<a href="${turl(n.name)}">${tname(n)}</a>`;
  const rurl = (mid, rid) => `#/record/${mid}/${enc(rid)}`;
  const isNcbi = acc => /^[A-Z]{1,6}_?\d+(\.\d+)?$/.test(acc);
  const baseAcc = rid => rid.split('~')[0];
  const ridIndex = {};
  function recIndex(mid, rid) {
    if (!ridIndex[mid]) { ridIndex[mid] = new Map(); D.records[mid].acc.forEach((a, i) => ridIndex[mid].set(a, i)); }
    return ridIndex[mid].get(rid);
  }
  function collect(node, mid, out) {
    if (node.recs[mid]) for (const i of node.recs[mid]) out.push(i);
    for (const k of node.kids.values()) if (k.n[mid]) collect(k, mid, out);
    return out;
  }

  // ---------------------------------------------------------------- sequences
  const seqLoading = {};
  function loadSeq(mid) {
    if (window.FSDB_SEQ && window.FSDB_SEQ[mid]) return Promise.resolve(window.FSDB_SEQ[mid]);
    return seqLoading[mid] || (seqLoading[mid] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = `data/seq-${mid}.js`;
      s.onload = () => res(window.FSDB_SEQ[mid]);
      s.onerror = () => { delete seqLoading[mid]; rej(new Error('The sequence file for ' + MK[mid].name + ' could not be loaded.')); };
      document.head.appendChild(s);
    }));
  }
  function mism(a, b) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }
  // Where the amplicon between the primers starts and ends. trnL g/h and 12SV5
  // records include both primers; a few start 1-2 bases inside the forward
  // primer, and control records carry no primers at all.
  function primerSpan(seq, m) {
    let s = 0, e = seq.length;
    if (!m.primers_included) return [s, e];
    const f = m.fwd, r = revcomp(m.rev);
    for (let k = 0; k <= 2; k++) {
      const p = f.slice(k);
      if (seq.length > p.length && mism(seq.slice(0, p.length), p) <= Math.ceil(p.length * 0.25)) { s = p.length; break; }
    }
    for (let k = 0; k <= 2; k++) {
      const p = r.slice(0, r.length - k);
      if (seq.length - s > p.length && mism(seq.slice(seq.length - p.length), p) <= Math.ceil(p.length * 0.25)) { e = seq.length - p.length; break; }
    }
    return [s, e];
  }
  const coreIndex = {};
  function coreMap(mid) {       // amplicon between the primers -> record indices
    if (coreIndex[mid]) return coreIndex[mid];
    const S = window.FSDB_SEQ[mid], map = new Map();
    S.forEach((s, i) => {
      const [a, b] = primerSpan(s, MK[mid]);
      const c = s.slice(a, b);
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(i);
    });
    return (coreIndex[mid] = map);
  }
  function seqBlock(seq, span) {
    const [ps, pe] = span || [0, seq.length];
    let html = '';
    const w = String(seq.length).length;
    for (let i = 0; i < seq.length; i += 60) {
      html += `<span class="pos">${String(i + 1).padStart(w)}  </span>`;
      for (let j = i; j < Math.min(i + 60, seq.length); j += 10) {
        const end = Math.min(j + 10, seq.length);
        let k = j;
        while (k < end) {
          const inPr = k < ps || k >= pe;
          let stop = end;
          if (k < ps) stop = Math.min(end, ps); else if (k < pe) stop = Math.min(end, pe);
          html += inPr ? `<span class="pr">${seq.slice(k, stop)}</span>` : seq.slice(k, stop);
          k = stop;
        }
        html += ' ';
      }
      html += '\n';
    }
    return `<div class="seq" tabindex="0">${html}</div>`;
  }
  const fastaHead = (mid, i) => {
    const R = D.records[mid];
    return `>${baseAcc(R.acc[i])} ${linLeaf[R.lin[i]].name}`;
  };
  function lca(lins) {           // deepest node shared by every lineage index
    let chain = lineageOf(linLeaf[lins[0]]);
    for (let i = 1; i < lins.length && chain.length; i++) {
      const other = new Set(lineageOf(linLeaf[lins[i]]));
      let k = 0;
      while (k < chain.length && other.has(chain[k])) k++;
      chain = chain.slice(0, k);
    }
    return chain.length ? chain[chain.length - 1] : null;
  }

  // ------------------------------------------------------------------- search
  const nodeText = nodes.map(n => {
    if (n.rank < 0) return '';
    const f = foodByName.get(n.name);
    return (n.name + (f ? ' | ' + f.c + ' | ' + (f.a || '') + ' | ' + f.s : '')).toLowerCase();
  });
  const foodText = FOODS.map(f => (f.s + ' | ' + f.c + ' | ' + (f.a || '') + ' | ' + (f.b || '')).toLowerCase());
  function search(q, cap) {
    q = q.trim().toLowerCase();
    const out = { taxa: [], foods: [], records: [], omitted: [] };
    if (q.length < 2) return out;
    for (let i = 1; i < nodes.length; i++) {
      const t = nodeText[i], at = t.indexOf(q);
      if (at < 0) continue;
      const n = nodes[i], nm = n.name.toLowerCase();
      const score = nm === q ? 0 : nm.startsWith(q) ? 1 : (commonOf(n).toLowerCase() === q ? 1.5 : nm.includes(q) ? 2 : 3);
      out.taxa.push({ n, score });
    }
    out.taxa.sort((a, b) => a.score - b.score || a.n.rank - b.n.rank || total(b.n) - total(a.n) || a.n.name.localeCompare(b.n.name));
    for (let i = 0; i < FOODS.length; i++) {
      if (foodText[i].includes(q) && !foodNode(FOODS[i])) out.foods.push(FOODS[i]);
    }
    const qa = q.toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z_0-9.~]{3,}$/.test(qa)) {
      for (const m of MARKERS) {
        const A = D.records[m.id].acc;
        for (let i = 0; i < A.length; i++) if (A[i].toUpperCase().startsWith(qa)) out.records.push({ mid: m.id, i });
      }
      out.omitted = D.omitted.filter(o => o.acc.toUpperCase().startsWith(qa));
    }
    if (cap) { out.taxa = out.taxa.slice(0, cap); out.records = out.records.slice(0, cap); out.foods = out.foods.slice(0, cap); }
    return out;
  }

  // -------------------------------------------------------------------- views
  const views = {};
  const state = { expanded: new Set(), browseMarker: '' };
  function setTitle(t) { document.title = (t ? t + ' · ' : '') + 'Edible Atlas FoodSeq'; }
  const crumbs = items => `<nav class="crumbs" aria-label="Breadcrumb">${items.join(' <span class="sep">›</span> ')}</nav>`;
  const countCells = (n, cls) => MARKERS.map(m => {
    const v = n.n[m.id] || 0;
    return `<td class="num ${v ? '' : 'zero'} ${cls || ''}">${v ? fmt(v) : '–'}</td>`;
  }).join('');
  const markerHeads = () => MARKERS.map(m => `<th class="num">${dot(m.id)}${esc(m.name)}</th>`).join('');
  function covCell(m) {
    const c = m.coverage;
    if (!c || !c.targets) return '';
    const share = c.with_synonyms / c.targets;
    return `<div class="cov"><span class="bar" role="img" aria-label="${pct(c.with_synonyms, c.targets)}"><i style="width:${100 * share}%"></i></span><span class="num">${pct(c.with_synonyms, c.targets)}</span></div>
      <div class="small muted">${fmt(c.with_synonyms)} of ${fmt(c.targets)} food ${m.food_category}s</div>`;
  }

  // ---- start page: one search box over the food records, a short "what is this", live counts
  views.welcome = function () {
    document.title = 'Edible Atlas FoodSeq: what do people eat around the world?';
    main.innerHTML = `
      <section class="hero">
        <div class="hero-text">
          <h1>What do people eat around the world?</h1>
          <p class="lead">Search foods reported in published studies, and see where they come from.</p>
          <form class="home-search" id="homeSearch" role="search" autocomplete="off">
            <label class="vh" for="homeQ">Search any food</label>
            <svg class="hs-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <input id="homeQ" type="search" placeholder="Search any food" autocomplete="off">
            <button type="submit" class="btn primary">Search</button>
            <div class="suggest" hidden></div>
          </form>
          <p class="try" id="homeTry"></p>
        </div>
        <a class="hero-map" id="heroMap" href="#/explorer" aria-label="World map of where food records come from: open the Food Explorer"></a>
      </section>
      <section class="paths" aria-label="Where to go next">
        <a href="#/explorer"><i class="pi" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3.2 3 13.8 0 17M12 3.5c-3 3.2-3 13.8 0 17"/></svg></i><span><b>Explore the map</b><span>What has been reported where</span></span></a>
        <a href="#/explorer?view=table"><i class="pi" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".6"/><circle cx="4.8" cy="12" r=".6"/><circle cx="4.8" cy="17.5" r=".6"/></svg></i><span><b>Browse all records</b><span>Filter and download</span></span></a>
        <a href="#/database"><i class="pi" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3.5c0 6 10 11 10 17M17 3.5c0 6-10 11-10 17M8.2 7.5h7.6M8.2 16.5h7.6M10 12h4"/></svg></i><span><b>For DNA researchers</b><span>Reference sequences and tools</span></span></a>
      </section>
      <section class="about-band" aria-labelledby="inNumbers">
        <h2 id="inNumbers">The food records so far</h2>
        <dl class="bignums" id="homeNums">
          <div><dt>records</dt><dd>&hellip;</dd></div>
          <div><dt>species</dt><dd>&hellip;</dd></div>
          <div><dt>sources</dt><dd>&hellip;</dd></div>
        </dl>
      </section>
      <section class="about-pair" aria-label="About Edible Atlas and FoodSeq">
        <article aria-labelledby="whatIs">
          <h2 id="whatIs">What is Edible Atlas?</h2>
          <p>Edible Atlas is a research group at Duke University that is mapping what the world eats, and what it means. We use DNA sequencing, computational biology and large-scale data to study human diet, not only as an input to health but as a window into culture, economics and how communities live.</p>
          <p>Our work includes dietary measurement (FoodSeq), citizen science (Everyone EATS) and urban food systems.</p>
          <p class="more"><a href="https://edibleatlas.org/" rel="noopener" target="_blank">Visit edibleatlas.org <span aria-hidden="true">&rarr;</span></a></p>
        </article>
        <article aria-labelledby="whatIsFoodSeq">
          <h2 id="whatIsFoodSeq">What is FoodSeq?</h2>
          <p>FoodSeq is our method for finding out what someone has eaten from the traces of plant and animal DNA that survive digestion. We sequence short, variable stretches of that DNA from a stool sample and match them to a library of reference sequences from food species.</p>
          <p>It gives an objective snapshot of diet that does not rely on memory or food diaries. This site holds that reference library, and the food records that show which foods have been reported where.</p>
          <p class="more"><a href="https://edibleatlas.org/foodseq" rel="noopener" target="_blank">About FoodSeq <span aria-hidden="true">&rarr;</span></a> <a href="https://lad-lab.github.io/" rel="noopener" target="_blank">FoodSeq Handbook <span aria-hidden="true">&rarr;</span></a></p>
        </article>
      </section>`;

    const form = $('#homeSearch'), input = $('#homeQ'), box = $('.suggest', form);
    let names = [], on = -1;
    const close = () => { box.hidden = true; on = -1; };
    const go = q => { location.hash = '#/explorer?q=' + enc(q); };
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2 || !names.length) return close();
      const hits = [];
      for (const n of names) {
        const at = n.t.indexOf(q);
        if (at < 0) continue;
        hits.push({ n, score: (n.s.toLowerCase().startsWith(q) || n.c.toLowerCase().startsWith(q) ? 0 : at === 0 ? 1 : 2), at });
      }
      hits.sort((a, b) => a.score - b.score || b.n.k - a.n.k || a.n.s.localeCompare(b.n.s));
      const top = hits.slice(0, 6).map(h => h.n);
      box.innerHTML = top.map(n => `<a href="#/explorer?q=${enc(n.s)}"><span>${n.c ? esc(n.c) + ' ' : ''}<i>${esc(n.s)}</i></span><span class="k">${fmt(n.k)} record${n.k === 1 ? '' : 's'}</span></a>`).join('') +
        `<a class="all" href="#/explorer?q=${enc(input.value.trim())}"><span>All records matching &ldquo;${esc(input.value.trim())}&rdquo;</span></a>`;
      box.hidden = false; on = -1;
    };
    input.addEventListener('input', draw);
    input.addEventListener('focus', draw);
    input.addEventListener('keydown', e => {
      const links = $$('a', box);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (box.hidden) return;
        e.preventDefault();
        on = (on + (e.key === 'ArrowDown' ? 1 : -1) + links.length + 1) % (links.length + 1);
        links.forEach((a, i) => a.classList.toggle('on', i === on));
      } else if (e.key === 'Escape') close();
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const links = $$('a', box);
      if (!box.hidden && on >= 0 && links[on]) location.hash = links[on].getAttribute('href');
      else go(input.value.trim());
      close();
    });
    box.addEventListener('click', close);
    document.addEventListener('click', function off(e) {
      if (!form.isConnected) return document.removeEventListener('click', off);
      if (!form.contains(e.target)) close();
    });

    // The food records load in the background (a few MB); the page is usable before they arrive.
    Promise.all([loadGlobalFoods(), loadSources()]).then(([data, SRC]) => {
      if (!form.isConnected) return;
      const byName = new Map();
      for (const r of data.records) {
        const e = byName.get(r.s);
        if (e) e.k++; else byName.set(r.s, { s: r.s, c: r.c || '', k: 1 });
      }
      names = [...byName.values()].map(n => Object.assign(n, { t: (n.s + ' | ' + n.c).toLowerCase() }));
      // The start-page map: the same country shading as the Explorer map, drawn once the records have arrived.
      const per = {};
      for (const r of data.records) for (const c of (r.cc || [])) per[c] = (per[c] || 0) + 1;
      const top = Math.max(1, ...Object.values(per));
      loadWorld().then(W => {
        const hm = $('#heroMap');
        if (!hm || !hm.isConnected) return;
        hm.innerHTML = `<svg viewBox="0 0 ${W.w} ${W.h}" role="img" aria-hidden="true"><path class="land" d="${W.base}"></path>${
          Object.entries(W.countries).map(([c, v]) => per[c] ? `<path class="ctry has" style="fill-opacity:${(0.2 + 0.78 * Math.sqrt(per[c] / top)).toFixed(2)}" d="${v.d}"></path>` : '').join('')}</svg>`;
      }).catch(() => { /* the map is decoration; the page works without it */ });
      const nums = [data.meta.total_records, data.meta.unique_species, Object.keys(SRC).length];
      $$('#homeNums dd').forEach((el, i) => { el.textContent = fmt(nums[i]); });
      const ex = ['quinoa', 'kimchi', 'teff', 'cassava', 'salmon', 'Vicia faba'].filter(x => names.some(n => n.t.includes(x.toLowerCase()))).slice(0, 4);
      if (ex.length) $('#homeTry').innerHTML = 'Try ' + ex.map(x => `<a href="#/explorer?q=${enc(x)}">${esc(x)}</a>`).join(', ');
      if (document.activeElement === input) draw();
    }).catch(() => {
      if (form.isConnected) $('#homeTry').textContent = 'The food records could not be loaded. Search will still open the Food Explorer.';
    });
  };

  // ---- how to cite
  views.cite = function () {
    setTitle('How to cite');
    main.innerHTML = `
      <h1>How to cite</h1>
      <h2>The reference sequences</h2>
      ${citeBox()}
      <h2>The food records</h2>
      <p>Each record in the Food Explorer comes from one published source under an open licence. If you reuse a record, please cite the source paper shown on its record page and listed in the <a href="#/sources">Sources</a> table, as well as the Edible Atlas.</p>`;
  };

  // ---- reference database (the original start page)
  views.database = views.home = function () {
    setTitle('Reference database');
    const nRec = MARKERS.reduce((a, m) => a + m.records, 0);
    const eg = ['Triticum aestivum', 'salmon', 'Rosaceae', D.records[MARKERS[0].id].acc[1]]
      .map(x => `<a href="#/search?q=${enc(x)}">${esc(x)}</a>`).join(', ');
    const row = (label, fn, cls) => `<tr><th scope="row">${label}</th>${MARKERS.map(m => `<td class="${cls || ''}">${fn(m)}</td>`).join('')}</tr>`;
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    const PLURAL = { class: 'Classes', order: 'Orders', family: 'Families', genus: 'Genera', species: 'Species' };
    const atRank = (r, mid) => nodes.filter(n => n.rank === r && n.n[mid] && !n.synth).length;
    main.innerHTML = `
    <div class="cols">
      <div>
        <h1>${esc(META.title)}</h1>
        <p class="lead">Reference sequences for identifying food species from DNA in dietary metabarcoding studies. The database holds the chloroplast <i>trnL</i> (UAA) intron for food plants and the mitochondrial 12S rRNA V5 region for food animals, compiled from NCBI RefSeq and GenBank for a curated list of ${fmt(FOODS.length)} food taxa and formatted for DADA2 and QIIME 2.</p>
        <form class="searchpanel" id="heroSearch" role="search" autocomplete="off">
          <label for="heroQ">Search by scientific name, common name or accession</label>
          <div class="row"><input id="heroQ" type="search"><button class="btn primary">Search</button></div>
          <p class="small muted">Examples: ${eg}</p>
        </form>
      </div>
      <aside class="box" aria-label="Current release">
        <h2>Current release</h2>
        <div class="box-b">
          <dl class="kv">
            <dt>Version</dt><dd>${esc(META.version)}</dd>
            <dt>Released</dt><dd>${esc(longDate(META.release_date))}</dd>
            <dt>Sequences</dt><dd class="num">${fmt(nRec)} in ${MARKERS.length} databases</dd>
            <dt>Food list</dt><dd class="num">${fmt(FOODS.length)} taxa</dd>
            <dt>License</dt><dd><a href="${esc(META.license_url)}" rel="noopener">${esc(META.license)}</a></dd>
            <dt>DOI</dt><dd><a href="${doiUrl(citeDoi)}" rel="noopener">${esc(citeDoi)}</a></dd>
          </dl>
          <p style="margin-top:10px"><a href="#/downloads">Download files</a> | <a href="#/about">Methods and limitations</a></p>
        </div>
      </aside>
    </div>

    <h2>Databases in release ${esc(META.version)}</h2>
    <div class="tablewrap"><table class="matrix"><thead><tr><th></th>${MARKERS.map(m => `<th scope="col">${esc(m.name)}</th>`).join('')}</tr></thead><tbody>
      ${row('Target', m => cap(m.target))}
      ${row('Region', m => cap(m.region))}
      ${row('Forward primer', m => `${esc(m.fwd_name)} <span class="mono">${esc(m.fwd)}</span>`)}
      ${row('Reverse primer', m => `${esc(m.rev_name)} <span class="mono">${esc(m.rev)}</span>`)}
      ${row('Sequences', m => fmt(m.records), 'num')}
      ${row('Species', m => fmt(m.species), 'num')}
      ${row('Length, bp', m => `${m.len_min} to ${m.len_max} (median ${m.len_median})`, 'num')}
      ${row('Primers', m => m.primers_included ? 'Included in each sequence' : 'Trimmed')}
      ${row('Food-list coverage', covCell)}
    </tbody></table></div>
    <p class="small muted" style="margin-top:6px">Coverage is the share of species-level entries on the <a href="#/foods">food list</a> with at least one sequence, counting species held under an NCBI synonym. trnL targets plants; 12SV5 targets vertebrates.</p>

    <div class="cols" style="margin-top:28px">
      <div>
        <h2>Taxa represented</h2>
        <div class="tablewrap"><table><thead><tr><th>Rank</th>${MARKERS.map(m => `<th class="num">${esc(m.name)}</th>`).join('')}</tr></thead><tbody>
          ${[2, 3, 4, 5, 6].map(r => `<tr><th scope="row">${PLURAL[RANKS[r]] || cap(RANKS[r])}</th>${MARKERS.map(m => `<td class="num">${fmt(atRank(r, m.id))}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
        <p class="small muted" style="margin-top:6px">Counts include the non-food host and control taxa added to every build. <a href="#/browse">Open the taxonomy browser</a>.</p>
      </div>
    </div>

    <h2>How to cite</h2>
    ${citeBox()}
    `;
    $('#heroSearch').addEventListener('submit', e => {
      e.preventDefault();
      const q = $('#heroQ').value.trim();
      if (q) location.hash = '#/search?q=' + enc(q);
    });
  };
  function citation() {
    return `${META.citation_authors} (${META.citation_year}). FoodSeq Reference Database (Version ${META.version}) [Dataset]. Zenodo. ${doiUrl(citeDoi)}`;
  }
  function citeBox() {
    return `<div class="cite"><p>${esc(META.citation_authors)} (${esc(META.citation_year)}). <i>FoodSeq Reference Database</i> (Version ${esc(META.version)}) [Dataset]. Zenodo. <a href="${doiUrl(citeDoi)}">${doiUrl(citeDoi)}</a></p>
      <div class="btn-row"><button class="btn sm" data-copy="${esc(citation())}">Copy citation</button>
      ${META.version_doi ? '' : '<span class="small muted">This DOI always resolves to the latest version.</span>'}</div></div>`;
  }

  // ---- browse
  views.browse = function () {
    setTitle('Taxonomy');
    if (!state.expanded.size) {            // open the first two levels by default
      for (const k of root.kids.values()) { state.expanded.add(k.id); for (const kk of k.kids.values()) state.expanded.add(kk.id); }
    }
    main.innerHTML = `
      <h1>Taxonomy browser</h1>
      <p class="lead">Foods grouped like a family tree, from broad groups (such as plants and animals) down to single species. Open a branch with + to see how many reference DNA sequences each DNA region holds for it, and select a name to see its records.</p>
      <div class="toolbar">
        <form id="bsearch" role="search" class="toolbar" style="margin:0;flex:1;min-width:240px"><input class="grow" type="search" id="bq" placeholder="Find a species, common name or accession" aria-label="Search the reference database"><button class="btn primary">Search</button></form>
        <label>Show <select id="bm"><option value="">all DNA regions</option>${MARKERS.map(m => `<option value="${m.id}" ${state.browseMarker === m.id ? 'selected' : ''}>${esc(m.name)} only</option>`).join('')}</select></label>
        <button class="btn sm" id="collapse">Collapse all</button>
      </div>
      <div class="tablewrap"><table class="tree"><thead><tr><th>Taxon</th><th class="num hide-sm">Species</th>${markerHeads()}</tr></thead><tbody id="treeBody"></tbody></table></div>`;
    const body = $('#treeBody');
    const draw = () => {
      const rows = [];
      const walk = (node, depth) => {
        const kids = [...node.kids.values()].filter(k => !state.browseMarker || k.n[state.browseMarker])
          .sort((a, b) => (a.synth - b.synth) || a.name.localeCompare(b.name));
        for (const k of kids) {
          const open = state.expanded.has(k.id), leaf = !k.kids.size;
          const cn = commonOf(k);
          rows.push(`<tr><td style="padding-left:${12 + depth * 20}px">
            <button class="tw ${leaf ? 'leaf' : ''}" data-node="${k.id}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(k.name)}">${open ? '−' : '+'}</button>
            ${tlink(k)}<span class="rk">${rankName(k)}</span>${cn ? `<span class="cn hide-sm">${esc(cn)}</span>` : ''}${k.ctrl && !k.synth ? ` <span class="badge ctrl">${k.ctrl === 2 ? 'host' : 'control'}</span>` : ''}</td>
            <td class="num hide-sm">${k.rank < 6 && !k.synth ? fmt(speciesCount(k)) : ''}</td>${countCells(k)}</tr>`);
          if (open) walk(k, depth + 1);
        }
      };
      walk(root, 0);
      body.innerHTML = rows.join('');
    };
    draw();
    body.addEventListener('click', e => {
      const b = e.target.closest('.tw');
      if (!b) return;
      const id = +b.dataset.node;
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      draw();
      const again = $(`.tw[data-node="${id}"]`, body);
      if (again) again.focus();
    });
    $('#bm').addEventListener('change', e => { state.browseMarker = e.target.value; draw(); });
    $('#bsearch').addEventListener('submit', e => { e.preventDefault(); const q = $('#bq').value.trim(); if (q) location.hash = '#/search?q=' + enc(q); });
    $('#collapse').addEventListener('click', () => { state.expanded.clear(); state.expanded.add(-1); draw(); });
  };

  // ---- taxon
  views.taxon = function (seg) {
    const name = seg[1] || '';
    const node = findNode(name);
    if (!node) {
      const f = foodByName.get(name) || FOODS.find(x => x.s.toLowerCase() === name.toLowerCase());
      setTitle(name);
      main.innerHTML = `${crumbs(['<a href="#/browse">Taxonomy</a>'])}<h1>${esc(name)}</h1>` + (f
        ? `<div class="notice"><b>On the food list, but not in the reference.</b> ${esc(f.s)}${f.c ? ' (' + esc(f.c) + ')' : ''} is a target of the database, but no public sequence spanning the primer sites could be used for it in release ${esc(META.version)}. Reads from this species will be assigned to a relative or to a higher rank.</div>${foodCard(f)}`
        : `<p class="lead">No taxon of this name is in release ${esc(META.version)}.</p><p><a href="#/search?q=${enc(name)}">Search for “${esc(name)}”</a></p>`);
      return;
    }
    setTitle(node.name);
    const chain = lineageOf(node);
    const food = foodByName.get(node.name);
    const cn = commonOf(node);
    const kids = [...node.kids.values()].sort((a, b) => a.name.localeCompare(b.name));
    const others = (byName.get(node.name.toLowerCase()) || []).length > 1;
    const present = MARKERS.filter(m => node.n[m.id]);
    let active = present.length ? present[0].id : null;
    const LIMIT = 100;
    let shown = LIMIT;

    main.innerHTML = `
      ${crumbs(['<a href="#/database">Reference database</a>', '<a href="#/browse">Taxonomy</a>', esc(node.name)])}
      <h1 class="taxon-title">${tname(node)}<span class="rank">${rankName(node)}</span></h1>
      ${cn ? `<p class="common">${esc(cn)}${food && food.a ? `; also ${esc(food.a)}` : ''}</p>` : ''}
      ${chain.length > 1 ? `<p class="lineage"><b>Lineage:</b> ${chain.slice(0, -1).map(tlink).join('; ')}</p>` : ''}
      <p class="tags">${food ? `<span class="tag food">Food list: ${esc(food.k)}</span>` : ''}${node.ctrl ? `<span class="tag ctrl">${CTRL[node.ctrl]}</span>` : ''}</p>
      ${node.ctrl ? `<div class="notice">This is not a food. It is included so that control and host reads are recognised instead of being assigned to the nearest food species. See <a href="#/about">About, Controls and host taxa</a>.</div>` : ''}
      ${others ? `<p class="small muted">More than one node in the tree carries this name; the highest-ranked is shown.</p>` : ''}
      <div class="cols">
        <div>
          <h2>Sequences in release ${esc(META.version)}</h2>
          <div class="tablewrap"><table><thead><tr><th>Database</th><th class="num">Sequences</th>${node.rank < 6 && !node.synth ? '<th class="num">Species</th>' : ''}</tr></thead><tbody>
            ${MARKERS.map(m => `<tr><th scope="row">${esc(m.name)}</th><td class="num ${node.n[m.id] ? '' : 'zero'}">${fmt(node.n[m.id] || 0)}</td>${node.rank < 6 && !node.synth ? `<td class="num ${node.n[m.id] ? '' : 'zero'}">${fmt(speciesIn(node, m.id))}</td>` : ''}</tr>`).join('')}
          </tbody></table></div>
        </div>
        <div></div>
      </div>
      ${food ? `<h2>Food list entry</h2>${foodCard(food, node)}` : ''}
      ${kids.length ? `<h2>${node.rank >= 6 ? 'Infraspecific taxa' : 'Taxa in this ' + rankName(node)}</h2>
        <div class="tablewrap"><table><thead><tr><th>Taxon</th><th>Common name</th><th class="num hide-sm">Species</th>${markerHeads()}</tr></thead><tbody>
        ${kids.map(k => `<tr><td>${tlink(k)}<span class="rk">${rankName(k)}</span></td><td>${esc(commonOf(k))}</td><td class="num hide-sm">${k.rank < 6 ? fmt(speciesCount(k)) : ''}</td>${countCells(k)}</tr>`).join('')}
        </tbody></table></div>` : ''}
      <h2>Reference sequences</h2>
      ${present.length ? `<div class="toolbar"><div class="tabs" id="mtabs">${present.map(m => `<button class="tab" data-m="${m.id}" aria-pressed="${m.id === active}">${dot(m.id)}${esc(m.name)} <span class="num">${fmt(node.n[m.id])}</span></button>`).join('')}</div>
        <span class="grow"></span><button class="btn sm" id="dlFasta">Download FASTA</button></div>
        <div class="tablewrap"><table><thead><tr><th>Accession</th><th>Taxon</th><th class="num">Length</th></tr></thead><tbody id="recBody"></tbody></table></div>
        <div class="pager" id="recMore"></div>` : '<p class="muted">No sequences.</p>'}
    `;
    if (!present.length) return;
    const drawRecs = () => {
      const R = D.records[active];
      const idx = collect(node, active, []);
      $('#recBody').innerHTML = idx.slice(0, shown).map(i => {
        const leaf = linLeaf[R.lin[i]];
        return `<tr><td><a class="mono" href="${rurl(active, R.acc[i])}">${esc(baseAcc(R.acc[i]))}</a></td><td>${tlink(leaf)}${commonOf(leaf) ? `<span class="cn">${esc(commonOf(leaf))}</span>` : ''}</td><td class="num">${R.len[i]} bp</td></tr>`;
      }).join('');
      $('#recMore').innerHTML = idx.length > shown
        ? `<span>Showing ${fmt(shown)} of ${fmt(idx.length)}</span><button class="btn sm" id="more">Show ${fmt(Math.min(500, idx.length - shown))} more</button>` : '';
      const more = $('#more');
      if (more) more.addEventListener('click', () => { shown += 500; drawRecs(); });
    };
    drawRecs();
    $('#mtabs').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (!b) return;
      active = b.dataset.m; shown = LIMIT;
      $$('.tab', $('#mtabs')).forEach(t => t.setAttribute('aria-pressed', t === b));
      drawRecs();
    });
    $('#dlFasta').addEventListener('click', async e => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const S = await loadSeq(active);
        const idx = collect(node, active, []);
        download(`${node.name.replace(/[^\w.-]+/g, '_')}_${active}_v${META.version}.fasta`,
          idx.map(i => fastaHead(active, i) + '\n' + wrap80(S[i])).join('\n') + '\n');
      } catch (err) { toast(err.message); }
      btn.disabled = false;
    });
  };
  function foodCard(f, node) {
    const rows = [
      ['Listed as', `<i>${esc(f.s)}</i>`],
      f.b ? ['Name used in the reference', `<i>${esc(f.b)}</i> <span class="muted">(NCBI files its sequences under this name)</span>`] : null,
      f.c ? ['Common name', esc(f.c)] : null,
      f.a ? ['Other names', esc(f.a)] : null,
      ['Category', esc(f.k)],
      f.reg ? ['Region', esc(f.reg)] : null,
      f.use ? ['Use', esc(f.use)] : null,
      f.src ? ['Source of the entry', esc(f.src)] : null,
    ].filter(Boolean);
    return `<div class="tablewrap"><table class="kvt"><tbody>${rows.map(r => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---- record
  views.record = async function (seg) {
    const mid = seg[1], rid = seg[2] || '';
    const m = MK[mid];
    const i = m ? recIndex(mid, rid) : undefined;
    if (i === undefined) {
      setTitle('Record not found');
      const om = D.omitted.find(o => o.acc === baseAcc(rid));
      main.innerHTML = `<h1>Record not found</h1>` + (om ? omittedNote(om)
        : `<p class="lead">No record <code>${esc(rid)}</code> in ${m ? esc(m.name) : 'this release'}.</p><p><a href="#/search?q=${enc(rid)}">Search for it</a></p>`);
      return;
    }
    const R = D.records[mid];
    const leaf = linLeaf[R.lin[i]];
    const acc = baseAcc(rid);
    setTitle(acc + ' · ' + leaf.name);
    const chain = lineageOf(leaf);
    const elsewhere = MARKERS.filter(x => x.id !== mid).map(x => {
      const j = recIndex(x.id, acc);
      return j === undefined ? '' : `<a href="${rurl(x.id, acc)}">${esc(x.name)}</a>`;
    }).filter(Boolean);
    main.innerHTML = `
      ${crumbs(['<a href="#/database">Reference database</a>', '<a href="#/browse">Taxonomy</a>', tlink(leaf), esc(acc)])}
      <h1 class="mono">${esc(acc)}</h1>
      <p class="common">${tname(leaf)}${commonOf(leaf) ? ' (' + esc(commonOf(leaf)) + ')' : ''}, ${esc(m.name)} reference sequence</p>
      <div class="tablewrap" style="margin-top:14px"><table class="kvt"><tbody>
        <tr><th scope="row">Accession</th><td>${isNcbi(acc) ? `<a href="https://www.ncbi.nlm.nih.gov/nuccore/${enc(acc)}" rel="noopener">${esc(acc)}</a> <span class="muted">at NCBI Nucleotide</span>` : `${esc(acc)} <span class="muted">(not an NCBI accession)</span>`}</td></tr>
        <tr><th scope="row">Organism</th><td>${tlink(leaf)}${commonOf(leaf) ? `<span class="cn">${esc(commonOf(leaf))}</span>` : ''}${R.ctrl[i] ? ` <span class="tag ctrl">${CTRL[R.ctrl[i]]}</span>` : ''}</td></tr>
        <tr><th scope="row">Lineage</th><td>${chain.map(n => `<span title="${rankName(n)}">${tlink(n)}</span>`).join('; ')}</td></tr>
        <tr><th scope="row">Database</th><td>${esc(m.name)}: ${esc(m.region)}</td></tr>
        <tr><th scope="row">Length</th><td class="num" style="text-align:left">${R.len[i]} bp<span id="gc" class="muted"></span></td></tr>
        ${elsewhere.length ? `<tr><th scope="row">Also in</th><td>${elsewhere.join(', ')}</td></tr>` : ''}
        <tr><th scope="row">Release</th><td>${esc(META.version)}</td></tr>
      </tbody></table></div>
      <h2>Sequence</h2>
      <div id="seqArea"><p class="muted">Loading sequence…</p></div>
      <div id="shared"></div>`;
    let S;
    try { S = await loadSeq(mid); } catch (err) { $('#seqArea').innerHTML = `<p class="notice">${esc(err.message)}</p>`; return; }
    if (!$('#seqArea')) return;                      // navigated away while loading
    const seq = S[i];
    const span = primerSpan(seq, m);
    const hasPr = span[0] > 0 || span[1] < seq.length;
    const gc = (seq.match(/[GC]/g) || []).length;
    $('#gc').textContent = `, ${Math.round(100 * gc / seq.length)}% GC`;
    $('#seqArea').innerHTML = `
      ${seqBlock(seq, span)}
      <div class="toolbar"><div class="legend">${hasPr
        ? `<span><span class="sw"></span>primer sites (${esc(m.fwd_name)}, reverse complement of ${esc(m.rev_name)})</span><span>amplicon between primers: ${span[1] - span[0]} bp</span>`
        : `<span>${m.primers_included ? 'No primer sites in this record.' : 'Primer-trimmed, oriented ' + esc(m.fwd_name) + ' → ' + esc(m.rev_name) + '.'}</span>`}</div>
        <span class="grow"></span>
        <button class="btn sm" id="cpSeq">Copy sequence</button><button class="btn sm" id="dlRec">Download FASTA</button></div>`;
    $('#cpSeq').addEventListener('click', e => copyText(seq, e.currentTarget));
    $('#dlRec').addEventListener('click', () => download(`${acc}_${mid}.fasta`, fastaHead(mid, i) + '\n' + wrap80(seq) + '\n'));

    // Other records with the same amplicon: the limit of what this marker can resolve.
    const same = coreMap(mid).get(seq.slice(span[0], span[1])).filter(j => j !== i);
    if (same.length) {
      const taxa = new Map();
      same.forEach(j => { const n = linLeaf[R.lin[j]]; if (!taxa.has(n)) taxa.set(n, []); taxa.get(n).push(j); });
      const anc = lca(same.concat([i]).map(j => R.lin[j]));
      const otherTaxa = [...taxa.keys()].filter(n => n !== leaf).length;
      $('#shared').innerHTML = `<h2>Records with an identical amplicon</h2>
        <p>${fmt(same.length)} other ${esc(m.name)} record${same.length > 1 ? 's have' : ' has'} exactly the same sequence${m.primers_included ? ' between the primers' : ''}${otherTaxa ? `, from ${fmt(otherTaxa)} other tax${otherTaxa > 1 ? 'a' : 'on'}` : ', all from this taxon'}.
        ${otherTaxa && anc ? `A read with this sequence cannot be resolved below ${rankName(anc)} <b>${tlink(anc)}</b> with this marker.` : ''}</p>
        <div class="tablewrap"><table><thead><tr><th>Taxon</th><th>Common name</th><th>Records</th></tr></thead><tbody>
        ${[...taxa.entries()].sort((a, b) => a[0].name.localeCompare(b[0].name)).map(([n, js]) => `<tr><td>${tlink(n)}</td><td>${esc(commonOf(n))}</td><td>${js.map(j => `<a class="mono" href="${rurl(mid, R.acc[j])}">${esc(baseAcc(R.acc[j]))}</a>`).join(', ')}</td></tr>`).join('')}
        </tbody></table></div>`;
    } else {
      $('#shared').innerHTML = `<h2>Records with an identical amplicon</h2><p class="muted">None. No other ${esc(m.name)} record in this release has the same sequence${m.primers_included ? ' between the primers' : ''}.</p>`;
    }
  };
  function omittedNote(o) {
    return `<div class="notice"><b>${esc(o.acc)} was removed from the database.</b> It is labelled <i>${esc(o.labelled)}</i> at NCBI, but the sequence is ${esc(o.actually)}. ${esc(o.evidence)}. <span class="muted">Checked ${esc(o.checked)}; removed from ${esc(o.markers.replace(/;|,/g, ', '))}.</span></div>`;
  }

  // ---- search
  views.search = function (seg, params) {
    const q = (params.get('q') || '').trim();
    setTitle(q ? 'Search: ' + q : 'Search');
    const r = search(q);
    const n = r.taxa.length + r.records.length + r.foods.length + r.omitted.length;
    const CAP = 200;
    main.innerHTML = `<h1>Search</h1>
      <form class="toolbar" id="sform" role="search"><input class="grow" type="search" id="sq" value="${esc(q)}" placeholder="Species, common name or accession" aria-label="Search"><button class="btn primary">Search</button></form>
      ${q.length < 2 ? '<p class="muted">Enter at least two characters.</p>' : n === 0 ? `<div class="card empty">Nothing in release ${esc(META.version)} matches “${esc(q)}”. Names follow NCBI Taxonomy; try the genus, or a common name.</div>` : ''}
      ${r.omitted.map(omittedNote).join('')}
      ${r.records.length ? `<h2>Records <span class="muted num">${fmt(r.records.length)}</span></h2>
        <div class="tablewrap"><table><thead><tr><th>Accession</th><th>DNA region</th><th>Taxon</th><th class="num">Length</th></tr></thead><tbody>
        ${r.records.slice(0, CAP).map(x => { const R = D.records[x.mid], leaf = linLeaf[R.lin[x.i]]; return `<tr><td><a class="mono" href="${rurl(x.mid, R.acc[x.i])}">${esc(baseAcc(R.acc[x.i]))}</a></td><td>${dot(x.mid)} ${esc(MK[x.mid].name)}</td><td>${tlink(leaf)}</td><td class="num">${R.len[x.i]} bp</td></tr>`; }).join('')}
        </tbody></table></div>` : ''}
      ${r.taxa.length ? `<h2>Taxa in the reference <span class="muted num">${fmt(r.taxa.length)}</span></h2>
        <div class="tablewrap"><table><thead><tr><th>Taxon</th><th>Common name</th><th class="hide-sm">Family</th>${markerHeads()}</tr></thead><tbody>
        ${r.taxa.slice(0, CAP).map(({ n }) => { const fam = lineageOf(n).find(x => x.rank === 4); return `<tr><td>${tlink(n)}<span class="rk">${rankName(n)}</span></td><td>${esc(commonOf(n))}</td><td class="hide-sm">${fam && fam !== n ? tlink(fam) : ''}</td>${countCells(n)}</tr>`; }).join('')}
        </tbody></table></div>${r.taxa.length > CAP ? `<p class="small muted">Showing the first ${CAP}. Narrow the search to see the rest.</p>` : ''}` : ''}
      ${r.foods.length ? `<h2>On the food list, not yet in the reference <span class="muted num">${fmt(r.foods.length)}</span></h2>
        <div class="tablewrap"><table><thead><tr><th>Scientific name</th><th>Common name</th><th>Category</th></tr></thead><tbody>
        ${r.foods.slice(0, CAP).map(f => `<tr><td><a href="${turl(f.s)}"><i>${esc(f.s)}</i></a></td><td>${esc(f.c)}</td><td>${esc(f.k)}</td></tr>`).join('')}
        </tbody></table></div>` : ''}`;
    $('#sform').addEventListener('submit', e => { e.preventDefault(); location.hash = '#/search?q=' + enc($('#sq').value.trim()); });
  };

  // ---- food list
  views.foods = function (seg, params) {
    setTitle('Food list');
    const st = { q: params.get('q') || '', cat: params.get('cat') || '', cov: params.get('cov') || '', p: 0 };
    const PER = 50;
    const cats = [...new Set(FOODS.map(f => f.k))].sort();
    main.innerHTML = `
      <h1>Food list and coverage</h1>
      <p class="lead">Which foods can the FoodSeq reference database recognise from DNA? It is built around a list of ${fmt(FOODS.length)} food species and groups, compiled from the FDA Seafood List, GRIN Taxonomy, FAO fact sheets and more than thirty other sources. The table below shows how many of them have a reference DNA sequence in release ${esc(META.version)}; the list under it lets you check any single food.</p>
      <div class="tablewrap" style="max-width:860px"><table><thead><tr><th>DNA region</th><th>Foods on the list</th><th>With a reference sequence</th><th class="num">Found under the same name</th></tr></thead><tbody>
        ${MARKERS.map(m => `<tr><th scope="row">${esc(m.name)}</th><td>${fmt(m.coverage.targets)} ${m.food_category} species</td><td>${covCell(m)}</td><td class="num">${fmt(m.coverage.exact)} (${pct(m.coverage.exact, m.coverage.targets)})</td></tr>`).join('')}
      </tbody></table></div>
      <div class="toolbar">
        <input class="grow" type="search" id="fq" placeholder="Filter by scientific or common name" value="${esc(st.q)}" aria-label="Filter the food list">
        <label>Category <select id="fcat"><option value="">all</option>${cats.map(c => `<option ${st.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label>Coverage <select id="fcov">
          <option value="">all</option><option value="any">has a reference sequence</option><option value="none">no reference sequence</option><option value="syn">found under a different name</option>
          ${MARKERS.map(m => `<option value="${m.id}">in ${esc(m.name)}</option>`).join('')}</select></label>
        <button class="btn sm" id="fdl">Download this view (CSV)</button>
      </div>
      <div class="tablewrap"><table><thead><tr><th>Scientific name</th><th>Common name</th><th class="hide-sm">Category</th>${markerHeads()}<th class="hide-sm">Source</th></tr></thead><tbody id="fbody"></tbody></table></div>
      <div class="pager" id="fpager"></div>
      <p class="small muted" style="margin-top:14px">The numbers are reference DNA sequences. A dash means none yet. trnL reads plants and 12SV5 reads vertebrates (animals with a backbone), so insects, shellfish, fungi and bacteria on the list are expected gaps. "Found under a different name" means the sequence is held under another scientific name for the same species. The complete list, with every column, is <code>inputs/human-foods.csv</code> on the <a href="#/downloads">downloads page</a>.</p>`;
    $('#fcov').value = st.cov;
    const filtered = () => {
      const q = st.q.trim().toLowerCase();
      return FOODS.filter((f, i) => {
        if (st.cat && f.k !== st.cat) return false;
        if (q && !foodText[i].includes(q)) return false;
        const any = !!f.n;
        if (st.cov === 'any') return any;
        if (st.cov === 'none') return !any;
        if (st.cov === 'syn') return !!f.via;
        if (st.cov) return !!(f.n && f.n[st.cov]);
        return true;
      });
    };
    const draw = () => {
      const rows = filtered();
      const pages = Math.max(1, Math.ceil(rows.length / PER));
      st.p = Math.min(st.p, pages - 1);
      $('#fbody').innerHTML = rows.slice(st.p * PER, st.p * PER + PER).map(f => {
        const node = foodNode(f);
        return `<tr><td><a href="${turl(node ? node.name : f.s)}"><i>${esc(f.s)}</i></a>${f.via ? `<div class="small muted">as <i>${esc(f.b || '')}</i></div>` : ''}</td>
          <td>${esc(f.c)}</td><td class="hide-sm">${esc(f.k)}</td>
          ${MARKERS.map(m => { const v = f.n && f.n[m.id]; return `<td class="num ${v ? '' : 'zero'}">${v ? fmt(v) : '–'}</td>`; }).join('')}
          <td class="hide-sm small muted">${esc(f.src || '')}</td></tr>`;
      }).join('') || `<tr><td colspan="${5 + MARKERS.length}" class="empty">No food-list entries match.</td></tr>`;
      $('#fpager').innerHTML = `<span>${fmt(rows.length)} entr${rows.length === 1 ? 'y' : 'ies'}${rows.length > PER ? ` · page ${st.p + 1} of ${pages}` : ''}</span>
        <span class="btn-row"><button class="btn sm" id="fprev" ${st.p ? '' : 'disabled'}>Previous</button><button class="btn sm" id="fnext" ${st.p < pages - 1 ? '' : 'disabled'}>Next</button></span>`;
      $('#fprev').addEventListener('click', () => { st.p--; draw(); });
      $('#fnext').addEventListener('click', () => { st.p++; draw(); });
    };
    draw();
    $('#fq').addEventListener('input', e => { st.q = e.target.value; st.p = 0; draw(); });
    $('#fcat').addEventListener('change', e => { st.cat = e.target.value; st.p = 0; draw(); });
    $('#fcov').addEventListener('change', e => { st.cov = e.target.value; st.p = 0; draw(); });
    $('#fdl').addEventListener('click', () => {
      const q = s => '"' + String(s || '').replace(/"/g, '""') + '"';
      const head = ['scientific_name', 'common_name', 'category', 'name_in_reference'].concat(MARKERS.map(m => m.id + '_sequences'));
      const lines = filtered().map(f => [q(f.s), q(f.c), q(f.k), q(f.n ? (f.via ? f.b : f.s) : '')].concat(MARKERS.map(m => (f.n && f.n[m.id]) || 0)).join(','));
      download(`foodseq_food_list_coverage_v${META.version}.csv`, head.join(',') + '\n' + lines.join('\n') + '\n', 'text/csv');
    });
  };

  // ---- global food explorer
  const scriptLoads = {};
  function loadScriptOnce(src, global, errMsg) {
    if (window[global]) return Promise.resolve(window[global]);
    return scriptLoads[src] || (scriptLoads[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res(window[global]);
      s.onerror = () => { delete scriptLoads[src]; rej(new Error(errMsg)); };
      document.head.appendChild(s);
    }));
  }
  const loadGlobalFoods = () => loadScriptOnce('data/global-foods.js', 'FOODSEQ_GLOBAL', 'The global foods database could not be loaded.');
  // Citation and licence of every source paper, keyed by the record's `p` (paper id).
  const loadSources = () => loadScriptOnce('data/sources.js', 'FOODSEQ_SOURCES', 'The source and licence table could not be loaded.');

  // A source's licence class: open (CC BY / CC0), restricted (NC, ND or SA terms) or unverified.
  const LIC_NOTE = {
    open: 'Open licence: free to reuse with attribution.',
    restricted: 'Restricted licence (non-commercial, no-derivatives and/or share-alike). You may read and cite the record here; check the licence before reusing or redistributing it.',
    unverified: 'The reuse terms of this source could not be verified. Do not redistribute this record.'
  };
  const licBadge = (name, cls) => `<span class="badge lic-${esc(cls)}" title="${esc(LIC_NOTE[cls] || '')}">${esc(name || 'Unknown')}</span>`;
  const sourceCitation = s => s
    ? `${esc(s.authors)}${s.year ? ` (${esc(s.year)})` : ''}. ${esc(s.title)}.${s.journal ? ` <i>${esc(s.journal)}</i>.` : ''}${s.doi ? ` <a href="https://doi.org/${esc(s.doi)}" target="_blank" rel="noopener">doi:${esc(s.doi)}</a>` : ''}`
    : '';

  const loadWorld = () => loadScriptOnce('data/world-map.js', 'FOODSEQ_WORLD', 'The world map could not be loaded.');

  views.explorer = async function (seg, params) {
    setTitle('Global Food Explorer');
    main.innerHTML = `
      <h1>Global Food Explorer</h1>
      <p class="lead" id="expLead">What do people eat around the world? Search records of foods reported in published studies and see where on the map they come from.</p>
      <div id="expLoading" class="notice" style="background:var(--panel); border-color:var(--line);"><span class="small">Loading the food records and the map (a few MB, one moment)...</span></div>
      <div id="expContainer" hidden></div>
    `;

    let data, WORLD, SRC;
    try {
      [data, WORLD, SRC] = await Promise.all([loadGlobalFoods(), loadWorld(), loadSources()]);
    } catch (err) {
      const el = $('#expLoading');
      if (el) {
        el.className = 'notice';
        el.textContent = 'Could not load the food records or the map.';
      }
      return;
    }
    const lEl = $('#expLoading');
    if (lEl) lEl.remove();
    const container = $('#expContainer');
    if (!container) return;
    container.hidden = false;

    const ALL_RECS = data.records;
    const META_G = data.meta;
    const licClass = r => (SRC[r.p] && SRC[r.p].license_class) || 'unverified';
    // Link to the release reference data: r.rm is s (species), y (synonym) or g (genus only), r.rn the release taxon.
    const refHas = r => r.rm === 's' || r.rm === 'y';
    const refKind = r => refHas(r) ? 'has' : (r.rm === 'g' ? 'genus' : 'none');
    const refNode = r => (r.rn ? findNode(r.rn) : null);
    const refMarkers = r => { const n = refNode(r); return n ? MARKERS.filter(m => n.n[m.id]).map(m => ({ m, c: n.n[m.id] })) : []; };
    const refBadges = r => {
      const ms = refMarkers(r);
      if (!ms.length) return '<span class="small muted">none</span>';
      const html = ms.map(x => `<span class="badge ref-${refHas(r) ? 'has' : 'genus'}" title="${esc(x.m.name)}: ${x.c} record${x.c === 1 ? '' : 's'}${refHas(r) ? '' : ' in the genus ' + esc(r.rn)}">${esc(x.m.name)}</span>`).join(' ');
      return refHas(r) ? html : `<span class="small muted">genus only:</span> ${html}`;
    };
    const refCounts = { has: 0, genus: 0, none: 0 };
    const refSpecies = new Set();
    ALL_RECS.forEach(r => { refCounts[refKind(r)]++; if (refHas(r)) refSpecies.add(r.s); });
    const EXPECT = { trnL_gh: ['trnLGH', 'trnLCD'], '12SV5': ['12SV5'] };   // expected marker -> release databases
    const withAcc = ALL_RECS.filter(r => r.a).length;
    $('#expLead').innerHTML = `Search <b>${fmt(META_G.total_records)}</b> records of foods people eat, from <b>${fmt(Object.keys(SRC).length)}</b> published sources, and see on the map where each was reported. For researchers who detect foods from DNA, each record also shows whether FoodSeq has a reference sequence for it: ${fmt(refSpecies.size)} of ${fmt(META_G.unique_species)} species (${(100 * refSpecies.size / META_G.unique_species).toFixed(0)}%) do, in release ${esc(D.meta.version)}.`;

    const kCats = Object.keys(META_G.categories).sort();
    const mMarkers = Object.keys(META_G.markers).sort();

    const normStr = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // Standard regions (built from the free-text locations by build/regions.py): each record has ISO country
    // codes in `cc`, or a scope in `sc` (g global, m marine, c continental) when no country is named.
    // Region filter values: iso:CN, macro:East Asia, scope:g, scope:m; any other text matches the location text.
    const COUNTRIES = META_G.countries || {};              // code -> [name, macro-region]
    const macroOrder = META_G.macro_order || [];
    const regionLabel = v => !v ? '' : v.startsWith('iso:') ? (COUNTRIES[v.slice(4)] || [v.slice(4)])[0] : v.startsWith('macro:') ? v.slice(6)
      : v === 'scope:g' ? 'Global / cosmopolitan' : v === 'scope:m' ? 'Marine and fisheries' : v;

    const st = {
      q: params.get('q') || '',
      k: params.get('k') || '',
      m: params.get('m') || '',
      g: params.get('g') || '',
      cor: params.get('cor') || '',
      rf: params.get('rf') || '',
      view: params.get('view') || 'grid',
      p: 0,
      perGrid: 24,
      perTable: 50
    };

    container.innerHTML = `
      <details class="howto">
        <summary>How to read these records</summary>
        <ul>
          <li>A record says that a published source reported a food as eaten in a place. It is not a nutrition or food-safety guide.</li>
          <li>The map shows where studies have been done, not where more foods are eaten. A country with few records is understudied, not empty, and a food missing from a place may simply not have been recorded.</li>
          <li>Some records come from books published between 1889 and 1936 and from museum specimen labels. For a specimen the place is where it was collected, and for the old books it can be the plant's range.</li>
          <li>"Reference sequence" is for DNA researchers: whether the FoodSeq database holds a DNA sequence for that species.</li>
        </ul>
      </details>
      <div class="where">
        <div class="where-map">
          <svg id="whereMap" viewBox="0 0 ${WORLD.w} ${WORLD.h}" role="group" aria-label="World map shaded by the number of records per country, which shows where studies were done. Select a country to filter.">
            <path class="land" d="${WORLD.base}"></path>
            ${Object.entries(WORLD.countries).map(([c, v]) => `<path class="ctry" data-iso="${c}" data-name="${esc(v.n)}" d="${v.d}"><title>${esc(v.n)}</title></path>`).join('')}
          </svg>
          <div class="where-foot">
            <div class="where-legend"><span>1</span><i></i><span id="whereMax"></span><span>records per country (where studies were done)</span></div>
            <div class="small muted" id="whereRead" aria-live="polite">Select a country or region</div>
          </div>
        </div>
        <div class="where-list" id="whereList"></div>
      </div>

      <div class="exp-filters" id="expFilters">
        <div class="exp-searchbox">
          <svg class="hs-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input class="exp-search" type="search" id="eq" placeholder="Search a food, place or accession" value="${esc(st.q)}" aria-label="Search the food records by scientific or common name, part eaten, place or accession">
        </div>
        <div class="exp-row">
        <div class="kpills" id="ekPills" role="group" aria-label="Type of food">
          <button type="button" data-k="" aria-pressed="${st.k === '' ? 'true' : 'false'}">All types</button>
          ${[...kCats].sort((a, b) => ['plant', 'animal', 'fungi', 'algae'].indexOf(a) - ['plant', 'animal', 'fungi', 'algae'].indexOf(b)).map(k => `<button type="button" data-k="${k}" aria-pressed="${st.k === k ? 'true' : 'false'}">${k === 'plant' ? 'Plants' : k === 'animal' ? 'Animals' : k.charAt(0).toUpperCase() + k.slice(1)}</button>`).join('')}
          <select id="ek" hidden>
            <option value="">All types</option>
            ${kCats.map(k => `<option value="${k}" ${st.k === k ? 'selected' : ''}>${k.charAt(0).toUpperCase() + k.slice(1)} (${fmt(META_G.categories[k])})</option>`).join('')}
          </select>
        </div>
        <label>Place
          <select id="eg">
            <option value="">Anywhere</option>
            <optgroup label="Macro-regions">
              ${macroOrder.map(m => `<option value="macro:${esc(m)}" ${st.g === 'macro:' + m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
            </optgroup>
            <optgroup label="Countries">
              ${Object.entries(COUNTRIES).map(([c, v]) => ['iso:' + c, v[0]]).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => `<option value="${esc(id)}" ${st.g === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}
            </optgroup>
            <optgroup label="Not tied to a country">
              <option value="scope:g" ${st.g === 'scope:g' ? 'selected' : ''}>Global / cosmopolitan</option>
              <option value="scope:m" ${st.g === 'scope:m' ? 'selected' : ''}>Marine and fisheries</option>
            </optgroup>
          </select>
        </label>
        <div class="view-toggle">
          <button class="view-btn ${st.view === 'grid' ? 'active' : ''}" id="btnViewGrid" title="Card Grid View">Cards</button>
          <button class="view-btn ${st.view === 'table' ? 'active' : ''}" id="btnViewTable" title="Table Datagrid View">Table</button>
        </div>
        </div>
        <details class="exp-more" ${(st.m || st.cor || st.rf) ? 'open' : ''}>
          <summary>More filters</summary>
          <div class="exp-row">
        <label>DNA region
          <select id="em">
            <option value="">Any</option>
            ${mMarkers.map(m => `<option value="${m}" ${st.m === m ? 'selected' : ''}>${m}${/^trnL/.test(m) ? ' for plants' : /^rbcL/.test(m) ? ' for algae' : /^12SV5/.test(m) ? ' for vertebrates' : /^COI/.test(m) ? ' for invertebrates' : m === 'ITS2' ? ' for fungi' : ''} (${fmt(META_G.markers[m])})</option>`).join('')}
          </select>
        </label>
        <label>Reported by
          <select id="ecor">
            <option value="">Any number of sources</option>
            <option value="1" ${st.cor === '1' ? 'selected' : ''}>2 or more sources</option>
          </select>
        </label>
        <label>Reference DNA sequence
          <select id="er">
            <option value="">Any</option>
            <option value="has" ${st.rf === 'has' ? 'selected' : ''}>Yes, for this species (${fmt(refCounts.has)})</option>
            <option value="genus" ${st.rf === 'genus' ? 'selected' : ''}>Only a close relative (${fmt(refCounts.genus)})</option>
            <option value="none" ${st.rf === 'none' ? 'selected' : ''}>None yet (${fmt(refCounts.none)})</option>
          </select>
        </label>
          </div>
        </details>
        <p class="exp-links">
          <button type="button" class="linkbtn" id="edlFiltered">Download these results (CSV)</button>
          <a href="downloads/foodseq-global-foods-open.csv" download title="Every record in the Explorer, with its source and licence">Download all records (CSV)</a>
          <a href="#/sources">Sources</a>
        </p>
      </div>

      <div id="expActiveSummary" class="small muted" style="margin-bottom:12px;"></div>
      <div id="expResults"></div>
      <div class="pager" id="expPager"></div>

      <!-- Detail Modal Drawer -->
      <div class="modal-overlay" id="expModal" hidden>
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="modal-header">
            <h2 id="modalTitle">Record details &amp; source</h2>
            <button class="btn sm" id="modalClose" aria-label="Close modal">✕</button>
          </div>
          <div class="modal-body" id="modalBody"></div>
          <div class="modal-footer">
            <button class="btn primary sm" id="modalCloseBtn">Done</button>
          </div>
        </div>
      </div>
    `;

    // Macro-region and country must match exactly; the free-text location
    // matches whole words only, so "Niger" no longer catches "Nigeria" and
    // "Guinea" no longer catches "Guinea-Bissau". `targetG` is already normStr()'d.
    // Normalised copies of the searchable fields, computed once per record.
    const nz = r => r._n || (r._n = { s: normStr(r.s), c: normStr(r.c), e: normStr(r.e), g: normStr(r.g),
      macro: normStr(r.macro), country: normStr(r.country), a: normStr(r.a), p: normStr(r.p) });
    const recMacros = r => r._mac || (r._mac = new Set([...(r.cc || []).map(c => (COUNTRIES[c] || [])[1]).filter(Boolean), ...(r.cc ? [] : [r.macro])]));
    const geoPredicate = value => {                    // null when no region filter is set
      if (!value) return null;
      if (value.startsWith('iso:')) { const c = value.slice(4); return r => !!r.cc && r.cc.includes(c); }
      if (value.startsWith('macro:')) { const m = value.slice(6); return r => recMacros(r).has(m); }
      if (value === 'scope:g') return r => r.sc === 'g';
      if (value === 'scope:m') return r => r.sc === 'm';
      return null;
    };
    const matchQ = (r, q) => {
      const n = nz(r);
      return n.s.includes(q) || n.c.includes(q) || n.e.includes(q) || n.g.includes(q) ||
             n.macro.includes(q) || n.country.includes(q) || n.a.includes(q) || n.p.includes(q);
    };
    const REGION_TERMS = [...macroOrder.map(m => 'macro:' + m), ...Object.keys(COUNTRIES).map(c => 'iso:' + c), 'scope:g', 'scope:m'];
    const regionPreds = REGION_TERMS.map(t => [t, geoPredicate(t)]);

    // One pass over the records. `rows` pass every filter. `cnt` holds faceted counts for each dropdown:
    // how many records pass all the OTHER filters and have that option's value, so the numbers beside
    // the options describe the current selection, not the whole database.
    const compute = () => {
      const q = normStr(st.q), gp = geoPredicate(st.g);
      const regs = regionPreds;
      const rows = [], cnt = { k: {}, m: {}, cor: 0, rf: {}, g: {}, gBase: 0 };
      const bump = (o, key) => { o[key] = (o[key] || 0) + 1; };
      for (const r of ALL_RECS) {
        const rk = refKind(r);
        const ok = { k: !st.k || r.k === st.k, m: !st.m || r.m === st.m, cor: st.cor !== '1' || !!r.cor,
                     rf: !st.rf || rk === st.rf, g: !gp || gp(r), q: !q || matchQ(r, q) };
        let fails = 0, failed = '';
        for (const key in ok) if (!ok[key]) { fails++; failed = key; }
        if (fails > 1) continue;
        const all = fails === 0;
        if (all) rows.push(r);
        if (all || failed === 'k') bump(cnt.k, r.k);
        if (all || failed === 'm') bump(cnt.m, r.m);
        if ((all || failed === 'cor') && r.cor) cnt.cor++;
        if (all || failed === 'rf') bump(cnt.rf, rk);
        if (all || failed === 'g') { cnt.gBase++; for (const [t, pr] of regs) if (pr(r)) bump(cnt.g, t); }
      }
      return { rows, cnt };
    };
    const filterRecords = () => compute().rows;

    // Update everything that describes the data so it follows the current selection.
    const setCount = (sel, fn, allText) => {
      for (const o of sel.options) {
        if (o.dataset.label === undefined) o.dataset.label = o.textContent.replace(/\s*\([\d,]+\)\s*$/, '');
        if (o.value === '') { if (allText) o.textContent = allText; continue; }
        const n = fn(o.value) || 0;
        o.textContent = `${o.dataset.label} (${fmt(n)})`;
        o.disabled = n === 0 && o.value !== sel.value;
      }
    };
    const updateFacets = ({ rows, cnt }) => {
      setCount($('#ek'), v => cnt.k[v]);
      $$('#ekPills button').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.k === st.k));
        const n = b.dataset.k ? cnt.k[b.dataset.k] || 0 : null;
        b.disabled = n === 0 && b.dataset.k !== st.k;
      });
      setCount($('#em'), v => cnt.m[v]);
      setCount($('#eg'), v => cnt.g[v], `Anywhere (${fmt(cnt.gBase)})`);
      setCount($('#ecor'), () => cnt.cor);
      setCount($('#er'), v => cnt.rf[v]);
      updateWhere(cnt, rows);
    };

    const getSourceUrl = (p, s) => {
      if (!p) return null;
      if (p.startsWith('PMC')) return `https://www.ncbi.nlm.nih.gov/pmc/articles/${p}/`;
      if (p.startsWith('10.')) return `https://doi.org/${encodeURIComponent(p)}`;
      if (p.startsWith('FAO')) return 'https://www.fao.org/4/y5489e/y5489e14.htm';
      if (p === 'LAD_LAB_Food_DBs') return 'https://github.com/LAD-LAB/food-dbs';
      return null;
    };

    const formatSourceLink = (p, s) => {
      if (!p) return '<span class="muted">FoodSeq Reference Sequence</span>';
      if (p.startsWith('PMC')) {
        const pmcId = p.trim();
        return `
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <a href="https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/" target="_blank" rel="noopener" class="btn sm primary">
              PubMed Central: ${esc(pmcId)} ↗
            </a>
            <a href="https://europepmc.org/article/PMC/${pmcId}" target="_blank" rel="noopener" class="btn sm">
              Europe PMC ↗
            </a>
          </div>
        `;
      }
      if (p.startsWith('10.')) {
        return `<a href="https://doi.org/${encodeURIComponent(p)}" target="_blank" rel="noopener" class="btn sm primary">DOI: ${esc(p)} ↗</a>`;
      }
      if (p.startsWith('FAO')) {
        return `
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <a href="https://www.fao.org/4/y5489e/y5489e14.htm" target="_blank" rel="noopener" class="btn sm primary">
              FAO Forestry Paper 144 (Annex 3 Compendium) ↗
            </a>
            <a href="https://www.fao.org/4/y5489e/y5489e00.htm" target="_blank" rel="noopener" class="btn sm">
              FAO Report Overview ↗
            </a>
          </div>
        `;
      }
      if (p === 'LAD_LAB_Food_DBs') {
        return `<a href="https://github.com/LAD-LAB/food-dbs" target="_blank" rel="noopener" class="btn sm primary">LAD-LAB / food-dbs (GitHub Repository) ↗</a>`;
      }
      return `<span class="mono">${esc(p)}</span>`;
    };

    let activeFilterRows = [];

    // The accession a source paper cites for the species; NCBI's organism for it is compared with the species at build time.
    const accModal = r => {
      if (!r.a) return '<span class="muted">None cited by the source paper.</span>';
      const ids = r.a.split(/[,;\s]+/).filter(Boolean);
      const links = ids.map(id => r.av === 'u' ? `<span class="mono">${esc(id)}</span>` : `<a href="https://www.ncbi.nlm.nih.gov/nuccore/${esc(id)}" target="_blank" rel="noopener" class="mono">${esc(id)} ↗</a>`).join(', ');
      const ao = r.ao ? `<i>${esc(r.ao)}</i>` : 'another organism';
      const note = {
        m: '<span class="badge corroborated">✓ organism matches</span> NCBI lists it under this species.',
        s: `<span class="badge">same species</span> listed by NCBI as ${ao} (a synonym or spelling variant).`,
        g: `<span class="badge lic-restricted">different species</span> NCBI lists ${ao}, in the same genus. Check before relying on it.`,
        d: `<span class="badge lic-unverified">organism mismatch</span> NCBI lists ${ao}, a different organism. Possibly a mislabel in the source or the extraction.`,
        k: `<span class="badge lic-unverified">organism mismatch</span> NCBI lists ${ao}, from a different kingdom. Possibly a mislabel in the source or the extraction.`,
        u: 'Not an NCBI nucleotide accession (for example SRA, BOLD or UniProt), so it was not checked.'
      }[r.av] || '';
      return `${links}<div class="small muted" style="margin-top:4px">This is the sequence the paper cites. It is not necessarily one of the FoodSeq release records (see Reference sequences).</div>${note ? `<div class="small" style="margin-top:4px">${note}</div>` : ''}`;
    };

    const refModal = r => {
      const ms = refMarkers(r), n = refNode(r);
      const ver = esc(D.meta.version);
      let h;
      if (refHas(r)) {
        h = `${refBadges(r)} <div class="small" style="margin-top:4px"><a href="${turl(r.rn)}">Open the taxon page for <i>${esc(r.rn)}</i></a> · ${ms.map(x => `${esc(x.m.name)}: ${x.c} record${x.c === 1 ? '' : 's'}`).join(', ')}${r.rm === 'y' ? `<br>Matched under its current NCBI name <i>${esc(r.rn)}</i>.` : ''}</div>`;
      } else if (n) {
        h = `<span class="muted">No record for this species in release ${ver}.</span><div class="small" style="margin-top:4px">${ms.map(x => `${esc(x.m.name)}: ${x.c}`).join(', ')} record${ms.length === 1 && ms[0].c === 1 ? '' : 's'} for other species of the genus <a href="${turl(n.name)}"><i>${esc(n.name)}</i></a>. A candidate for a future release.</div>`;
      } else {
        h = `<span class="muted">Not in release ${ver}.</span><div class="small" style="margin-top:4px">A candidate for a future release.</div>`;
      }
      const exp = EXPECT[r.m];
      if (!exp) h += `<div class="small muted" style="margin-top:4px">The release has no reference database for the expected marker (${esc(r.m)}).</div>`;
      else if (refHas(r) && !ms.some(x => exp.includes(x.m.id))) h += `<div class="small muted" style="margin-top:4px">The reference records are for a different marker than the expected one (${esc(r.m)}).</div>`;
      return h;
    };

    // ---- plain-language sentence for a record, and the "For DNA researchers" panel
    const nameList = cs => { const n = cs.map(c => (COUNTRIES[c] || [c])[0]); return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
    // The place as standardised from the source's location text (ISO countries); the text itself stays in the researcher panel.
    const placeLabel = r => {
      const cc = r.cc || [];
      if (cc.length === 1) return nameList(cc);
      if (cc.length >= 2 && cc.length <= 3) return nameList(cc);
      if (cc.length > 3) return `${cc.length} countries (${nameList(cc.slice(0, 2).concat([])).replace(' and ', ', ')}, ...)`;
      if (r.sc === 'm') return 'Marine waters and fisheries';
      if (r.sc === 'c' && r.macro && r.macro !== 'Unplaced') return r.macro;
      if (r.sc === 'g') return 'Global (no specific place)';
      return 'Place not stated';
    };
    const placePhrase = r => {
      const cc = r.cc || [];
      if (cc.length === 1) return `in ${nameList(cc)}`;
      if (cc.length >= 2 && cc.length <= 4) return `in ${nameList(cc)}`;
      if (cc.length > 4) return `in ${cc.length} countries, among them ${nameList(cc.slice(0, 3))}`;
      if (r.sc === 'm') return 'from marine waters and fisheries';
      if (r.sc === 'c' && r.macro && r.macro !== 'Unplaced') return `in ${r.macro}`;
      if (r.sc === 'g') return 'without a specific place (worldwide)';
      return 'without a place that could be read from the source';
    };
    const sourcePhrase = r => {
      const sr = SRC[r.p] || {}, yr = sr.year ? ` (${sr.year})` : '';
      if (r.p.startsWith('GBIF_')) return 'It comes from a museum or herbarium specimen label; the place is where the specimen was collected.';
      if (r.p === 'USDA_GRIN_Economic_Plants') return 'It comes from the USDA GRIN database of economic plants.';
      if (r.p.startsWith('LAD_LAB')) return "It comes from the lab's own food list.";
      if (/^(Sturtevant|Yanovsky|Maiden|Safford|Ogilby|USDA_Bull)/.test(r.p)) return `It comes from a historical book${yr}; the place can be the plant's range or a region mentioned in the text, not only where it is eaten.`;
      return `It comes from a published study${yr}.`;
    };
    const partPhrase = r => {
      const e = (r.e || '').trim();
      if (!e || /^edible (part|biomass)\b/i.test(e) || e.length > 90) return '';
      return ` Part eaten or use: ${e.charAt(0).toLowerCase() + e.slice(1)}.`;
    };
    const refPhrase = r => refHas(r)
      ? `FoodSeq has a reference DNA sequence for this species (release ${esc(D.meta.version)}).`
      : (refNode(r) ? 'FoodSeq has no reference DNA sequence for this species yet, only for a close relative in the same genus.'
        : 'FoodSeq has no reference DNA sequence for this species yet.');
    const plainSentence = r => {
      const who = r.c ? `${esc(r.c)} (<i>${esc(r.s)}</i>)` : `<i>${esc(r.s)}</i>`;
      const n = r.cor ? ` Reported by ${r.srcs} sources.` : '';
      return `<p><b>${who}</b> is reported as a food ${esc(placePhrase(r))}.${esc(partPhrase(r))}</p>
        <p class="small">${esc(sourcePhrase(r))}${esc(n)} ${refPhrase(r)}</p>`;
    };
    const researcherOpen = () => { try { return localStorage.getItem('foodseq.researcher.open') === '1'; } catch (e) { return false; } };

    const openModal = (r) => {
      if (!r) return;
      $('#modalTitle').innerHTML = `${r.c ? esc(r.c) + ' ' : ''}<i>${esc(r.s)}</i>`;

      const accHtml = accModal(r);
      const expMarker = EXPECT[r.m] ? EXPECT[r.m].join(' / ') : (r.m || 'General');

      $('#modalBody').innerHTML = `
        <div class="plain-box">${plainSentence(r)}</div>

        <details class="research" id="researchPanel" ${researcherOpen() ? 'open' : ''}>
          <summary><b>For DNA researchers</b>
            <span class="small">Reference sequence: ${refBadges(r)} · DNA region: <span class="badge">${esc(r.m || 'General')}</span></span></summary>
          <dl class="kv">
            <dt>DNA region used to detect it:</dt><dd><span class="badge">${esc(r.m || 'General')}</span><div class="small muted" style="margin-top:4px">The region usually used for this kind of food (plants trnL g/h, vertebrate animals 12SV5, invertebrates COI, fungi ITS2, algae rbcL). It comes from the food category and does not mean a sequence exists.</div></dd>
            <dt>Reference sequences:</dt><dd>${refModal(r)}</dd>
            <dt>Accession cited by the source:</dt><dd>${accHtml}</dd>
            <dt>Location text as stored:</dt><dd class="small">${esc(r.g || 'None')}<div class="muted" style="margin-top:2px">The Place above is standardised from this text (and, for some papers, corrected after checking the paper).</div></dd>
            <dt>Tools:</dt><dd class="small"><a href="#/identify">Identify a sequence</a>${refHas(r) ? ` · <a href="${turl(r.rn)}">Taxon page and FASTA</a>` : ''} · <a href="#/search?q=${enc(r.s)}">Search the reference database for <i>${esc(r.s)}</i></a></dd>
          </dl>
        </details>

        <h3 class="modal-h">The record</h3>
        <dl class="kv">
          <dt>Food:</dt><dd><b><i>${esc(r.s)}</i></b>${r.c ? ` (${esc(r.c)})` : ''} <span class="badge ${esc(r.k)}">${esc(r.k)}</span></dd>
          <dt>Part eaten or use:</dt><dd>${esc(r.e || 'Not stated')}</dd>
          <dt>Place:</dt><dd>${esc(placeLabel(r))}</dd>
          <dt>Reported by:</dt><dd>${r.cor ? `<span class="badge corroborated">✓ ${r.srcs} sources</span>` : '<span class="muted">One source</span>'}</dd>
        </dl>

        <h3 class="modal-h">Source and licence</h3>
        <dl class="kv">
          <dt>Source:</dt><dd>${SRC[r.p] ? `<div style="margin-bottom:8px">${sourceCitation(SRC[r.p])}</div>` : ''}${formatSourceLink(r.p, r.s)}</dd>
          <dt>Licence:</dt><dd>${SRC[r.p] && SRC[r.p].license_url ? `<a href="${esc(SRC[r.p].license_url)}" target="_blank" rel="noopener">${licBadge(r.l, licClass(r))}</a>` : licBadge(r.l, licClass(r))}
            <div class="small muted" style="margin-top:4px">${esc(LIC_NOTE[licClass(r)])} Modified from the source: facts extracted into a table.</div></dd>
        </dl>

        <h3 class="modal-h">What the source says</h3>
        <div class="quote-box">${esc(r.q || 'Entry from the source table (no quote stored).')}</div>
      `;
      const rp = $('#researchPanel');
      if (rp) rp.addEventListener('toggle', () => { try { localStorage.setItem('foodseq.researcher.open', rp.open ? '1' : '0'); } catch (e) { /* storage may be blocked */ } });
      $('#expModal').hidden = false;
      document.body.style.overflow = 'hidden';
    };

    const closeModal = () => {
      $('#expModal').hidden = true;
      document.body.style.overflow = '';
    };

    $('#modalClose').addEventListener('click', closeModal);
    $('#modalCloseBtn').addEventListener('click', closeModal);
    $('#expModal').addEventListener('click', e => { if (e.target === $('#expModal')) closeModal(); });

    const draw = () => {
      const res = compute();
      activeFilterRows = res.rows;
      updateFacets(res);
      const per = st.view === 'grid' ? st.perGrid : st.perTable;
      const pages = Math.max(1, Math.ceil(activeFilterRows.length / per));
      st.p = Math.min(st.p, pages - 1);
      const slice = activeFilterRows.slice(st.p * per, st.p * per + per);

      $('#expActiveSummary').textContent = `Showing ${fmt(slice.length)} of ${fmt(activeFilterRows.length)} matching records (${fmt(META_G.total_records)} total in database)`;

      if (st.view === 'grid') {
        if (!slice.length) {
          $('#expResults').innerHTML = '<div class="empty">No food records match the selected filters.</div>';
        } else {
          $('#expResults').innerHTML = `<div class="card-grid">
            ${slice.map((r, localIdx) => {
              const displayName = r.c ? esc(r.c) : esc(r.s);
              const srcUrl = getSourceUrl(r.p, r.s);
              const srcLabel = r.p === 'LAD_LAB_Food_DBs' ? 'LAD-LAB' : r.p;
              return `
                <div class="food-card">
                  <div>
                    <div class="food-card-head">
                      <div>
                        <div class="food-card-title">${displayName}</div>
                        <div class="food-card-binomial"><a href="${refHas(r) ? turl(r.rn) : '#/search?q=' + enc(r.s)}" title="${refHas(r) ? 'Open the release taxon page' : 'Search the release'}"><i>${esc(r.s)}</i></a></div>
                      </div>
                      <span class="badge ${esc(r.k)}">${esc(r.k)}</span>
                    </div>
                    <div class="food-card-meta">
                      <div class="row"><span class="lbl">Part</span> <span>${esc(r.e)}</span></div>
                      <div class="row"><span class="lbl">Place</span> <span>${esc(placeLabel(r))}</span></div>
                      <div class="row"><span class="lbl" title="The DNA region used to detect this food: trnL for plants, 12S for vertebrates, COI for invertebrates">DNA</span> <span><span class="badge">${esc(r.m)}</span> ${r.a ? `<a href="https://www.ncbi.nlm.nih.gov/nuccore/${esc(r.a)}" target="_blank" rel="noopener" class="mono small">${esc(r.a)} ↗</a>` : ''}</span></div>
                      <div class="row"><span class="lbl" title="Reference DNA sequences in release ${esc(D.meta.version)}">Reference</span> <span>${refBadges(r)}</span></div>
                    </div>
                    <div class="food-card-src small muted">${srcUrl ? `<a href="${srcUrl}" target="_blank" rel="noopener">${esc(srcLabel)} ↗</a>` : esc(srcLabel)} &middot; ${licBadge(r.l, licClass(r))}</div>
                  </div>
                  <div class="food-card-foot">
                    ${r.cor ? '<span class="corroborated" title="Reported by more than one source">✓ 2+ sources</span>' : '<span class="small muted">Single source</span>'}
                    <button class="linkbtn" data-slice-idx="${localIdx}">Details and source &rarr;</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>`;
        }
      } else {
        if (!slice.length) {
          $('#expResults').innerHTML = '<div class="empty">No food records match the selected filters.</div>';
        } else {
          $('#expResults').innerHTML = `
            <div class="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Scientific Name</th>
                    <th>Common Name</th>
                    <th>Kingdom</th>
                    <th>Edible Part / Use</th>
                    <th>Region</th>
                    <th>Expected marker</th>
                    <th>Accession</th>
                    <th>Source</th>
                    <th>Reference</th>
                    <th>Licence</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${slice.map((r, localIdx) => {
                    const srcUrl = getSourceUrl(r.p, r.s);
                    const srcLabel = r.p === 'LAD_LAB_Food_DBs' ? 'LAD-LAB' : r.p;
                    return `
                    <tr>
                      <td><a href="${refHas(r) ? turl(r.rn) : '#/search?q=' + enc(r.s)}"><i>${esc(r.s)}</i></a></td>
                      <td>${esc(r.c || '–')}</td>
                      <td><span class="badge ${esc(r.k)}">${esc(r.k)}</span></td>
                      <td>${esc(r.e)}</td>
                      <td class="small muted">${esc(placeLabel(r))}</td>
                      <td><span class="badge">${esc(r.m)}</span></td>
                      <td class="mono small">${r.a ? `<a href="https://www.ncbi.nlm.nih.gov/nuccore/${esc(r.a)}" target="_blank" rel="noopener">${esc(r.a)}</a>` : '–'}</td>
                      <td>${srcUrl ? `<a href="${srcUrl}" target="_blank" rel="noopener" class="small">${esc(srcLabel)} ↗</a>` : `<span class="small muted">${esc(srcLabel)}</span>`}</td>
                      <td>${refBadges(r)}</td>
                      <td>${licBadge(r.l, licClass(r))}</td>
                      <td>${r.cor ? '<span class="badge corroborated">✓ 2+ sources</span>' : '<span class="small muted">Single source</span>'}</td>
                      <td class="num"><button class="btn sm" data-slice-idx="${localIdx}">Details</button></td>
                    </tr>
                  `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `;
        }
      }

      $('#expPager').innerHTML = `
        <span>${fmt(activeFilterRows.length)} entr${activeFilterRows.length === 1 ? 'y' : 'ies'}${activeFilterRows.length > per ? ` · page ${st.p + 1} of ${pages}` : ''}</span>
        <span class="btn-row">
          <button class="btn sm" id="expPrev" ${st.p ? '' : 'disabled'}>Previous</button>
          <button class="btn sm" id="expNext" ${st.p < pages - 1 ? '' : 'disabled'}>Next</button>
        </span>
      `;
      $('#expPrev').addEventListener('click', () => { st.p--; draw(); window.scrollTo(0, 200); });
      $('#expNext').addEventListener('click', () => { st.p++; draw(); window.scrollTo(0, 200); });
    };

    $('#expResults').addEventListener('click', e => {
      const btn = e.target.closest('[data-slice-idx]');
      if (btn) {
        const localIdx = parseInt(btn.dataset.sliceIdx, 10);
        const per = st.view === 'grid' ? st.perGrid : st.perTable;
        const record = activeFilterRows[st.p * per + localIdx];
        if (record) openModal(record);
      }
    });

    $('#eq').addEventListener('input', e => { st.q = e.target.value; st.p = 0; draw(); });
    $('#ek').addEventListener('change', e => { st.k = e.target.value; st.p = 0; draw(); });
    $('#ekPills').addEventListener('click', e => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      $('#ek').value = st.k = b.dataset.k;
      st.p = 0;
      draw();
    });
    $('#em').addEventListener('change', e => { st.m = e.target.value; st.p = 0; draw(); });
    $('#eg').addEventListener('change', e => { st.g = e.target.value; st.p = 0; syncWhereView(); draw(); });
    $('#ecor').addEventListener('change', e => { st.cor = e.target.value; st.p = 0; draw(); });
    $('#er').addEventListener('change', e => { st.rf = e.target.value; st.p = 0; draw(); });

    // ---- Where the records are from: a country map (shaded by record count) and a ranked list ---------
    const whereMap = $('#whereMap'), whereList = $('#whereList'), whereRead = $('#whereRead');
    const ctry = new Map();
    $$('#whereMap .ctry').forEach(p => ctry.set(p.dataset.iso, p));
    let viewNow = WORLD.views[''].slice(), viewAnim = 0, viewTimer = 0, whereSummary = 'Select a country or region';
    const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const macroOfSel = () => st.g.startsWith('macro:') ? st.g.slice(6) : st.g.startsWith('iso:') ? ((COUNTRIES[st.g.slice(4)] || [])[1] || '') : '';
    const setViewBox = v => { viewNow = v; whereMap.setAttribute('viewBox', v.map(x => x.toFixed(1)).join(' ')); };
    const syncWhereView = instant => {
      const to = WORLD.views[macroOfSel()] || WORLD.views[''];
      cancelAnimationFrame(viewAnim);
      clearTimeout(viewTimer);
      if (instant || reduceMotion) { setViewBox(to.slice()); return; }
      viewTimer = setTimeout(() => setViewBox(to.slice()), 450);      // lands on the target even if frames are throttled
      const from = viewNow.slice(), t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / 380), e = k * (2 - k);
        setViewBox(from.map((f, i) => f + (to[i] - f) * e));
        if (k < 1) viewAnim = requestAnimationFrame(step);
      };
      viewAnim = requestAnimationFrame(step);
    };
    const selectRegion = value => {                      // choosing the selected region again clears it
      st.g = st.g === value ? '' : value;
      const sel = $('#eg'); if (sel) sel.value = st.g;
      st.p = 0;
      syncWhereView();
      draw();
    };
    const wrow = (value, label, n, max, cls) => `<button type="button" class="wrow ${cls || ''} ${st.g === value ? 'on' : ''}" data-v="${esc(value)}">
        <span class="wl">${esc(label)}</span><span class="wb"><i style="width:${max ? Math.max(2, Math.round(100 * n / max)) : 0}%"></i></span><span class="wn">${fmt(n)}</span></button>`;
    const updateWhere = (cnt, rows) => {
      let max = 0;
      ctry.forEach((p, c) => { max = Math.max(max, cnt.g['iso:' + c] || 0); });
      const selMacro = macroOfSel(), narrowed = st.g.startsWith('iso:') || st.g.startsWith('macro:');
      ctry.forEach((p, c) => {
        const n = cnt.g['iso:' + c] || 0, info = COUNTRIES[c], isSel = st.g === 'iso:' + c;
        p.classList.toggle('has', n > 0);
        p.classList.toggle('sel', isSel);
        p.classList.toggle('dim', narrowed && !isSel && !(st.g.startsWith('macro:') && info && info[1] === selMacro));
        p.style.fillOpacity = n > 0 ? (0.2 + 0.78 * Math.sqrt(n / max)).toFixed(2) : '';
        const label = `${p.dataset.name}: ${n ? fmt(n) + ' records' : 'no records here'}`;
        p.setAttribute('aria-label', label);
        p.querySelector('title').textContent = label;
        if (n > 0 || isSel) { p.setAttribute('tabindex', '0'); p.setAttribute('role', 'button'); p.setAttribute('aria-pressed', String(isSel)); }
        else { p.removeAttribute('tabindex'); p.removeAttribute('role'); p.removeAttribute('aria-pressed'); }
      });
      $('#whereMax').textContent = fmt(max);
      whereSummary = st.g ? `${regionLabel(st.g)}: ${fmt(rows.length)} record${rows.length === 1 ? '' : 's'}` : 'Select a country or region';
      whereRead.textContent = whereSummary;

      const mac = macroOrder.map(m => ['macro:' + m, m, cnt.g['macro:' + m] || 0]).sort((a, b) => b[2] - a[2]);
      const cl = Object.entries(COUNTRIES).filter(([c, v]) => (!selMacro || v[1] === selMacro) && (cnt.g['iso:' + c] || 0) > 0)
        .map(([c, v]) => ['iso:' + c, v[0], cnt.g['iso:' + c]]).sort((a, b) => b[2] - a[2]);
      // The list is one level at a time so it stays about as tall as the map: the nine regions, or,
      // once a region (or one of its countries) is chosen, that region and its countries.
      const limit = 8;
      let shown = cl.slice(0, limit);
      const picked = cl.find(x => x[0] === st.g);
      if (picked && !shown.includes(picked)) shown = [...shown.slice(0, limit - 1), picked];
      const chip = (v, label) => `<button type="button" class="wchip ${st.g === v ? 'on' : ''}" data-v="${v}">${label} <b>${fmt(cnt.g[v] || 0)}</b></button>`;
      const top = selMacro
        ? `${wrow('', 'All regions', cnt.gBase, 0, 'all back')}
        ${wrow('macro:' + selMacro, selMacro, cnt.g['macro:' + selMacro] || 0, cnt.g['macro:' + selMacro] || 0, 'head')}
        ${shown.map(x => wrow(x[0], x[1], x[2], cl[0] ? cl[0][2] : 0, 'sub')).join('')}
        ${cl.length > shown.length ? `<div class="small muted wmore">${cl.length - shown.length} more on the map</div>` : ''}`
        : `${wrow('', 'All regions', cnt.gBase, 0, 'all')}
        ${mac.map(m => wrow(m[0], m[1], m[2], mac[0][2])).join('')}`;
      whereList.innerHTML = `${top}
        <div class="wchips">${chip('scope:g', 'Global / cosmopolitan')}${chip('scope:m', 'Marine and fisheries')}</div>`;
    };
    whereList.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) selectRegion(b.dataset.v); });
    whereMap.addEventListener('click', e => { const p = e.target.closest('.ctry'); if (p && (p.classList.contains('has') || p.classList.contains('sel'))) selectRegion('iso:' + p.dataset.iso); });
    whereMap.addEventListener('keydown', e => {
      const p = e.target.closest && e.target.closest('.ctry');
      if (p && (e.key === 'Enter' || e.key === ' ') && p.getAttribute('role') === 'button') { e.preventDefault(); selectRegion('iso:' + p.dataset.iso); }
    });
    whereMap.addEventListener('mouseover', e => { const p = e.target.closest('.ctry'); if (p && p.classList.contains('has')) whereRead.textContent = p.getAttribute('aria-label'); });
    whereMap.addEventListener('mouseout', () => { whereRead.textContent = whereSummary; });
    syncWhereView(true);

    $('#btnViewGrid').addEventListener('click', () => {
      st.view = 'grid';
      $('#btnViewGrid').classList.add('active');
      $('#btnViewTable').classList.remove('active');
      st.p = 0;
      draw();
    });

    $('#btnViewTable').addEventListener('click', () => {
      st.view = 'table';
      $('#btnViewTable').classList.add('active');
      $('#btnViewGrid').classList.remove('active');
      st.p = 0;
      draw();
    });

    $('#edlFiltered').addEventListener('click', () => {
      const q = s => '"' + String(s || '').replace(/"/g, '""') + '"';
      const head = ['scientific_name', 'common_name', 'category', 'edible_part', 'geographic_location', 'target_marker', 'accession', 'regions', 'paper_id', 'license', 'reference_match', 'multi_source_corroborated'];
      const lines = filterRecords().map(r => [
        q(r.s), q(r.c), q(r.k), q(r.e), q(r.g), q(r.m), q(r.a), q((r.cc || []).join('; ')), q(r.p), q(r.l), q(refHas(r) ? 'in release ' + D.meta.version : (r.rm === 'g' ? 'genus only' : 'none')), r.cor
      ].join(','));
      download(`foodseq_global_foods_filtered_${new Date().toISOString().slice(0, 10)}.csv`, head.join(',') + '\n' + lines.join('\n') + '\n', 'text/csv');
    });

    draw();
  };

  // ---- sources & licences
  views.sources = async function (seg, params) {
    setTitle('Sources');
    main.innerHTML = `
      <h1>Sources</h1>
      <p class="lead">Every Global Food Explorer record is taken from one published source. Authors, titles and licences below come from Europe PMC (papers) or the source's own page.</p>
      <div id="srcBody"><p class="small muted">Loading the source table…</p></div>`;
    let SRC;
    try { SRC = await loadSources(); } catch (err) { $('#srcBody').innerHTML = `<div class="notice">${esc(err.message)}</div>`; return; }
    const all = Object.entries(SRC).map(([id, s]) => Object.assign({ id }, s));
    const tot = all.length, rec = all.reduce((n, x) => n + x.records, 0);
    const st = { q: params.get('q') || '', c: params.get('c') || '', p: 0, per: 50 };
    $('#srcBody').innerHTML = `
      <p>The Explorer contains <b>${fmt(rec)}</b> records from <b>${fmt(tot)}</b> sources, all published under licences that allow reuse with attribution (CC BY, CC0, public domain, or the lab's own CC BY list). Please credit the source paper listed here for any record you reuse; this table is the attribution. Records are factual extracts (names, edible part, region) and are modified from the source tables.</p>
      <p class="small muted">This is general information, not legal advice. When in doubt, check the licence of the original paper.</p>
      <div class="btn-row" style="margin:12px 0"><a class="btn sm" href="downloads/foodseq-global-foods-sources.csv" download>Download this table (CSV)</a><a class="btn sm" href="#/downloads">Downloads</a><a class="btn sm" href="#/explorer">Food Explorer</a></div>
      <div class="explorer-toolbar">
        <input class="grow" type="search" id="sq" placeholder="Search author, title, journal, PMC ID or DOI…" value="${esc(st.q)}">
        <label>Licence
          <select id="sc">
            <option value="">All licences</option>
            ${[...new Set(all.map(s => s.license))].sort().map(l => `<option value="${esc(l)}" ${st.c === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div id="srcRes"></div><div class="pager" id="srcPager"></div>`;
    const draw = () => {
      const q = st.q.trim().toLowerCase();
      const rows = all.filter(s => (!st.c || s.license === st.c) &&
        (!q || [s.id, s.title, s.authors, s.journal, s.doi, s.year].join(' ').toLowerCase().includes(q)))
        .sort((a, b) => b.records - a.records || a.id.localeCompare(b.id));
      const pages = Math.max(1, Math.ceil(rows.length / st.per));
      st.p = Math.min(st.p, pages - 1);
      const slice = rows.slice(st.p * st.per, (st.p + 1) * st.per);
      $('#srcRes').innerHTML = slice.length ? `<div class="tablewrap"><table><thead><tr><th>Source</th><th>Licence</th><th class="num">Records</th></tr></thead><tbody>
        ${slice.map(s => `<tr><td>${sourceCitation(s) || esc(s.id)}<div class="small muted"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.id)} ↗</a></div></td>
          <td>${s.license_url ? `<a href="${esc(s.license_url)}" target="_blank" rel="noopener">${licBadge(s.license, s.license_class)}</a>` : licBadge(s.license, s.license_class)}</td>
          <td class="num">${fmt(s.records)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No sources match.</div>';
      $('#srcPager').innerHTML = `<span>${fmt(rows.length)} source${rows.length === 1 ? '' : 's'}${rows.length > st.per ? ` · page ${st.p + 1} of ${pages}` : ''}</span>
        <span class="btn-row"><button class="btn sm" id="srcPrev" ${st.p ? '' : 'disabled'}>Previous</button><button class="btn sm" id="srcNext" ${st.p < pages - 1 ? '' : 'disabled'}>Next</button></span>`;
      $('#srcPrev').addEventListener('click', () => { st.p--; draw(); });
      $('#srcNext').addEventListener('click', () => { st.p++; draw(); });
    };
    $('#sq').addEventListener('input', e => { st.q = e.target.value; st.p = 0; draw(); });
    $('#sc').addEventListener('change', e => { st.c = e.target.value; st.p = 0; draw(); });
    draw();
  };

  // ---- downloads
  views.downloads = function () {
    setTitle('Downloads');
    const group = (title, blurb, test) => {
      const fs = D.files.filter(test);
      if (!fs.length) return '';
      return `<h2>${title}</h2><p class="muted">${blurb}</p><div class="tablewrap"><table><thead><tr><th>File</th><th class="num">Size</th><th class="hide-sm">SHA-256</th><th></th></tr></thead><tbody>
        ${fs.map(f => `<tr><td class="mono">${esc(f.path.split('/').slice(1).join('/') || f.path)}</td><td class="num">${bytes(f.bytes)}</td>
          <td class="hide-sm mono small muted" title="${esc(f.sha256)}">${f.sha256 ? esc(f.sha256.slice(0, 16)) + '…' : ''}</td>
          <td class="num"><a class="btn sm" href="downloads/${f.path.split('/').map(enc).join('/')}" data-file="${esc(f.path.split('/').pop())}" download>Download</a></td></tr>`).join('')}
        </tbody></table></div>`;
    };
    main.innerHTML = `
      <h1>Downloads</h1>
      <p class="lead">Release ${esc(META.version)}, licensed ${esc(META.license)}. The same records are provided in two formats; sequence counts and taxonomy are identical between them.</p>
      <div class="btn-row" style="margin:16px 0">
        ${D.archive && !inViewer ? `<a class="btn primary" href="downloads/${enc(D.archive.path)}" data-file="${esc(D.archive.path)}" download>Download everything (.zip, ${bytes(D.archive.bytes)})</a>` : ''}
        <a class="btn" href="${doiUrl(citeDoi)}" rel="noopener">Zenodo record</a>
        <a class="btn" href="${esc(META.github)}" rel="noopener">Pipeline on GitHub</a>
      </div>
      ${inViewer ? '<p class="small muted">In this preview, FASTA and TSV files are saved with a .txt extension added.</p>' : ''}
      ${group('DADA2', 'Two FASTA files per marker with identical sequences: <code>*_taxonomy_*</code> has ten-rank lineage headers for <code>assignTaxonomy()</code>; the other has accession headers for exact matching.', f => f.path.startsWith('dada2-compatible/'))}
      ${group('QIIME 2', 'A sequence FASTA (<code>FeatureData[Sequence]</code>) and a taxonomy TSV (<code>FeatureData[Taxonomy]</code>) per marker.', f => f.path.startsWith('qiime2-compatible/'))}
      ${group('Inputs', 'The food list the build is driven by, the control and host records added to every build, and the accessions omitted as mislabelled.', f => f.path.startsWith('inputs/'))}
      <h2>Global Foods Database</h2>
      <p class="muted">Human food records collected from published ethnobotanical surveys, dietary DNA studies, food-science papers and the lab's own food list (see the <a href="#/explorer">Food Explorer</a>). Each source has its own licence, so the records are split into separate files; every row carries its <code>license</code> and <code>source_id</code>, and <a href="#/sources">Sources &amp; licences</a> lists the authors, title and licence of each source.</p>
      <div id="globalDl"><p class="small muted">Loading file details…</p></div>
      ${group('Documentation', 'The release README and checksums for every file.', f => !f.path.includes('/'))}

      <h2>Using the files</h2>
      <div class="grid g2">
        <div><h3>DADA2 (R)</h3><pre>library(dada2)
tax &lt;- assignTaxonomy(
  seqtab,
  "trnLGH_taxonomy_v${esc(META.version)}.fasta",
  taxLevels = c("superkingdom", "phylum", "class",
                "order", "family", "genus", "species",
                "subspecies", "variety", "forma"),
  multithread = TRUE)</pre></div>
        <div><h3>QIIME 2</h3><pre>qiime tools import \\
  --type 'FeatureData[Sequence]' \\
  --input-path 12Sv5-sequences_v${esc(META.version)}.fasta \\
  --output-path 12Sv5-ref-seqs.qza
qiime tools import \\
  --type 'FeatureData[Taxonomy]' \\
  --input-format TSVTaxonomyFormat \\
  --input-path 12Sv5-taxonomy_v${esc(META.version)}.tsv \\
  --output-path 12Sv5-ref-taxonomy.qza</pre></div>
      </div>
      <p class="small muted">Every header has exactly ten ranks, so <code>taxLevels</code> must have length ten. Query sequences should be primer-trimmed and in the same orientation as the reference. See the README for details.</p>

      ${(META.previous_versions || []).length ? `<h2>Previous versions</h2>
      <div class="tablewrap"><table><thead><tr><th>Version</th><th>DOI</th><th>Status</th></tr></thead><tbody>
        ${META.previous_versions.map(v => `<tr><td class="num">${esc(v.version)}</td><td><a href="${doiUrl(v.doi)}" rel="noopener">${esc(v.doi)}</a></td><td>${esc(v.note || '')}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      <h2>Cite</h2>${citeBox()}`;
    loadScriptOnce('data/global-files.js', 'FOODSEQ_GLOBAL_FILES', 'The file list could not be loaded.').then(F => {
      const el = $('#globalDl');
      if (!el) return;
      const row = (name, desc, size) => `<tr><td class="mono">${name}</td><td>${desc}</td><td class="num">${size}</td><td class="num"><a class="btn sm" href="downloads/${name}" download>Download</a></td></tr>`;
      const head = '<div class="tablewrap"><table><thead><tr><th>File</th><th>Description</th><th class="num">Size</th><th></th></tr></thead><tbody>';
      el.innerHTML = `
        <h3>Global food records (${fmt(F.open.records)} records, ${fmt(F.open.species)} species)</h3>
        <p class="muted small">All of these records come from sources that allow reuse with attribution (CC BY, CC0, public domain). Cite the sources listed in the sources table for any record you reuse.</p>
        ${head}${row('foodseq-global-foods-open.csv', 'Tabular records with edible part, region, expected marker and source', bytes(F.open.csv_bytes))}
        ${row('foodseq-global-foods-open.json', 'Structured JSON with nested provenance evidence and source quotes', bytes(F.open.json_bytes))}</tbody></table></div>
        <h3>Sources</h3>
        ${head}${row('foodseq-global-foods-sources.csv', 'Authors, title, journal, year, DOI, licence and record count for every source', bytes(F.sources.bytes))}</tbody></table></div>
        <p class="small muted">Each record's category and expected marker come from its NCBI Taxonomy lineage (<code>category_original</code> shows the source-data value where it was corrected; <code>ncbi_match</code> says whether the name or only its genus was found). <code>reference_match</code>, <code>reference_markers</code> and <code>reference_release</code> say whether the species (or only its genus) has reference sequences in the FoodSeq release, and for which markers. <code>accession_check</code> compares the organism NCBI gives for the accession a source paper cites with the record's species (match, synonym, genus, different, kingdom or unknown). <code>regions</code> holds ISO 3166-1 country codes parsed from <code>geographic_location</code> (which is kept as written); <code>region_scope</code> is country, multi, continental, marine or global, and <code>region_match</code> says whether a country was named (exact), only a place within one (inferred), or the source truncated its list (partial); <code>corrected</code> means the label was replaced for the whole paper after checking it against the paper, and <code>taxon</code> that the place was set for this species from evidence of where it is eaten. Bacteria, viruses, moulds and yeasts picked up from non-food papers were removed. Records whose source terms could not be verified are browsable in the Explorer but are not offered for download.</p>`;
    }).catch(err => { const el = $('#globalDl'); if (el) el.innerHTML = `<div class="notice">${esc(err.message)}</div>`; });
  };

  // ---- about
  views.about = function () {
    setTitle('About');
    const mrow = m => `<tr><td>${dot(m.id)} ${esc(m.name)}</td><td>${esc(m.region)}</td><td class="mono small">${esc(m.fwd_name)} ${esc(m.fwd)}<br>${esc(m.rev_name)} ${esc(m.rev)}</td><td class="num">${m.len_min} / ${m.len_median} / ${m.len_max}</td><td class="num">${fmt(m.records)}</td><td class="num">${fmt(m.species)}</td></tr>`;
    main.innerHTML = `
      <h1>About the database</h1>
      <div class="prose">
      <p class="lead">FoodSeq identifies what people have eaten by sequencing the food DNA that survives digestion. Assigning those sequences to foods needs a reference library that covers the species people actually eat, and little else. This database is that library.</p>

      <h2>What is in it</h2>
      </div>
      <div class="tablewrap"><table><thead><tr><th>Database</th><th>Region</th><th>Primers (5′→3′)</th><th class="num">Length min / median / max</th><th class="num">Sequences</th><th class="num">Species</th></tr></thead><tbody>${MARKERS.map(mrow).join('')}</tbody></table></div>
      <div class="prose">
      <p style="margin-top:12px">Sequences come from NCBI RefSeq organelle genomes and GenBank, restricted to a curated list of ${fmt(FOODS.length)} food taxa (see the <a href="#/foods">food list</a>). Each record keeps its NCBI accession and a ten-rank NCBI lineage: ${RANKS.join(', ')}.</p>

      <h2>Sequence conventions</h2>
      <ul>
        <li><b>trnL g/h and 12SV5</b> records are the in-silico PCR product <b>including both primers</b>, forward-oriented (forward primer at the 5′ end, the reverse complement of the reverse primer at the 3′ end). Record pages highlight the primer sites.</li>
        <li><b>trnL c/d</b> records are <b>primer-trimmed</b> and oriented c → d.</li>
        <li>A few records come from GenBank deposits that begin inside a priming site and lack one or two 5′ bases, and control records carry no primers.</li>
      </ul>

      <h2>How it is built</h2>
      <ol>
        <li><b>Acquisition.</b> Complete plastid or mitochondrial genomes from RefSeq, plus per-species GenBank queries for the marker, limited to records of 50 kb or less. Plants whose only <i>trnL</i> sequence sits inside a complete chloroplast genome are reached through a separate plastome query.</li>
        <li><b>In-silico PCR.</b> Amplicons are cut out by primer matching, allowing about 20% mismatch per primer. Records lacking either site are dropped. trnL c/d additionally recovers primer-trimmed deposits by alignment to family-matched plastome introns.</li>
        <li><b>Quality filters.</b> Unverified records and sequences with degenerate bases are removed.</li>
        <li><b>Taxonomy.</b> Accessions are mapped to full NCBI lineages; a phylum allowlist removes anything that is not a land plant (trnL) or vertebrate (12SV5).</li>
        <li><b>Curation.</b> Records shown to be mislabelled are omitted by accession (listed below).</li>
        <li><b>Orientation and deduplication.</b> Identical sequences from the same taxon collapse to one record, RefSeq preferred.</li>
        <li><b>Controls</b> are appended, and a <b>QC gate</b> must pass with zero failures before release.</li>
      </ol>
      <p>The full pipeline, the QC gate and the release history are in the <a href="${esc(META.github)}" rel="noopener">GitHub repository</a>.</p>

      <h2 id="controls">Controls and host taxa</h2>
      <p>Every build includes a small set of deliberately non-food records. They are marked throughout this site and excluded from coverage figures.</p>
      <ul>
        <li><b>Synthetic spike-in controls</b> (trnL g/h and 12SV5): the positive control used in the FoodSeq wet-lab protocol.</li>
        <li><b><i>Homo sapiens</i></b> (12SV5): host DNA makes up roughly half of 12SV5 reads in stool. Without human in the reference those reads are assigned to the nearest vertebrate, which includes food animals.</li>
        <li><b><i>Rhacodactylus leachianus</i></b> (12SV5): a gecko used as a real-species positive control.</li>
        <li><b><i>Nicotiana tabacum</i></b> (trnL): tobacco reaches samples by exposure rather than as food.</li>
      </ul>

      <h2>Known limitations</h2>
      <ul>
        <li><b>Coverage is incomplete.</b> Many food species have no public sequence spanning the primer sites. The <a href="#/foods?cov=none">food list</a> shows exactly which.</li>
        <li><b>12SV5 targets vertebrates only.</b> Edible insects, molluscs and crustaceans on the food list are expected gaps.</li>
        <li><b>Short markers cannot separate every species.</b> Many closely related taxa share an identical amplicon; each record page lists the others that do.</li>
        <li><b>Labels are inferred from sequence, not checked against vouchers.</b> Records are only as reliable as their GenBank annotation. Known mislabels are removed, and others may remain.</li>
        <li><b>The sequence identification tool on this site is a lookup</b>, not a classifier. For analyses, assign taxonomy with DADA2 or QIIME 2 using the downloadable files.</li>
      </ul>
      </div>

      ${D.omitted.length ? `<h2 id="omitted">Records removed as mislabelled</h2>
      <p class="muted">These NCBI records carry a sequence that does not belong to the species on the label. They are omitted by accession and cannot return in a rebuild.</p>
      <div class="tablewrap"><table><thead><tr><th>Accession</th><th>Labelled</th><th>The sequence is</th><th class="hide-sm">Evidence</th><th>Removed from</th></tr></thead><tbody>
        ${D.omitted.map(o => `<tr><td class="mono"><a href="https://www.ncbi.nlm.nih.gov/nuccore/${enc(o.acc)}" rel="noopener">${esc(o.acc)}</a></td><td><i>${esc(o.labelled)}</i></td><td>${esc(o.actually)}</td><td class="hide-sm small">${esc(o.evidence)}</td><td class="small">${esc(o.markers.replace(/;|,/g, ', '))}</td></tr>`).join('')}
      </tbody></table></div>` : ''}

      <div class="prose">
      <h2>Cite and reuse</h2>
      </div>
      ${citeBox()}
      <div class="prose">
      <p style="margin-top:12px">The database is released under <a href="${esc(META.license_url)}" rel="noopener">${esc(META.license)}</a>. Sequences originate from NCBI GenBank and RefSeq; accessions are kept on every record so the original submitters can be credited.</p>
      <h2>Global Food Explorer data</h2>
      <p>The Explorer's food records are drawn from published studies, historical food-plant compendia, museum and herbarium specimen labels and the lab's own list, each under its own open licence (CC BY, CC0 or public domain), so they are <em>not</em> covered by the licence above. See <a href="#/sources">Sources</a>. Records can be reused with attribution to the source paper.</p>
      <h2>Contact</h2>
      <p>${esc(META.lab)}. Questions, corrections and suspected mislabels: ${META.contact_email ? `${esc(META.contact_name)}, <a href="mailto:${esc(META.contact_email)}">${esc(META.contact_email)}</a>, ` : ''}use the <a href="https://edibleatlas.org/contact" rel="noopener">Edible Atlas contact page</a> or <a href="${esc(META.github)}/issues" rel="noopener">open an issue on GitHub</a>.</p>
      </div>`;
  };

  // ---- identify
  const KM = 7, KMASK = (1 << (2 * KM)) - 1;
  const CODE = new Int8Array(128).fill(-1);
  CODE[65] = 0; CODE[67] = 1; CODE[71] = 2; CODE[84] = 3;
  function kmersOf(seq) {
    const out = []; let v = 0, l = 0;
    for (let i = 0; i < seq.length; i++) {
      const c = CODE[seq.charCodeAt(i) & 127];
      if (c < 0) { l = 0; v = 0; continue; }
      v = ((v << 2) | c) & KMASK;
      if (++l >= KM) out.push(v);
    }
    return out;
  }
  const refK = {};
  function refKmers(mid) {
    if (refK[mid]) return refK[mid];
    const S = window.FSDB_SEQ[mid];
    let totalK = 0;
    for (const s of S) totalK += Math.max(0, s.length - KM + 1);
    const km = new Uint16Array(totalK), off = new Int32Array(S.length + 1);
    let p = 0;
    S.forEach((s, i) => { off[i] = p; for (const v of kmersOf(s)) km[p++] = v; });
    off[S.length] = p;
    return (refK[mid] = { km, off });
  }
  function screen(mid, q) {
    const flags = new Uint8Array(1 << (2 * KM));
    for (const v of kmersOf(q)) flags[v] = 1;
    const { km, off } = refKmers(mid), n = off.length - 1, sc = new Int32Array(n);
    let best = 0;
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let p = off[i]; p < off[i + 1]; p++) c += flags[km[p]];
      sc[i] = c; if (c > best) best = c;
    }
    return { sc, best };
  }
  const codes = s => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  // Fit the shorter sequence a inside the longer b (end gaps in b are free).
  // Returns edits and alignment columns; identity = (cols - edits) / cols.
  function fit(a, b) {
    const m = a.length, n = b.length, A = codes(a), B = codes(b);
    let pc = new Uint16Array(n + 1), cc = new Uint16Array(n + 1), pl = new Uint16Array(n + 1), cl = new Uint16Array(n + 1);
    for (let i = 1; i <= m; i++) {
      cc[0] = i; cl[0] = i;
      const ai = A[i - 1];
      for (let j = 1; j <= n; j++) {
        let best = pc[j - 1] + (ai === B[j - 1] ? 0 : 1), len = pl[j - 1] + 1;
        const up = pc[j] + 1;
        if (up < best) { best = up; len = pl[j] + 1; }
        const left = cc[j - 1] + 1;
        if (left < best) { best = left; len = cl[j - 1] + 1; }
        cc[j] = best; cl[j] = len;
      }
      let t = pc; pc = cc; cc = t; t = pl; pl = cl; cl = t;
    }
    let d = 65535, len = m;
    for (let j = 0; j <= n; j++) if (pc[j] < d) { d = pc[j]; len = pl[j]; }
    return { d, len };
  }
  // Same alignment with traceback, for display.
  function fitAlign(a, b) {
    const m = a.length, n = b.length, W = n + 1, M = new Uint16Array((m + 1) * W);
    for (let i = 1; i <= m; i++) {
      M[i * W] = i;
      for (let j = 1; j <= n; j++) {
        const dg = M[(i - 1) * W + j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), up = M[(i - 1) * W + j] + 1, lf = M[i * W + j - 1] + 1;
        M[i * W + j] = Math.min(dg, up, lf);
      }
    }
    let j = 0;
    for (let x = 1; x <= n; x++) if (M[m * W + x] < M[m * W + j]) j = x;
    let i = m, ra = '', rb = '';
    const bEnd = j;
    while (i > 0) {
      const cur = M[i * W + j];
      if (j > 0 && cur === M[(i - 1) * W + j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { ra = a[i - 1] + ra; rb = b[j - 1] + rb; i--; j--; }
      else if (cur === M[(i - 1) * W + j] + 1) { ra = a[i - 1] + ra; rb = '-' + rb; i--; }
      else { ra = '-' + ra; rb = b[j - 1] + rb; j--; }
    }
    return { a: ra, b: rb, bStart: j, bEnd };
  }
  const sym = (x, y) => Math.min(x, y) / Math.max(x, y);
  const MAX_CAND = 200;
  function identifyOne(q, mids) {
    const rc = revcomp(q);
    const perMarker = [];
    for (const mid of mids) {
      const S = window.FSDB_SEQ[mid], m = MK[mid];
      const f = screen(mid, q), r = screen(mid, rc);
      const useRc = r.best > f.best;
      const sc = useRc ? r.sc : f.sc, qq = useRc ? rc : q;
      let cand;
      if (q.length < 30) cand = Array.from(S.keys());
      else {
        cand = [];
        for (let i = 0; i < sc.length; i++) if (sc[i] > 0) cand.push(i);
        cand.sort((x, y) => sc[y] - sc[x]);
        cand = cand.slice(0, MAX_CAND);
      }
      const memo = new Map(), hits = [];
      for (const i of cand) {
        const s = S[i];
        let res = memo.get(s);
        if (!res) {
          const al = qq.length <= s.length ? fit(qq, s) : fit(s, qq);
          const [a, b] = primerSpan(s, m);
          res = { d: al.d, len: al.len, ident: (al.len - al.d) / al.len, ratio: Math.max(sym(q.length, s.length), sym(q.length, b - a)) };
          memo.set(s, res);
        }
        if (res.ident >= 0.6) hits.push({ mid, i, rc: useRc, d: res.d, len: res.len, ident: res.ident, ratio: res.ratio });
      }
      hits.sort((x, y) => y.ident - x.ident || x.d - y.d || y.ratio - x.ratio);
      if (hits.length) perMarker.push({ mid, hits, rc: useRc, capped: cand.length === MAX_CAND });
    }
    // With several candidate markers, keep the one the query fits best: highest
    // identity first, then the closest length (a g/h amplicon also sits inside c/d).
    perMarker.sort((x, y) => y.hits[0].ident - x.hits[0].ident || y.hits[0].ratio - x.hits[0].ratio);
    return perMarker[0] || null;
  }
  function parseQueries(text) {
    const out = [];
    const clean = s => s.toUpperCase().replace(/U/g, 'T').replace(/[^A-Z]/g, '');
    if (text.includes('>')) {
      let name = null, buf = '';
      const push = () => { if (name !== null && buf) out.push({ name, seq: clean(buf) }); };
      text.split(/\r?\n/).forEach(line => {
        if (line.startsWith('>')) { push(); name = line.slice(1).trim() || 'query ' + (out.length + 1); buf = ''; }
        else buf += line;
      });
      push();
    } else {
      text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(line => {
        // "name <tab or space> SEQUENCE" or a bare sequence
        const mt = line.match(/^(.*?)[\s,;]+([ACGTUNacgtun]{8,})$/);
        if (mt) out.push({ name: mt[1], seq: clean(mt[2]) });
        else out.push({ name: 'query ' + (out.length + 1), seq: clean(line) });
      });
    }
    return out;
  }
  views.identify = function () {
    setTitle('Identify a sequence');
    const MAXQ = 200, MAXLEN = 3000, MINLEN = 10;
    main.innerHTML = `
      <h1>Identify a sequence</h1>
      <p class="lead">Paste one or more sequences to find the closest reference records in release ${esc(META.version)}. Everything runs in your browser; nothing you paste is uploaded.</p>
      <div class="card">
        <label class="vh" for="qtext">Query sequences</label>
        <textarea id="qtext" rows="8" spellcheck="false" placeholder="FASTA, or one sequence per line. With or without primers, either strand."></textarea>
        <div class="toolbar" style="margin-bottom:0">
          <label>Search in <select id="qmarker"><option value="">all DNA regions (pick the best fit)</option>${MARKERS.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
          <span class="grow"></span>
          <button class="btn" id="qex">Load an example</button>
          <button class="btn primary" id="qgo">Identify</button>
        </div>
      </div>
      <div id="qstatus" aria-live="polite"></div>
      <div id="qresults"></div>
      <p class="small muted" style="margin-top:20px">How it works: candidate references are screened by shared 7-mers, then the shorter of query and reference is aligned inside the longer one (edit distance, end gaps free). Identity is matches divided by alignment columns. All records tied at the best identity are reported together with the lowest taxon they share. This is a lookup, not a classifier: for analyses, assign taxonomy with DADA2 or QIIME 2 using the <a href="#/downloads">downloadable files</a>.</p>`;
    let lastRun = null;
    $('#qex').addEventListener('click', async e => {
      const exBtn = e.currentTarget;
      exBtn.disabled = true;
      try {
        const lines = [];
        let count = 0;
        const pick = async (mid, species, mutate) => {
          const S = await loadSeq(mid), R = D.records[mid];
          let i = R.lin.findIndex(li => LIN[li][6] === species);
          if (i < 0) i = 0;
          const [a, b] = primerSpan(S[i], MK[mid]);
          let s = S[i].slice(a, b);
          if (mutate && s.length > 40) { const p = Math.floor(s.length / 2); s = s.slice(0, p) + (s[p] === 'A' ? 'G' : 'A') + s.slice(p + 1); }
          lines.push(`>example ${++count} (${MK[mid].name}${mutate ? ', one base changed' : ''})`, s);
        };
        await pick('trnLGH', 'Triticum aestivum');
        await pick('12SV5', 'Gallus gallus', true);
        await pick('trnLGH', 'Malus domestica');
        $('#qtext').value = lines.join('\n');
      } catch (err) { $('#qstatus').innerHTML = `<p class="notice">${esc(err.message)}</p>`; }
      exBtn.disabled = false;
    });
    $('#qgo').addEventListener('click', async e => {
      const btn = e.currentTarget, status = $('#qstatus'), results = $('#qresults');
      let qs = parseQueries($('#qtext').value);
      results.innerHTML = '';
      if (!qs.length) { status.innerHTML = '<p class="notice">Paste at least one sequence.</p>'; return; }
      const notes = [];
      if (qs.length > MAXQ) { notes.push(`Only the first ${MAXQ} of ${fmt(qs.length)} sequences were searched.`); qs = qs.slice(0, MAXQ); }
      btn.disabled = true;
      const choice = $('#qmarker').value;
      const mids = choice ? [choice] : MARKERS.map(m => m.id);
      status.innerHTML = '<p class="muted">Loading reference sequences…</p><div class="progress"><div id="qbar"></div></div>';
      try { await Promise.all(mids.map(loadSeq)); } catch (err) { status.innerHTML = `<p class="notice">${esc(err.message)}</p>`; btn.disabled = false; return; }
      const run = (lastRun = {});
      const rows = [];
      for (let k = 0; k < qs.length; k++) {
        if (lastRun !== run || !$('#qbar')) return;
        const q = qs[k];
        let res = null, problem = '';
        if (q.seq.length < MINLEN) problem = `Too short (${q.seq.length} nt; at least ${MINLEN} needed).`;
        else if (q.seq.length > MAXLEN) problem = `Too long (${fmt(q.seq.length)} nt; the limit is ${fmt(MAXLEN)}).`;
        else if (/[^ACGT]/.test(q.seq) && (q.seq.match(/[^ACGT]/g).length / q.seq.length) > 0.1) problem = 'More than 10% of the characters are not A, C, G or T.';
        else res = identifyOne(q.seq, mids);
        rows.push({ q, res });
        results.insertAdjacentHTML('beforeend', resultCard(q, res, problem, k));
        $('#qbar').style.width = (100 * (k + 1) / qs.length) + '%';
        status.firstChild.textContent = `Searched ${k + 1} of ${qs.length}…`;
        await new Promise(r => setTimeout(r, 0));
      }
      status.innerHTML = `${notes.map(n => `<p class="notice">${esc(n)}</p>`).join('')}<div class="toolbar"><span>${fmt(qs.length)} sequence${qs.length > 1 ? 's' : ''} searched.</span><span class="grow"></span><button class="btn sm" id="qtsv">Download results (TSV)</button></div>`;
      $('#qtsv').addEventListener('click', () => {
        const head = ['query', 'length', 'marker', 'best_identity_pct', 'edits', 'records_at_best', 'taxa_at_best', 'shared_taxon', 'shared_rank', 'top_accession', 'top_taxon'];
        const lines = rows.map(({ q, res }) => {
          if (!res) return [q.name, q.seq.length, '', '', '', 0, 0, '', '', '', ''].join('\t');
          const t = tied(res), anc = lca(t.map(h => D.records[h.mid].lin[h.i])), R = D.records[res.mid], h = res.hits[0];
          return [q.name, q.seq.length, MK[res.mid].name, (100 * h.ident).toFixed(1), h.d, t.length, new Set(t.map(x => R.lin[x.i])).size,
            anc ? anc.name : '', anc ? rankName(anc) : '', baseAcc(R.acc[h.i]), linLeaf[R.lin[h.i]].name].join('\t');
        });
        download(`foodseq_identify_v${META.version}.tsv`, head.join('\t') + '\n' + lines.join('\n') + '\n', 'text/tab-separated-values');
      });
      btn.disabled = false;
    });
    $('#qresults').addEventListener('click', e => {
      const b = e.target.closest('[data-aln]');
      if (!b) return;
      const tr = b.closest('tr'), next = tr.nextElementSibling;
      if (next && next.classList.contains('aln')) { next.remove(); b.textContent = 'Alignment'; return; }
      const [mid, i, rc] = b.dataset.aln.split('|');
      const q = decodeURIComponent(b.closest('.qcard').dataset.q);
      const qq = rc === '1' ? revcomp(q) : q, s = window.FSDB_SEQ[mid][+i];
      tr.insertAdjacentHTML('afterend', `<tr class="aln"><td colspan="6">${alignmentHtml(qq, s, rc === '1')}</td></tr>`);
      b.textContent = 'Hide';
    });
  };
  const tied = res => res.hits.filter(h => h.d === res.hits[0].d && h.ident === res.hits[0].ident);
  function resultCard(q, res, problem, k) {
    const head = `<div class="qhead"><h3>${esc(q.name)}</h3><span class="small muted num">${fmt(q.seq.length)} nt</span></div>`;
    if (!res) {
      return `<article class="card qcard">${head}<div class="verdict"><span class="big">${problem ? 'Not searched' : 'No match'}</span>
        <p class="muted" style="margin:4px 0 0">${esc(problem || 'No reference record is at least 60% identical. The sequence may be from a taxon outside the database, or from a different marker.')}</p></div></article>`;
    }
    const R = D.records[res.mid], m = MK[res.mid], top = res.hits[0];
    const t = tied(res);
    const taxa = [...new Set(t.map(h => linLeaf[R.lin[h.i]]))];
    const anc = lca(t.map(h => R.lin[h.i]));
    const id = (100 * top.ident).toFixed(top.ident === 1 ? 0 : 1);
    const label = top.d === 0 ? 'Exact match' : top.ident >= 0.97 ? 'Close match' : top.ident >= 0.9 ? 'Related sequence' : 'Distant match only';
    const where = taxa.length === 1
      ? `${tlink(taxa[0])}${commonOf(taxa[0]) ? ' (' + esc(commonOf(taxa[0])) + ')' : ''}`
      : `${fmt(taxa.length)} taxa sharing this sequence; lowest shared rank: ${anc ? `${rankName(anc)} ${tlink(anc)}` : 'none'}`;
    const SHOW = 12;
    const rows = res.hits.slice(0, SHOW).map(h => {
      const leaf = linLeaf[R.lin[h.i]];
      return `<tr><td class="num"><b>${(100 * h.ident).toFixed(h.ident === 1 ? 0 : 1)}%</b></td><td class="num">${h.d}</td>
        <td><a class="mono" href="${rurl(h.mid, R.acc[h.i])}">${esc(baseAcc(R.acc[h.i]))}</a></td>
        <td>${tlink(leaf)}${commonOf(leaf) ? `<span class="cn">${esc(commonOf(leaf))}</span>` : ''}</td>
        <td class="num hide-sm">${R.len[h.i]} bp</td><td class="num"><button class="btn sm" data-aln="${h.mid}|${h.i}|${h.rc ? 1 : 0}">Alignment</button></td></tr>`;
    }).join('');
    return `<article class="card qcard" data-q="${enc(q.seq)}">${head}
      <div class="verdict"><div><span class="big">${label} · ${id}%</span> <span class="badge">${dot(res.mid)} ${esc(m.name)}</span></div>
        <p style="margin:6px 0 0">${where}</p>
        <p class="small muted" style="margin:4px 0 0">${fmt(t.length)} record${t.length > 1 ? 's' : ''} at ${id}% identity${top.d ? ` (${top.d} edit${top.d > 1 ? 's' : ''})` : ''}${res.rc ? ' · matched on the reverse strand' : ''}${q.seq.length < 20 ? ' · very short query: matches may be coincidental' : ''}${res.capped && t.length >= MAX_CAND ? ' · more records may tie' : ''}</p></div>
      <div class="tablewrap"><table><thead><tr><th class="num">Identity</th><th class="num">Edits</th><th>Accession</th><th>Taxon</th><th class="num hide-sm">Ref. length</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      ${res.hits.length > SHOW ? `<p class="small muted" style="padding:10px 18px;margin:0">Top ${SHOW} of ${fmt(res.hits.length)} hits shown.</p>` : ''}</article>`;
  }
  function alignmentHtml(q, s, rc) {
    const qShort = q.length <= s.length;
    const al = qShort ? fitAlign(q, s) : fitAlign(s, q);
    const qa = qShort ? al.a : al.b, ra = qShort ? al.b : al.a;
    let out = '';
    const lab = ['Query', 'Ref  '];
    let qp = qShort ? 0 : al.bStart, rp = qShort ? al.bStart : 0;
    for (let i = 0; i < qa.length; i += 60) {
      const a = qa.slice(i, i + 60), b = ra.slice(i, i + 60);
      let la = '', lb = '', mid = '';
      for (let k = 0; k < a.length; k++) {
        const same = a[k] === b[k];
        la += same ? a[k] : `<span class="mm">${a[k]}</span>`;
        lb += same ? b[k] : `<span class="mm">${b[k]}</span>`;
        mid += same ? '|' : ' ';
      }
      const qn = a.replace(/-/g, '').length, rn = b.replace(/-/g, '').length;
      out += `${lab[0]} ${String(qp + 1).padStart(4)}  ${la}  ${qp + qn}\n${' '.repeat(12)}${mid}\n${lab[1]} ${String(rp + 1).padStart(4)}  ${lb}  ${rp + rn}\n\n`;
      qp += qn; rp += rn;
    }
    return `<pre>${out.trimEnd()}</pre><div class="legend"><span><span class="sw mm"></span>mismatch or gap</span>${rc ? '<span>Query shown reverse-complemented.</span>' : ''}<span>Reference positions count from the start of the stored record${qShort ? '' : '; the reference lies inside the query'}.</span></div>`;
  }

  // ------------------------------------------------------------------- router
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const cut = h.indexOf('?');
    const path = cut < 0 ? h : h.slice(0, cut);
    const params = new URLSearchParams(cut < 0 ? '' : h.slice(cut + 1));
    const seg = path.split('/').map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    const name = views[seg[0]] ? seg[0] : (seg[0] ? null : 'welcome');
    $$('#nav a').forEach(a => {
      const on = a.dataset.nav === name || (a.dataset.nav === 'browse' && (name === 'taxon' || name === 'record'));
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $$('#nav .navgroup').forEach(g => {
      g.querySelector('.navbtn').classList.toggle('has-current', !!g.querySelector('a[aria-current]'));
      g.classList.remove('open'); g.querySelector('.navbtn').setAttribute('aria-expanded', 'false');
    });
    $('#nav').classList.remove('open');
    $('.nav-toggle').setAttribute('aria-expanded', 'false');
    if (!name) { setTitle('Not found'); main.innerHTML = '<h1>Page not found</h1><p><a href="#/">Back to the Food Explorer</a></p>'; }
    else views[name](seg, params);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-copy]');
    if (c) copyText(c.dataset.copy, c);
  });
  document.addEventListener('click', async e => {
    const a = e.target.closest('a[data-file]');
    if (!a || !inViewer) return;
    e.preventDefault();
    try {
      const r = await fetch(a.getAttribute('href'));
      if (!r.ok) throw new Error('not found');
      download(a.dataset.file, await r.blob());
    } catch (err) { toast('That file could not be loaded.'); }
  });

  // main menu: groups open on click (desktop dropdowns), Menu button on phones
  const navGroups = $$('#nav .navgroup');
  const closeGroups = except => navGroups.forEach(g => {
    if (g === except) return;
    g.classList.remove('open'); g.querySelector('.navbtn').setAttribute('aria-expanded', 'false');
  });
  navGroups.forEach(g => {
    const btn = g.querySelector('.navbtn');
    btn.addEventListener('click', () => {
      const open = !g.classList.contains('open');
      closeGroups(g);
      g.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open);
    });
  });
  document.addEventListener('click', e => { if (!e.target.closest('#nav')) closeGroups(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGroups(); });
  $('.nav-toggle').addEventListener('click', e => {
    const open = $('#nav').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', open);
  });

  $('#footer').innerHTML = `<div class="cols">
    <div><h3>Edible Atlas FoodSeq</h3>
      <p>Release ${esc(META.version)}. Maintained by ${esc(META.lab)}. Sequences originate from NCBI GenBank and RefSeq.</p>
      <p>The reference sequences are released under <a href="${esc(META.license_url)}" rel="noopener">${esc(META.license)}</a>. Food Explorer records come from published sources whose licences allow reuse with attribution (CC BY, CC0 or public domain); each record names its source, so please credit it. The records are general information about what has been reported, not nutrition or food-safety advice.</p></div>
    <div><h3>Database</h3><ul>
      <li><a href="#/browse">Taxonomy browser</a></li><li><a href="#/foods">Food list</a></li><li><a href="#/identify">Identify sequence</a></li><li><a href="#/downloads">Downloads</a></li></ul></div>
    <div><h3>Reference</h3><ul>
      <li><a href="#/about">Methods and limitations</a></li><li><a href="${doiUrl(citeDoi)}" rel="noopener">Zenodo record</a></li><li><a href="${esc(META.github)}" rel="noopener">Pipeline on GitHub</a></li></ul></div>
  </div>`;
  route();
})();
