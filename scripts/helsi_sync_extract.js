(function () {
  /* helsi.pro -> local receiver of scripts/helsi_sync.py. Run ONLY in a logged-in https://helsi.pro tab.
     The port and token placeholders below are filled in by helsi_sync.py.
     PORT '0' = do not post anywhere: data stays in window.__helsiPayload and helsi_sync.py pulls it via CDP.
     Keep this file ASCII-only (AppleScript garbles other encodings) and free of line comments. */
  if (window.__helsiSync && !window.__helsiSync.done) return 'already running';
  var PORT = '__PORT__', TOKEN = '__TOKEN__';
  var YEAR = new Date().getFullYear();
  var COLS = 'resolution,patientSeverity,patientData,diagnosisIcd10Am,inpatientDepartment,inpatientDepartmentName';
  var S = window.__helsiSync = { closed: 0, open: 0, episodes: 0, disp: 0, sent: {}, err: {}, done: false };

  async function paged(name, mk, limit, cap, pick) {
    var skip = 0, all = [], hasNext = true;
    try {
      while (hasNext) {
        var r = await fetch(mk(skip, limit), { credentials: 'include' });
        if (!r.ok) { S.err[name] = 'HTTP ' + r.status + ' skip ' + skip; return null; }
        var d = await r.json();
        var rows = pick(d);
        if (!Array.isArray(rows)) { S.err[name] = 'no rows skip ' + skip; return null; }
        for (var i = 0; i < rows.length; i++) all.push(rows[i]);
        S[name] = all.length;
        hasNext = d.meta ? d.meta.hasNext : d.has_next;
        skip += limit;
        if (skip > cap) { S.err[name] = 'cap exceeded'; return null; }
      }
    } catch (e) { S.err[name] = String(e); return null; }
    return all;
  }

  async function disposition() {
    var skip = 0, limit = 300, all = [], hasNext = true, stop = false;
    try {
      while (hasNext && !stop) {
        var r = await fetch('/api/hospital/api/v1/encounter_cases/?limit=' + limit + '&skip=' + skip + '&page_size=' + limit + '&status=closed', { credentials: 'include' });
        if (!r.ok) { S.err.disp = 'HTTP ' + r.status + ' skip ' + skip; return null; }
        var d = await r.json();
        if (!Array.isArray(d.results)) { S.err.disp = 'no results skip ' + skip; return null; }
        for (var i = 0; i < d.results.length; i++) {
          var c = d.results[i];
          if (c.start_datetime && c.start_datetime < (YEAR + '-01-01')) { stop = true; break; }
          all.push({ id: c.id, number: c.number, disp: c.discharge_disposition ? c.discharge_disposition.id : null });
        }
        S.disp = all.length;
        hasNext = d.has_next;
        skip += limit;
        if (skip > 30000) { S.err.disp = 'cap exceeded'; return null; }
      }
    } catch (e) { S.err.disp = String(e); return null; }
    return all;
  }

  async function post(name, payload) {
    try {
      var r = await fetch('http://localhost:' + PORT + '/ingest?name=' + name + '&token=' + TOKEN, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      S.sent[name] = r.status;
    } catch (e) { S.err['send_' + name] = String(e); }
  }

  (async function () {
    var res = await Promise.all([
      paged('closed', function (s, l) { return '/api/cards?columns=' + COLS + '&limit=' + l + '&skip=' + s + '&isActive=false&startDateFrom=' + YEAR + '-01-01T00%3A00%3A00%2B03%3A00&startDateTo=' + YEAR + '-12-31T23%3A59%3A59%2B03%3A00'; }, 50, 50000, function (d) { return d.data; }),
      paged('open', function (s, l) { return '/api/cards?columns=' + COLS + '&limit=' + l + '&skip=' + s + '&loadNonInpatientDepartments=false&startDateTo=2030-01-01T00%3A00%3A00%2B03%3A00'; }, 50, 50000, function (d) { return d.data; }),
      paged('episodes', function (s, l) { return '/api/organizationEpisodes?limit=' + l + '&skip=' + s; }, 30, 60000, function (d) { return d.data; }),
      disposition()
    ]);
    var now = new Date().toISOString();
    var P = {};
    if (res[0]) P.closed = { meta: { type: 'closed', year: YEAR, extractedAt: now, count: res[0].length }, data: res[0] };
    if (res[1]) P.open = { meta: { type: 'open', extractedAt: now, count: res[1].length }, data: res[1] };
    if (res[2]) P.episodes = { meta: { type: 'episodes', extractedAt: now, count: res[2].length }, data: res[2] };
    if (res[3]) P.disp = res[3];
    window.__helsiPayload = P;
    if (PORT !== '0') {
      for (var k in P) await post(k, P[k]);
    }
    S.done = true;
  })();
  return 'started';
})()
