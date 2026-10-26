// East Africa Mobility Watch — Explore · Insights · Story
// Leaflet + Chart.js, real open data (IDMC IDU, CHIRPS, geoBoundaries) prepared by scripts/build_data.py
(async function () {
  const V = "6";
  const [D, geoC, geoA, ev] = await Promise.all([
    fetch(`data/displacement.json?v=${V}`).then(r => r.json()),
    fetch(`data/igad_countries.geojson?v=${V}`).then(r => r.json()),
    fetch(`data/igad_adm1.geojson?v=${V}`).then(r => r.json()),
    fetch(`data/events.geojson?v=${V}`).then(r => r.json()),
  ]);
  const N = D.months.length;                    // 12 months
  const ALLM = [...Array(N).keys()];
  const LAB = D.labels;                          // "Oct 2025" …
  const SHORT = LAB.map(l => l.slice(0, 3));
  const WIN = `${LAB[0]} – ${LAB[N - 1]}`;
  const ISO = Object.keys(D.countries);
  const ADM = Object.keys(D.adm1);
  const HZ = D.hazards;                          // Flood, Drought, Conflict, Other disasters
  const RAMP = ["#e6f0fc", "#b7d3f6", "#6da7ec", "#2a78d6", "#1c5cab", "#0d366b"];

  // ---------- helpers ----------
  const $ = id => document.getElementById(id);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const short = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : fmt(n);
  const pct = (a, b) => Math.round(a / Math.max(1, b) * 100);
  const HZC = () => ({ Flood: css("--c1"), Drought: css("--c2"), Conflict: css("--c3"), "Other disasters": css("--c5") });
  let C = HZC();
  const hzList = h => h === "All" ? HZ : [h];
  const hzLabel = hz => hz.length === HZ.length ? "All hazards" : hz[0];
  const nameOf = (lvl, id) => lvl === "adm1" ? `${D.adm1[id].n}, ${D.countries[D.adm1[id].c]}` : D.countries[id];
  const arrOf = (lvl, id) => lvl === "adm1" ? D.adm1[id].v : D.values[id];
  function v(lvl, id, months, hz) {
    const a = arrOf(lvl, id); let s = 0;
    for (const m of months) for (const h of hz) s += a[m][HZ.indexOf(h)];
    return s;
  }
  const vc = (iso, months, hz) => v("country", iso, months, hz);
  const regionM = (months, hz) => ISO.reduce((s, i) => s + vc(i, months, hz), 0);
  const rainOf = (lvl, id, k) => (lvl === "adm1" ? D.rain.adm1[id] : D.rain.country[id])?.[k] ?? null;

  // ---------- state ----------
  const state = { hazard: "All", k: N, metric: "abs", level: "country", sel: null, view: "explore",
    layers: { choro: true, events: true, rain: false, countries: true, adm1lines: false }, rainOpacity: 0.7 };
  const monthsOf = () => state.k === N ? ALLM : [state.k];
  const periodLabel = () => state.k === N ? `12 months · ${WIN}` : LAB[state.k];
  const ids = lvl => lvl === "adm1" ? ADM : ISO;

  // ---------- Chart.js theme ----------
  function themeCharts() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = css("--ink-2");
    Chart.defaults.borderColor = css("--line");
    Object.assign(Chart.defaults.plugins.legend.labels, { boxWidth: 10, boxHeight: 10 });
    Object.assign(Chart.defaults.plugins.tooltip, { backgroundColor: css("--ink"), titleColor: css("--surface"), bodyColor: css("--surface") });
  }
  themeCharts();
  const charts = {};
  const mk = (id, cfg) => { charts[id]?.destroy(); charts[id] = new Chart($(id), cfg); return charts[id]; };
  const bar = (label, data, color, extra = {}) => ({ label, data, backgroundColor: color, borderColor: css("--surface"), borderWidth: 1, borderRadius: 3, borderSkipped: false, maxBarThickness: 26, ...extra });
  const rainLine = data => ({ type: "line", label: "Rainfall % of normal", data, yAxisID: "y2", borderColor: css("--ink"), backgroundColor: css("--ink"), borderWidth: 2, borderDash: [4, 3], pointRadius: 2.5, pointStyle: "line", tension: 0.25, spanGaps: false, order: -1 });

  // combo chart: stacked bars by hazard (+ optional rainfall line on a right axis)
  function combo(id, lvl, sid, hz, opts = {}) {
    const series = hz.map(h => bar(h, ALLM.map(m => sid ? v(lvl, sid, [m], [h]) : regionM([m], [h])),
      opts.focus ? ALLM.map(m => opts.focus.includes(m) ? C[h] : css("--neutral")) : C[h], { maxBarThickness: 18 }));
    const rain = sid ? ALLM.map(m => rainOf(lvl, sid, m)) : null;
    const showRain = rain && rain.some(x => x != null);
    if (showRain) series.push(rainLine(rain));
    return mk(id, {
      type: "bar",
      data: { labels: SHORT, datasets: series },
      options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: hz.length > 1 || showRain, position: "bottom" },
          tooltip: { callbacks: { title: c => LAB[c[0].dataIndex], label: c => c.dataset.yAxisID === "y2" ? ` Rainfall: ${c.raw == null ? "dry season" : Math.round(c.raw) + "% of normal"}` : ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: short } },
          ...(showRain ? { y2: { position: "right", min: 0, suggestedMax: 200, grid: { display: false }, ticks: { callback: x => x + "%" }, title: { display: true, text: "rain % normal" } } } : {}) } },
    });
  }

  // ---------- map ----------
  const map = L.map("map", { minZoom: 3, zoomSnap: 0.5 }).setView([6, 38], 4);
  map.createPane("rainPane").style.zIndex = 420;
  map.createPane("linePane").style.zIndex = 430; map.getPane("linePane").style.pointerEvents = "none";
  map.createPane("eventPane").style.zIndex = 640;
  const basemaps = {
    gray: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors", maxZoom: 16 }),
    imagery: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Imagery © Esri", maxZoom: 18 }),
  };
  basemaps.gray.addTo(map);
  document.querySelectorAll("#basemap button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#basemap button").forEach(x => x.classList.toggle("on", x === b));
    Object.values(basemaps).forEach(l => map.removeLayer(l)); basemaps[b.dataset.b].addTo(map).bringToBack();
  });

  // choropleth classes: quantiles of non-zero values, rounded to nice numbers
  let breaks = [], paint = { lvl: "country", fn: id => 0, title: "", f: short };
  const nice = x => { if (x < 10) return Math.ceil(x); const p = 10 ** Math.floor(Math.log10(x)); return Math.ceil(x / p * 2) / 2 * p; };
  function computeBreaks(lvl, fn) {
    const xs = ids(lvl).map(fn).filter(x => x > 0).sort((a, b) => a - b);
    if (!xs.length) { breaks = [1, 2, 3, 4, 5]; return; }
    if (lvl === "country") {           // only 8 units: classes proportional to the maximum
      breaks = [...new Set([0.05, 0.15, 0.3, 0.5, 0.75].map(p => nice(xs[xs.length - 1] * p)))]; return;
    }
    const q = p => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
    breaks = [...new Set([0.2, 0.4, 0.6, 0.8, 0.95].map(p => nice(q(p))))];
  }
  const colorFor = x => { if (!(x > 0)) return css("--empty"); let i = 0; while (i < breaks.length && x > breaks[i]) i++; return RAMP[Math.min(i + (6 - breaks.length - 1), 5)]; };
  let highlight = null;

  function polyStyle(lvl) {
    return f => {
      const id = lvl === "adm1" ? f.properties.id : f.properties.iso3;
      const on = (highlight || state.sel?.id) === id;
      const dim = highlight && highlight !== id && !(lvl === "adm1" && D.adm1[id]?.c === highlight);
      return { fillColor: colorFor(paint.fn(id)), fillOpacity: state.layers.choro ? (dim ? 0.3 : 0.82) : 0,
        color: on ? css("--ink") : "#ffffff", weight: on ? 3 : lvl === "adm1" ? 0.6 : 1 };
    };
  }
  function bindPoly(lvl) {
    return (f, l) => {
      const id = lvl === "adm1" ? f.properties.id : f.properties.iso3;
      l.on({
        mouseover: e => e.target.setStyle({ weight: 2.5, color: css("--ink") }),
        mouseout: e => (lvl === "adm1" ? adm1Fill : countryFill).resetStyle(e.target),
        click: () => { if (state.view === "explore") select(lvl, id); },
      });
      l.bindTooltip(() => tip(lvl, id), { sticky: true });
    };
  }
  const countryFill = L.geoJSON(geoC, { style: polyStyle("country"), onEachFeature: bindPoly("country") });
  const adm1Fill = L.geoJSON(geoA, { style: polyStyle("adm1"), onEachFeature: bindPoly("adm1") });
  const countryLine = L.geoJSON(geoC, { pane: "linePane", interactive: false, style: { fill: false, color: "#3a3a36", weight: 1.4, opacity: 0.85 } });
  const adm1Line = L.geoJSON(geoA, { pane: "linePane", interactive: false, style: { fill: false, color: "#5a5a55", weight: 0.6, opacity: 0.7 } });
  const regionBounds = countryFill.getBounds();
  map.fitBounds(regionBounds, { padding: [10, 10] });

  function tip(lvl, id) {
    const x = paint.fn(id), tot = ids(paint.lvl).reduce((s, i) => s + paint.fn(i), 0);
    const r = rainOf(lvl, id, state.view === "explore" ? state.k : (story?.rainK ?? N));
    const val = paint.title.startsWith("Share") ? `${Math.round(x)}% of region` : `${fmt(x)} people newly displaced`;
    return `<b>${nameOf(lvl, id)}</b><br>${val}${paint.title.startsWith("Share") ? "" : `<br><span style="opacity:.75">${pct(x, tot)}% of region</span>`}` +
      (state.layers.rain ? `<br>Rainfall: ${r == null ? "dry season" : Math.round(r) + "% of normal"}` : "");
  }

  // events (IDMC records) as proportional circles
  const evRenderer = L.canvas({ pane: "eventPane" });
  const evLayer = L.layerGroup();
  function drawEvents(months, hz) {
    evLayer.clearLayers();
    const ms = new Set(months), hs = new Set(hz.map(h => HZ.indexOf(h)));
    const feats = ev.features.filter(f => ms.has(f.properties.m) && hs.has(f.properties.h)).sort((a, b) => b.properties.f - a.properties.f);
    for (const f of feats) {
      const p = f.properties, [lon, lat] = f.geometry.coordinates;
      L.circleMarker([lat, lon], { renderer: evRenderer, radius: Math.max(3, Math.sqrt(p.f) / 18), color: "#ffffff", weight: 1, fillColor: C[HZ[p.h]], fillOpacity: 0.85 })
        .bindPopup(`<div class="pop"><b>${fmt(p.f)} people · ${HZ[p.h]}</b><br>${p.d} · ${D.countries[p.c]}<br>${p.loc}<br><span class="src">${p.ev}<br>Source: ${p.src || "n/a"} (via IDMC)</span></div>`)
        .addTo(evLayer);
    }
    return feats.length;
  }

  // rainfall overlay
  let rainImg = null, rainK = null;
  function drawRain(k) {
    const key = k === N ? "all" : D.months[k];
    if (!state.layers.rain) { if (rainImg) map.removeLayer(rainImg); rainImg = null; rainK = null; return; }
    if (rainImg && rainK === key) { rainImg.setOpacity(state.rainOpacity); return; }
    if (rainImg) map.removeLayer(rainImg);
    rainImg = L.imageOverlay(`data/rain/${key}.png?v=${V}`, D.rain.bounds, { pane: "rainPane", opacity: state.rainOpacity, interactive: false, className: "rainimg" }).addTo(map);
    rainK = key;
  }

  function syncLayers(lvl) {
    const want = [[countryFill, lvl === "country"], [adm1Fill, lvl === "adm1"], [countryLine, state.layers.countries],
      [adm1Line, state.layers.adm1lines && lvl === "country"], [evLayer, state.layers.events]];
    for (const [l, on] of want) { if (on && !map.hasLayer(l)) l.addTo(map); if (!on && map.hasLayer(l)) map.removeLayer(l); }
    $("rainOp").hidden = !state.layers.rain;
  }

  function drawLegend(nEvents, k) {
    let h = "";
    if (state.layers.choro) {
      const f = paint.f, lab = [`≤ ${f(breaks[0])}`];
      for (let i = 1; i < breaks.length; i++) lab.push(`${f(breaks[i - 1])} – ${f(breaks[i])}`);
      lab.push(`> ${f(breaks[breaks.length - 1])}`);
      const off = 6 - breaks.length - 1;
      h += `<h4>${paint.title}</h4><div><i class="sq" style="background:${css("--empty")}"></i>None reported</div>` +
        lab.map((t, i) => `<div><i class="sq" style="background:${RAMP[i + off]}"></i>${t}</div>`).join("");
    }
    if (state.layers.rain) {
      const b = D.rain.breaks, cl = D.rain.colors, t = [`< ${b[0]}%`];
      for (let i = 1; i < b.length; i++) t.push(`${b[i - 1]}–${b[i]}%`);
      t.push(`> ${b[b.length - 1]}%`);
      h += `<h4 class="sep">Rainfall · ${k === N ? "12-month total" : LAB[k]} · % of normal</h4><div class="ramp">${cl.map((c, i) => `<span title="${t[i]}" style="background:${c}"></span>`).join("")}</div><div class="ramp-l"><span>drier</span><span>normal</span><span>wetter</span></div><div><i class="sq" style="background:#bebeb9"></i>dry season</div>`;
    }
    if (state.layers.events) h += `<h4 class="sep">Events</h4><div><i class="dot"></i>${fmt(nEvents)} records · size = people</div>`;
    $("legend").innerHTML = h; $("legend").hidden = !h;
  }

  // one call repaints every map layer
  function paintMap(lvl, fn, title, f = short, opt = {}) {
    paint = { lvl, fn, title, f };
    computeBreaks(lvl, fn);
    syncLayers(lvl);
    (lvl === "adm1" ? adm1Fill : countryFill).setStyle(polyStyle(lvl));
    const n = drawEvents(opt.months || monthsOf(), opt.hz || hzList(state.hazard));
    drawRain(opt.rainK ?? state.k);
    drawLegend(n, opt.rainK ?? state.k);
  }

  function fly(b, opts) {
    setTimeout(() => {
      const el = map.getContainer();
      if (!el.clientWidth || !el.clientHeight || !b) return;
      map.invalidateSize();
      try { map.stop(); map.flyToBounds(b, opts); } catch (e) { map.fitBounds(b, { padding: opts.padding }); }
    }, 60);
  }
  const boundsOf = (lvl, id) => { let b = null; (lvl === "adm1" ? adm1Fill : countryFill).eachLayer(l => { const p = l.feature.properties; if ((lvl === "adm1" ? p.id : p.iso3) === id) b = l.getBounds(); }); return b; };

  // ---------- KPIs ----------
  function drawKpis(months, hz, lvl, focus) {
    const tot = regionM(months, hz);
    const top = ids(lvl).map(i => [i, v(lvl, i, months, hz)]).sort((a, b) => b[1] - a[1])[0];
    const byH = HZ.map(h => [h, regionM(months, [h])]).sort((a, b) => b[1] - a[1]);
    const peak = ALLM.map(m => [m, regionM([m], hz)]).sort((a, b) => b[1] - a[1])[0];
    const items = [
      ["New displacements", fmt(tot), "", focus],
      [lvl === "adm1" ? "Top admin-1 hotspot" : "Most affected country", lvl === "adm1" ? D.adm1[top[0]].n : D.countries[top[0]], "", `${lvl === "adm1" ? D.countries[D.adm1[top[0]].c] + " · " : ""}${fmt(top[1])} people · ${pct(top[1], tot)}%`],
      ["Main driver (all hazards)", byH[0][0], C[byH[0][0]], `${pct(byH[0][1], regionM(months, HZ))}% of displacements`],
      ["Peak month", LAB[peak[0]], "", `${fmt(peak[1])} people · ${hzLabel(hz).toLowerCase()}`],
    ];
    $("kpis").innerHTML = items.map(([t, val, col, s]) =>
      `<div class="kpi"><span>${col ? `<i style="background:${col}"></i>` : ""}${t}</span><b>${val}</b><small>${s}</small></div>`).join("");
  }

  // ---------- Explore ----------
  const curVal = (lvl, id) => v(lvl, id, monthsOf(), hzList(state.hazard));
  function drawExplore() {
    const months = monthsOf(), hz = hzList(state.hazard), lvl = state.level;
    const tot = regionM(months, hz);
    const fn = state.metric === "share" ? id => curVal(lvl, id) / Math.max(1, tot) * 100 : id => curVal(lvl, id);
    paintMap(lvl, fn, state.metric === "share" ? "Share of region" : "People newly displaced", state.metric === "share" ? x => (x < 1 ? x.toFixed(1) : Math.round(x)) + "%" : short);
    drawKpis(months, hz, lvl, state.k === N ? `${WIN}, all IGAD countries` : LAB[state.k]);
    $("monthLabel").textContent = periodLabel();
    const s = state.sel;
    $("dTitle").textContent = s ? nameOf(s.lvl, s.id) : "IGAD region";
    $("dHint").innerHTML = s
      ? `Monthly displacement by hazard, with rainfall vs normal · <a href="#" id="clr">back to region</a>`
      : `Click a ${lvl === "adm1" ? "state / region" : "country"} on the map, or a row below. Turn on <b>Rainfall</b> in the Layers panel to compare with climate.`;
    $("clr") && ($("clr").onclick = e => { e.preventDefault(); select(null); });
    combo("c-trend", s?.lvl, s?.id, hz);
    // ranking table
    let pool = ids(lvl);
    const scopeIso = s ? (s.lvl === "adm1" ? D.adm1[s.id].c : s.id) : null;
    if (lvl === "adm1" && scopeIso) pool = pool.filter(i => D.adm1[i].c === scopeIso);
    const rows = pool.map(i => ({ i, x: curVal(lvl, i) })).sort((a, b) => b.x - a.x).slice(0, lvl === "adm1" ? 15 : 99);
    const max = rows[0]?.x || 1;
    $("rankH").textContent = lvl === "adm1" ? (scopeIso ? `Admin-1 in ${D.countries[scopeIso]}` : "Top admin-1 units") : "Country";
    $("rank").tBodies[0].innerHTML = rows.map(r => `<tr data-id="${r.i}"${r.i === s?.id ? ' class="sel"' : ""}>
      <td>${lvl === "adm1" ? `${D.adm1[r.i].n}<small> ${D.adm1[r.i].c}</small>` : D.countries[r.i]}</td><td><div class="b"><i style="width:${r.x / max * 70}%;background:${css("--c1")}"></i>${fmt(r.x)}</div></td>
      <td class="r">${pct(r.x, tot)}%</td></tr>`).join("");
    document.querySelectorAll("#rank tbody tr").forEach(tr => tr.onclick = () => select(lvl, tr.dataset.id));
  }
  function select(lvl, id) {
    state.sel = !lvl || (state.sel?.id === id) ? null : { lvl, id };
    const b = state.sel && boundsOf(state.sel.lvl, state.sel.id);
    fly(b || regionBounds, { padding: [20, 20], maxZoom: state.sel?.lvl === "adm1" ? 7 : 6, duration: 0.7 });
    refresh();
  }

  // ---------- Insights ----------
  const tipEl = Object.assign(document.createElement("div"), { className: "tip", hidden: true });
  document.body.appendChild(tipEl);
  const order = [...ISO].sort((a, b) => vc(b, ALLM, HZ) - vc(a, ALLM, HZ));
  $("rainIso").innerHTML = order.filter(i => vc(i, ALLM, HZ) > 0).map(i => `<option value="${i}">${D.countries[i]}</option>`).join("");
  $("rainIso").value = "SOM";
  $("rainIso").onchange = () => drawInsights();
  function drawInsights() {
    const hz = hzList(state.hazard);
    drawKpis(ALLM, hz, "adm1", `${WIN}, ${hzLabel(hz).toLowerCase()}`);
    // seasonal heatmap
    const cells = ISO.flatMap(i => ALLM.map(m => vc(i, [m], hz)));
    const max = Math.max(1, ...cells);
    const heatColor = x => x <= 0 ? css("--empty") : RAMP[Math.min(RAMP.length - 1, Math.floor(Math.sqrt(x / max) * RAMP.length))];
    const ord = [...ISO].sort((a, b) => vc(b, ALLM, hz) - vc(a, ALLM, hz));
    $("heat").innerHTML = `<div></div>` + SHORT.map((m, i) => `<div class="h">${m}${i === 0 || m === "Jan" ? `<br><small>${LAB[i].slice(-4)}</small>` : "<br><small>&nbsp;</small>"}</div>`).join("") +
      ord.map(i => `<div class="n">${D.countries[i]}</div>` + ALLM.map(m => {
        const x = vc(i, [m], hz), r = rainOf("country", i, m);
        return `<div class="c" style="background:${heatColor(x)}" data-t="${D.countries[i]} · ${LAB[m]}: ${fmt(x)} people${r != null ? ` · rain ${Math.round(r)}% of normal` : ""}"></div>`;
      }).join("")).join("");
    $("heat-legend").innerHTML = `None <i style="background:${css("--empty")}"></i> Fewer ${RAMP.map(c => `<i style="background:${c}"></i>`).join("")} More · ${hzLabel(hz).toLowerCase()} (square-root scale)`;
    $("heat").onmousemove = e => { const c = e.target.closest(".c"); if (!c) { tipEl.hidden = true; return; } tipEl.hidden = false; tipEl.textContent = c.dataset.t; tipEl.style.left = Math.min(e.clientX + 12, innerWidth - 300) + "px"; tipEl.style.top = e.clientY + 12 + "px"; };
    $("heat").onmouseleave = () => tipEl.hidden = true;
    combo("c-rain", "country", $("rainIso").value, hz);
    // admin-1 hotspots
    const hot = [...ADM].sort((a, b) => v("adm1", b, ALLM, hz) - v("adm1", a, ALLM, hz)).slice(0, 10);
    mk("c-hot", {
      type: "bar",
      data: { labels: hot.map(i => `${D.adm1[i].n} (${D.adm1[i].c})`), datasets: hz.map(h => bar(h, hot.map(i => v("adm1", i, ALLM, [h])), C[h], { maxBarThickness: 16 })) },
      options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: hz.length > 1, position: "bottom" }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
        scales: { x: { stacked: true, ticks: { callback: short } }, y: { stacked: true, grid: { display: false } } } },
    });
    mk("c-region", {
      type: "line",
      data: { labels: SHORT, datasets: HZ.map(h => ({ label: h, data: ALLM.map(m => regionM([m], [h])), borderColor: C[h], backgroundColor: C[h], borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.3 })) },
      options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { title: c => LAB[c[0].dataIndex], label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: short } } } },
    });
    const mixIso = order.filter(i => vc(i, ALLM, HZ) > 0);
    mk("c-mix", {
      type: "bar",
      data: { labels: mixIso.map(i => D.countries[i]), datasets: HZ.map(h => bar(h, mixIso.map(i => vc(i, ALLM, [h]) / vc(i, ALLM, HZ) * 100), C[h])) },
      options: { indexAxis: "y", maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.raw.toFixed(0)}%` } } },
        scales: { x: { stacked: true, max: 100, ticks: { callback: x => x + "%" } }, y: { stacked: true, grid: { display: false } } } },
    });
    // findings, all computed from the data
    const yr = regionM(ALLM, HZ), top2 = order.slice(0, 2), conf = regionM(ALLM, ["Conflict"]);
    const hot1 = [...ADM].sort((a, b) => v("adm1", b, ALLM, HZ) - v("adm1", a, ALLM, HZ))[0];
    const dryM = somDry();
    $("findings").innerHTML = [
      [`${pct(vc(top2[0], ALLM, HZ) + vc(top2[1], ALLM, HZ), yr)}% in two countries`, `${D.countries[top2[0]]} and ${D.countries[top2[1]]} recorded most of the ${short(yr)} new displacements in ${WIN}.`],
      [`Conflict drives ${pct(conf, yr)}%`, `Climate hazards add ${short(yr - conf)} more, led by floods (${short(regionM(ALLM, ["Flood"]))}) and drought (${short(regionM(ALLM, ["Drought"]))}).`],
      [`${D.adm1[hot1].n} is the top hotspot`, `${fmt(v("adm1", hot1, ALLM, HZ))} people (${pct(v("adm1", hot1, ALLM, HZ), yr)}% of the region) in one admin-1 unit of ${D.countries[D.adm1[hot1].c]}, from ${topHz("adm1", hot1).join(" and ").toLowerCase()}.`],
      dryM ? [`Failed rains, then drought`, `Somalia's rainfall fell to ${Math.round(dryM.r)}% of normal in ${LAB[dryM.m]}; ${short(dryM.after)} drought displacements followed over the next three months.`] : null,
    ].filter(Boolean).map(([t, s]) => `<div class="finding"><b>${t}</b>${s}</div>`).join("");
  }
  const topHz = (lvl, id) => HZ.map(h => [h, v(lvl, id, ALLM, [h])]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
  function somDry() {   // driest rainy-season month in Somalia and the drought displacement after it
    const r = ALLM.map(m => [m, rainOf("country", "SOM", m)]).filter(x => x[1] != null && x[0] < N - 1).sort((a, b) => a[1] - b[1])[0];
    if (!r) return null;
    const after = [r[0] + 1, r[0] + 2, r[0] + 3].filter(m => m < N);
    return { m: r[0], r: r[1], after: vc("SOM", after, ["Drought"]), months: [r[0], ...after] };
  }

  // ---------- Story (every number computed from the data) ----------
  const yearAll = iso => vc(iso, ALLM, HZ);
  const topIso = order[0];
  const peakOf = (lvl, id, h) => ALLM.reduce((b, m) => v(lvl, id, [m], [h]) > v(lvl, id, [b], [h]) ? m : b, 0);
  const hot1 = [...ADM].sort((a, b) => v("adm1", b, ALLM, HZ) - v("adm1", a, ALLM, HZ))[0];
  const hotIso = D.adm1[hot1].c;
  const flPeak = peakOf("country", hotIso, "Flood");
  const sd = somDry();
  const kenWet = ALLM.filter(m => rainOf("country", "KEN", m) != null).sort((a, b) => rainOf("country", "KEN", b) - rainOf("country", "KEN", a))[0];
  const conflictTop = [...ISO].sort((a, b) => vc(b, ALLM, ["Conflict"]) - vc(a, ALLM, ["Conflict"]));
  const STEPS = [
    { title: "A region on the move", lvl: "country", months: ALLM, hz: HZ, rainK: null,
      hero: () => short(regionM(ALLM, HZ)), heroL: () => `new displacements, ${WIN}`,
      text: () => `IDMC recorded displacement in ${ISO.filter(i => yearAll(i) > 0).length} of the 8 IGAD countries in the last 12 months. ${D.countries[topIso]} had the most (${short(yearAll(topIso))}). Each dot on the map is one IDMC record; darker countries had more people displaced.`,
      chart: () => ({ sid: null, hz: HZ }) },
    { title: "Conflict is the main driver", lvl: "adm1", months: ALLM, hz: ["Conflict"], rainK: null,
      hero: () => pct(regionM(ALLM, ["Conflict"]), regionM(ALLM, HZ)) + "%", heroL: () => "of all new displacement was caused by conflict",
      text: () => `${conflictTop.slice(0, 3).map(i => D.countries[i]).join(", ")} account for most conflict displacement. At admin-1 level the picture is sharper: a few states carry most of the load, which is where anticipatory action for climate hazards must also work.`,
      chart: () => ({ sid: null, hz: ["Conflict"] }) },
    { title: `${D.adm1[hot1].n}: floods on top of conflict`, lvl: "adm1", sel: hot1, months: ALLM, hz: HZ, rainK: flPeak, rain: true,
      hero: () => short(v("adm1", hot1, ALLM, HZ)), heroL: () => `people displaced in ${D.adm1[hot1].n}, the region's top hotspot`,
      text: () => { const r = rainOf("adm1", hot1, flPeak); return `${topHz("adm1", hot1).join(" and ")} displaced people here. Flood displacement in ${D.countries[hotIso]} peaked in ${LAB[flPeak]} (${short(vc(hotIso, [flPeak], ["Flood"]))}), yet local rainfall was ${r == null ? "seasonally low" : Math.round(r) + "% of normal"}. Floods in the Sudd come from river flows upstream, so warnings need hydrological forecasts, not just local rain.`; },
      chart: () => ({ lvl: "adm1", sid: hot1, hz: HZ }) },
    ...(sd ? [{ title: "Somalia: failed rains, then drought", lvl: "adm1", iso: "SOM", months: sd.months, hz: ["Drought"], rainK: sd.m, rain: true,
      hero: () => Math.round(sd.r) + "%", heroL: () => `of normal rainfall in ${LAB[sd.m]}`,
      text: () => `When the rains failed, pasture and water ran out. ${short(sd.after)} people were displaced by drought in the following three months, mostly in ${[...ADM].filter(i => D.adm1[i].c === "SOM").sort((a, b) => v("adm1", b, ALLM, ["Drought"]) - v("adm1", a, ALLM, ["Drought"])).slice(0, 2).map(i => D.adm1[i].n).join(" and ")}. A seasonal outlook issued before the rains could have triggered support earlier.`,
      chart: () => ({ lvl: "country", sid: "SOM", hz: ["Drought"], focus: sd.months }) }] : []),
    ...(kenWet != null ? [{ title: "Kenya: when the rains overshoot", lvl: "adm1", iso: "KEN", months: [kenWet], hz: ["Flood"], rainK: kenWet, rain: true,
      hero: () => Math.round(rainOf("country", "KEN", kenWet)) + "%", heroL: () => `of normal rainfall in ${LAB[kenWet]}`,
      text: () => `Kenya's wettest month relative to normal displaced ${short(vc("KEN", [kenWet], ["Flood"]))} people by floods. Over the 12 months, floods displaced ${short(vc("KEN", ALLM, ["Flood"]))} people in Kenya, ${pct(vc("KEN", ALLM, ["Flood"]), yearAll("KEN"))}% of its total.`,
      chart: () => ({ lvl: "country", sid: "KEN", hz: ["Flood"], focus: [kenWet] }) }] : []),
    { title: "From data to early action", lvl: "adm1", months: ALLM, hz: HZ, rainK: N, rain: true,
      hero: () => "2 layers", heroL: () => "hazard + displacement, one map",
      text: () => `Hazard watch platforms show rain, floods and drought; this sample adds where people actually moved. The pipeline refreshes monthly from IDMC and CHIRPS in GitHub Actions, so the same view can feed early-warning bulletins and anticipatory action triggers.`,
      chart: () => ({ sid: null, hz: HZ }) },
  ];
  let step = 0, story = null;
  function drawStory() {
    const s = STEPS[step]; story = s;
    $("st-count").textContent = `Story · ${step + 1} of ${STEPS.length}`;
    $("st-dots").innerHTML = STEPS.map((_, i) => `<button aria-label="Step ${i + 1}" class="${i === step ? "on" : ""}" data-i="${i}"></button>`).join("");
    $("st-title").textContent = s.title;
    $("st-hero").textContent = s.hero(); $("st-hero-l").textContent = s.heroL();
    $("st-text").textContent = s.text();
    $("st-prev").disabled = step === 0;
    $("st-next").textContent = step === STEPS.length - 1 ? "Explore the data →" : "Next →";
    highlight = s.sel || s.iso || null;
    state.layers.rain = !!s.rain;
    document.querySelector('[data-layer="rain"]').checked = state.layers.rain;
    const per = s.months.length === N ? WIN : s.months.map(m => LAB[m]).join(", ");
    paintMap(s.lvl, id => v(s.lvl, id, s.months, s.hz), `${hzLabel(s.hz)} · ${per}`, short, { months: s.months, hz: s.hz, rainK: s.rainK ?? N });
    drawKpis(s.months, s.hz, s.lvl, per);
    const b = (s.sel && boundsOf("adm1", s.sel)) || (s.iso && boundsOf("country", s.iso)) || regionBounds;
    fly(b, { padding: [30, 30], maxZoom: s.sel ? 7 : 6, duration: 0.9 });
    const c = s.chart();
    combo("c-story", c.lvl, c.sid, c.hz, { focus: c.focus });
  }
  $("st-dots").onclick = e => { const b = e.target.closest("button"); if (b) { step = +b.dataset.i; drawStory(); } };
  $("st-prev").onclick = () => { if (step > 0) { step--; drawStory(); } };
  $("st-next").onclick = () => { if (step < STEPS.length - 1) { step++; drawStory(); } else setView("explore"); };
  document.addEventListener("keydown", e => {
    if (state.view !== "story") return;
    if (e.key === "ArrowRight") $("st-next").click();
    if (e.key === "ArrowLeft") $("st-prev").click();
  });

  // ---------- views ----------
  function setView(vw) {
    state.view = vw; highlight = null; story = null;
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.view === vw));
    $("map-layout").hidden = vw === "insights";
    $("view-insights").hidden = vw !== "insights";
    $("panel-explore").hidden = vw !== "explore";
    $("panel-story").hidden = vw !== "story";
    $("filterbar").hidden = vw === "story";
    for (const id of ["level", "metric"]) $(id).style.display = vw === "insights" ? "none" : "";
    document.querySelector(".period").style.display = vw === "insights" ? "none" : "";
    if (vw !== "insights") setTimeout(() => map.invalidateSize(), 50);
    if (vw === "story") { step = 0; drawStory(); }
    else {
      if (vw === "explore") { state.layers.rain = document.querySelector('[data-layer="rain"]').checked = false; fly(regionBounds, { padding: [10, 10], duration: 0.6 }); }
      refresh();
    }
  }
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => setView(b.dataset.view));

  // ---------- controls ----------
  const seg = (id, key, cb) => document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => {
    document.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle("on", x === b));
    cb(b.dataset[key]); refresh();
  });
  seg("hazard", "h", x => state.hazard = x);
  seg("metric", "m", x => state.metric = x);
  seg("level", "l", x => { state.level = x; if (state.sel?.lvl === "adm1" && x === "country") state.sel = null; });
  document.querySelectorAll("[data-layer]").forEach(cb => cb.onchange = () => { state.layers[cb.dataset.layer] = cb.checked; state.view === "story" ? (story && paintMap(paint.lvl, paint.fn, paint.title, paint.f, { months: story.months, hz: story.hz, rainK: story.rainK ?? N })) : refresh(); });
  $("rainOpacity").oninput = e => { state.rainOpacity = e.target.value / 100; if (rainImg) rainImg.setOpacity(state.rainOpacity); };
  const slider = $("month");
  slider.max = N;
  slider.oninput = () => { state.k = +slider.value; refresh(); };
  let timer = null;
  $("play").onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $("play").textContent = "▶"; return; }
    $("play").textContent = "❚❚";
    if (state.k >= N - 1) state.k = -1;
    timer = setInterval(() => {
      state.k++;
      if (state.k > N - 1) { clearInterval(timer); timer = null; $("play").textContent = "▶"; state.k = N; }
      slider.value = state.k; refresh();
    }, 1100);
  };
  $("download").onclick = () => {
    const lvl = state.level, rows = ids(lvl).map(i => [lvl === "adm1" ? `"${D.adm1[i].n}"` : `"${D.countries[i]}"`, lvl === "adm1" ? D.adm1[i].c : i, periodLabel(), state.hazard, curVal(lvl, i), rainOf(lvl, i, state.k) ?? ""]).sort((a, b) => b[4] - a[4]);
    const csv = ["area,iso3,period,hazard,new_displacements,rain_pct_of_normal", ...rows.map(r => r.join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `eamw_${lvl}_${state.hazard}_${periodLabel().replace(/[^\w]+/g, "_")}.csv`; a.click();
  };

  if (innerWidth < 860) $("layers").open = false;
  $("subtitle").textContent = `Displacement × climate hazards · IGAD region · ${WIN}`;
  $("meta").textContent = `Data refreshed ${D.meta.fetched || D.meta.built}: ${fmt(D.meta.records)} IDMC records, ${pct(D.meta.located.inside + D.meta.located.nearest, D.meta.records)}% located to admin-1.`;

  function refresh() {
    if (state.view === "insights") return drawInsights();
    if (state.view === "story") return drawStory();
    drawExplore();
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { C = HZC(); themeCharts(); refresh(); });
  refresh();
})();
