// Token Launch Radar dashboard: renders window.RADAR_DATA (written beside this page as
// ../data.js by main.ts). No network, no framework: filter, sort, and a per-protocol
// detail view with the value breakdown and its farm plan. The location hash can carry a
// starting state (#cat=Lending, #watch=1, #detail=<slug>) so a view can be linked or
// captured directly.
(function () {
  var data = window.RADAR_DATA;
  var rows = data.rows.slice();
  var maxImplied = rows.length ? rows[0].implied_value_usd : 1;
  var sortKey = 'rank';
  var sortDir = 1;
  var STEP_TITLES = ['Set up', 'Core loop', 'Widen', 'Stay eligible', 'Launch readiness'];

  var tbody = document.querySelector('#board tbody');
  var count = document.getElementById('count');
  var catSel = document.getElementById('cat');
  var chainSel = document.getElementById('chain');
  var detail = document.getElementById('detail');

  document.getElementById('stamp').innerHTML =
    'Sealed DefiLlama snapshot<br>as of ' + data.as_of;

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }

  var chips = [
    ['Protocols scanned', data.total_protocols, false],
    ['On the board', rows.length, false],
    ['Watchlist covered', data.watchlist_size + ' / ' + data.watchlist_size, true],
    ['Early finds below the floor', data.early_size, false],
    ['Already trading, set aside', data.live_size, false],
    ['Median implied value', money(data.median_implied_usd), true]
  ];
  document.getElementById('chips').innerHTML = chips.map(function (c) {
    return '<span class="chip' + (c[2] ? ' hot' : '') + '">' + c[0] + ' <b>' + c[1] + '</b></span>';
  }).join('');

  var cats = {}, chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
  });

  function visible() {
    var q = document.getElementById('q').value.trim().toLowerCase();
    var cat = catSel.value, chain = chainSel.value;
    var watchOnly = document.getElementById('watchonly').checked;
    var growthOnly = document.getElementById('growthonly').checked;
    var out = rows.filter(function (r) {
      if (watchOnly && !r.on_watchlist) return false;
      if (growthOnly && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      return true;
    });
    out.sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === 'string') return sortDir * x.localeCompare(y);
      return sortDir * (x - y);
    });
    return out;
  }

  function factor(label, value, note) {
    return '<div class="factor"><div class="flabel">' + label + '</div><div class="fvalue">' +
      value + '</div><div class="fnote">' + note + '</div></div>';
  }

  function showDetail(r) {
    document.getElementById('d-name').textContent = r.name;
    document.getElementById('d-badge').innerHTML = r.on_watchlist ? '<span class="badge">watchlist</span>' : '<span class="badge">early find</span>';
    document.getElementById('d-meta').textContent =
      'Rank #' + r.rank + ' of ' + rows.length + ' · ' + (r.category || 'Uncategorised') +
      ' · chains: ' + (r.chains.join(', ') || 'n/a') +
      (r.listed_at ? ' · tracked since ' + r.listed_at : ' · listing date unreported') +
      (r.change_7d === null ? ' · 7d TVL change unreported' : ' · 7d TVL change ' + (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%');
    document.getElementById('d-breakdown').innerHTML =
      factor('TVL', money(r.tvl_usd), 'in the snapshot') + '<span class="fop">×</span>' +
      factor('Category multiple', r.multiple.toFixed(2) + 'x', 'median of ' + r.peers + ' traded peers') + '<span class="fop">×</span>' +
      factor('Momentum', r.growth_factor.toFixed(2) + 'x', '7-day TVL growth, clamped') + '<span class="fop">×</span>' +
      factor('Maturity', r.age_factor.toFixed(2) + 'x', 'years running with no token') + '<span class="fop">=</span>' +
      '<div class="factor result"><div class="flabel">Implied value</div><div class="fvalue">' + money(r.implied_value_usd) + '</div><div class="fnote">the radar\u2019s claim, not a forecast</div></div>';
    var ol = document.getElementById('d-steps');
    ol.innerHTML = '';
    r.farm_steps.forEach(function (s, i) {
      var li = document.createElement('li');
      var t = document.createElement('span');
      t.className = 'stitle';
      t.textContent = STEP_TITLES[i] || ('Step ' + (i + 1));
      li.appendChild(t);
      li.appendChild(document.createTextNode(s));
      ol.appendChild(li);
    });
    detail.hidden = false;
    detail.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    var list = visible();
    count.textContent = 'Showing ' + list.length + ' of ' + rows.length + ' protocols — click a row for its farm plan';
    tbody.innerHTML = '';
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      var rankClass = r.rank === 1 ? ' top1' : r.rank === 2 ? ' top2' : r.rank === 3 ? ' top3' : '';
      var change = r.change_7d === null ? '—' : (r.change_7d > 0 ? '▲ ' : r.change_7d < 0 ? '▼ ' : '') + Math.abs(r.change_7d).toFixed(1) + '%';
      var chainHtml = r.chains.slice(0, 2).map(function (c) { return '<span class="chainpill">' + c + '</span>'; }).join('') +
        (r.chains.length > 2 ? '<span class="chainpill">+' + (r.chains.length - 2) + '</span>' : '');
      var pct = Math.max(1.5, Math.round((r.implied_value_usd / maxImplied) * 1000) / 10);
      var cells = [
        '<span class="rankchip' + rankClass + '">' + r.rank + '</span>',
        '<span class="pname">' + r.name + '</span>' + (r.on_watchlist ? '<span class="badge">watchlist</span>' : '') + '<span class="pslug">' + r.slug + '</span>',
        r.category || '—',
        chainHtml,
        money(r.tvl_usd),
        change,
        '<span class="ivalue">' + money(r.implied_value_usd) + '</span><div class="bar"><i style="width:' + pct + '%"></i></div>',
        r.multiple.toFixed(2) + 'x'
      ];
      cells.forEach(function (c, i) {
        var td = document.createElement('td');
        if (i >= 4) td.className = 'num';
        if (i === 5 && r.change_7d !== null) td.className += r.change_7d >= 0 ? ' pos' : ' neg';
        td.innerHTML = c;
        tr.appendChild(td);
      });
      tr.addEventListener('click', function () { showDetail(r); });
      tbody.appendChild(tr);
    });
  }

  document.querySelectorAll('#board th[data-key]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-key');
      if (sortKey === key) sortDir = -sortDir;
      else if (key === 'rank') { sortKey = key; sortDir = 1; }
      else { sortKey = key; sortDir = (key === 'name' || key === 'category') ? 1 : -1; }
      render();
    });
  });
  ['q', 'cat', 'chain', 'watchonly', 'growthonly'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', render);
    document.getElementById(id).addEventListener('change', render);
  });
  document.getElementById('close').addEventListener('click', function () { detail.hidden = true; });

  // Starting state from the hash, e.g. #cat=Lending&watch=1 or #detail=<slug>.
  var hash = {};
  location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
    var at = kv.indexOf('=');
    if (at > 0) hash[decodeURIComponent(kv.slice(0, at))] = decodeURIComponent(kv.slice(at + 1));
  });
  if (hash.cat) catSel.value = hash.cat;
  if (hash.chain) chainSel.value = hash.chain;
  if (hash.watch === '1') document.getElementById('watchonly').checked = true;
  if (hash.q) document.getElementById('q').value = hash.q;
  render();
  if (hash.detail) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].slug === hash.detail) { showDetail(rows[i]); break; }
    }
  }
})();
