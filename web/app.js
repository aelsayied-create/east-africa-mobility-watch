// East Africa Mobility Watch — Explore · Insights · Story (Leaflet + Chart.js)
(async function () {
  const [D, geo] = await Promise.all([
    fetch("data/displacement.json?v=5").then(r => r.json()),
    fetch("data/igad_countries.geojson").then(r => r.json()),
  ]);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ISO = Object.keys(D.countries);
  const HZ = D.hazards; // Flood, Drought, Conflict
  const RAMP = ["#e6f0fc", "#b7d3f6", "#6da7ec", "#2a78d6", "#1c5cab", "#0d366b"]; // sequential blue, light → dark

  // ---------- helpers ----------
  const $ = id => document.getElementById(id);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const short = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : fmt(n);
  const HZC = () => ({ Flood: css("--c1"), Drought: css("--c2"), Conflict: css("--c3") });
  let C = HZC();

  // v(iso, months[], hazards[])
  function v(iso, months, hz) {
    let s = 0;
    for (const mi of months) for (const h of hz) s += D.values[iso]?.[D.months[mi]]?.[h] || 0;
    return s;
  }
  const ALLM = [...Array(12).keys()];
  const hzList = h => h === "All" ? HZ : [h];

  // ---------- state ----------
  const state = { hazard: "All", monthIdx: 12, metric: "abs", selected: null, view: "explore" };
  const monthsOf = () => state.monthIdx === 12 ? ALLM : [state.monthIdx];
  const periodLabel = () => state.monthIdx === 12 ? "Full year 2025" : `${MONTHS[state.monthIdx]} 2025`;
  const val = iso => v(iso, monthsOf(), hzList(state.hazard));
  const regionTotal = () => ISO.reduce((s, i) => s + val(i), 0);

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

  // ---------- map ----------
  const map = L.map("map", { minZoom: 3 }).setView([6, 38], 4);
  const basemaps = {
    gray: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors", maxZoom: 16 }),
    imagery: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Imagery © Esri", maxZoom: 18 }),
  };
  basemaps.gray.addTo(map);
  document.querySelectorAll("#basemap button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#basemap button").forEach(x => x.classList.toggle("on", x === b));
    Object.values(basemaps).forEach(l => map.removeLayer(l)); basemaps[b.dataset.b].addTo(map).bringToBack();
  });

  let breaks = [];
  function computeBreaks(valFn) {
    const max = Math.max(1, ...ISO.map(valFn));
    breaks = [0.08, 0.2, 0.4, 0.6, 0.8].map(p => max * p);
  }
  const colorFor = x => { let i = 0; while (i < breaks.length && x > breaks[i]) i++; return RAMP[i]; };
  let valueFn = val, highlight = null;
  const layer = L.geoJSON(geo, {
    style: f => style(f),
    onEachFeature: (f, l) => {
      l.on({
        mouseover: e => e.target.setStyle({ weight: 3, color: css("--ink") }),
        mouseout: e => layer.resetStyle(e.target),
        click: () => { if (state.view === "explore") select(f.properties.iso3); },
      });
      l.bindTooltip(() => tip(f.properties.iso3), { sticky: true });
    },
  }).addTo(map);
  const regionBounds = layer.getBounds();
  map.fitBounds(regionBounds, { padding: [10, 10] });
  function fly(b, opts) {
    setTimeout(() => {
      const el = map.getContainer();
      if (!el.clientWidth || !el.clientHeight) return;
      map.invalidateSize();
      try { map.stop(); map.flyToBounds(b, opts); } catch (e) { map.fitBounds(b, { padding: opts.padding }); }
    }, 60);
  }
  const boundsOf = iso => { let b = null; layer.eachLayer(l => { if (l.feature.properties.iso3 === iso) b = l.getBounds(); }); return b; };

  function style(f) {
    const iso = f.properties.iso3;
    const on = highlight ? highlight === iso : state.selected === iso;
    const dim = highlight && highlight !== iso;
    return { fillColor: colorFor(valueFn(iso)), fillOpacity: dim ? 0.35 : 0.85, color: on ? "#0b0b0b" : "#ffffff", weight: on ? 3 : 1 };
  }
  function tip(iso) {
    const fn = state.view === "explore" ? val : valueFn;
    const x = fn(iso), tot = ISO.reduce((s, i) => s + fn(i), 0);
    return `<b>${D.countries[iso]}</b><br>${fmt(x)} people newly displaced<br><span style="opacity:.75">${Math.round(x / Math.max(1, tot) * 100)}% of region</span>`;
  }
  function drawLegend(title, f = short) {
    const lab = [`≤ ${f(breaks[0])}`];
    for (let i = 1; i < breaks.length; i++) lab.push(`${f(breaks[i - 1])} – ${f(breaks[i])}`);
    lab.push(`> ${f(breaks[breaks.length - 1])}`);
    $("legend").innerHTML = `<h4>${title}</h4>` + lab.map((t, i) => `<div><i class="sq" style="background:${RAMP[i]}"></i>${t}</div>`).join("");
  }
  function paintMap(fn, title, f) {
    valueFn = fn; computeBreaks(fn); layer.setStyle(style); drawLegend(title, f);
  }

  // ---------- KPIs ----------
  function drawKpis(months, hz, focus) {
    const tot = ISO.reduce((s, i) => s + v(i, months, hz), 0);
    const byC = ISO.map(i => [i, v(i, months, hz)]).sort((a, b) => b[1] - a[1]);
    const byH = HZ.map(h => [h, ISO.reduce((s, i) => s + v(i, months, [h]), 0)]).sort((a, b) => b[1] - a[1]);
    const peak = ALLM.map(m => [m, ISO.reduce((s, i) => s + v(i, [m], hz), 0)]).sort((a, b) => b[1] - a[1])[0];
    const items = [
      ["New displacements", fmt(tot), "", focus || (months.length === 12 ? "2025, all IGAD countries" : `${MONTHS[months[0]]} 2025`)],
      ["Most affected country", D.countries[byC[0][0]], "", `${fmt(byC[0][1])} people · ${Math.round(byC[0][1] / Math.max(1, tot) * 100)}%`],
      ["Main driver", byH[0][0], C[byH[0][0]], `${Math.round(byH[0][1] / Math.max(1, tot) * 100)}% of displacements`],
      ["Peak month", MONTHS[peak[0]], "", `${fmt(peak[1])} people (year view)`],
    ];
    $("kpis").innerHTML = items.map(([t, val, col, s]) =>
      `<div class="kpi"><span>${col ? `<i style="background:${col}"></i>` : ""}${t}</span><b>${val}</b><small>${s}</small></div>`).join("");
  }

  // ---------- Explore ----------
  function drawExplore() {
    const months = monthsOf(), hz = hzList(state.hazard);
    const metricFn = state.metric === "share"
      ? iso => { const t = regionTotal(); return t ? val(iso) / t * 100 : 0; }
      : val;
    if (state.metric === "share") paintMap(metricFn, "Share of region", x => Math.round(x) + "%");
    else paintMap(metricFn, "People newly displaced");
    drawKpis(months, hz);
    $("monthLabel").textContent = periodLabel();
    const isos = state.selected ? [state.selected] : ISO;
    $("dTitle").textContent = state.selected ? D.countries[state.selected] : "IGAD region";
    $("dHint").innerHTML = state.selected
      ? `Monthly trend in 2025 · <a href="#" id="clr">back to region</a>`
      : "Click a country on the map or in the table to see its monthly trend.";
    $("clr") && ($("clr").onclick = e => { e.preventDefault(); select(null); });
    mk("c-trend", {
      type: "bar",
      data: { labels: MONTHS, datasets: hz.map(h => bar(h, ALLM.map(m => isos.reduce((s, i) => s + v(i, [m], [h]), 0)), C[h], { maxBarThickness: 18 })) },
      options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: hz.length > 1, position: "bottom" }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: short } } } },
    });
    const rows = ISO.map(i => ({ i, x: val(i) })).sort((a, b) => b.x - a.x);
    const tot = rows.reduce((s, r) => s + r.x, 0), max = rows[0].x || 1;
    $("rank").tBodies[0].innerHTML = rows.map(r => `<tr data-iso="${r.i}"${r.i === state.selected ? ' style="font-weight:700"' : ""}>
      <td>${D.countries[r.i]}</td><td><div class="b"><i style="width:${r.x / max * 70}%;background:${css("--c1")}"></i>${fmt(r.x)}</div></td>
      <td class="r">${Math.round(r.x / Math.max(1, tot) * 100)}%</td></tr>`).join("");
    document.querySelectorAll("#rank tbody tr").forEach(tr => tr.onclick = () => select(tr.dataset.iso));
  }
  function select(iso) {
    state.selected = state.selected === iso ? null : iso;
    const b = state.selected && boundsOf(state.selected);
    fly(b || regionBounds, { padding: [20, 20], maxZoom: 6, duration: 0.7 });
    refresh();
  }

  // ---------- Insights ----------
  const tipEl = Object.assign(document.createElement("div"), { className: "tip", hidden: true });
  document.body.appendChild(tipEl);
  function drawInsights() {
    const hz = hzList(state.hazard);
    drawKpis(ALLM, hz);
    // heatmap
    const cells = ISO.flatMap(i => ALLM.map(m => v(i, [m], hz)));
    const max = Math.max(1, ...cells);
    const heatColor = x => RAMP[Math.min(RAMP.length - 1, Math.floor(x / max * RAMP.length))];
    const order = [...ISO].sort((a, b) => v(b, ALLM, hz) - v(a, ALLM, hz));
    $("heat").innerHTML = `<div></div>` + MONTHS.map(m => `<div class="h">${m}</div>`).join("") +
      order.map(i => `<div class="n">${D.countries[i]}</div>` + ALLM.map(m => {
        const x = v(i, [m], hz);
        return `<div class="c" style="background:${heatColor(x)}" data-t="${D.countries[i]} · ${MONTHS[m]}: ${fmt(x)} people"></div>`;
      }).join("")).join("");
    $("heat-legend").innerHTML = `Fewer ${RAMP.map(c => `<i style="background:${c}"></i>`).join("")} More · ${state.hazard === "All" ? "all hazards" : state.hazard.toLowerCase()}`;
    $("heat").onmousemove = e => { const c = e.target.closest(".c"); if (!c) { tipEl.hidden = true; return; } tipEl.hidden = false; tipEl.textContent = c.dataset.t; tipEl.style.left = e.clientX + 12 + "px"; tipEl.style.top = e.clientY + 12 + "px"; };
    $("heat").onmouseleave = () => tipEl.hidden = true;
    // regional trend lines
    mk("c-region", {
      type: "line",
      data: { labels: MONTHS, datasets: HZ.map(h => ({ label: h, data: ALLM.map(m => ISO.reduce((s, i) => s + v(i, [m], [h]), 0)), borderColor: C[h], backgroundColor: C[h], borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.3 })) },
      options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: short } } } },
    });
    // hazard mix per country (100%)
    mk("c-mix", {
      type: "bar",
      data: { labels: order.map(i => D.countries[i]), datasets: HZ.map(h => bar(h, order.map(i => { const t = v(i, ALLM, HZ); return t ? v(i, ALLM, [h]) / t * 100 : 0; }), C[h])) },
      options: { indexAxis: "y", maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.raw.toFixed(0)}%` } } },
        scales: { x: { stacked: true, max: 100, ticks: { callback: x => x + "%" } }, y: { stacked: true, grid: { display: false } } } },
    });
    // findings
    const yr = ISO.reduce((s, i) => s + v(i, ALLM, HZ), 0);
    const fl = ALLM.map(m => ISO.reduce((s, i) => s + v(i, [m], ["Flood"]), 0));
    const jas = fl[6] + fl[7] + fl[8], flTot = fl.reduce((a, b) => a + b, 0);
    const dr = ALLM.map(m => ISO.reduce((s, i) => s + v(i, [m], ["Drought"]), 0));
    const dry = dr[11] + dr[0] + dr[1] + dr[2], drTot = dr.reduce((a, b) => a + b, 0);
    const top2 = [...ISO].sort((a, b) => v(b, ALLM, HZ) - v(a, ALLM, HZ)).slice(0, 2);
    const top2s = top2.reduce((s, i) => s + v(i, ALLM, HZ), 0);
    $("findings").innerHTML = [
      [`${Math.round(top2s / yr * 100)}% in two countries`, `${D.countries[top2[0]]} and ${D.countries[top2[1]]} account for most new displacement in 2025.`],
      [`Floods peak July–September`, `${Math.round(jas / flTot * 100)}% of flood displacement happens in these three months, mostly in the Sudans.`],
      [`Drought builds in the dry season`, `${Math.round(dry / drTot * 100)}% of drought displacement falls between December and March.`],
      [`Conflict never stops`, `Conflict displacement stays high all year, so early warning must layer it with seasonal hazards.`],
    ].map(([t, s]) => `<div class="finding"><b>${t}</b>${s}</div>`).join("");
  }

  // ---------- Story ----------
  const yearAll = iso => v(iso, ALLM, HZ);
  const topIso = [...ISO].sort((a, b) => yearAll(b) - yearAll(a))[0];
  const regionMonthly = h => ALLM.map(m => ISO.reduce((s, i) => s + v(i, [m], [h]), 0));
  const countryMonthly = (iso, h) => ALLM.map(m => v(iso, [m], [h]));
  const STEPS = [
    {
      title: "A region on the move", iso: null, months: ALLM, hz: HZ,
      hero: () => short(ISO.reduce((s, i) => s + yearAll(i), 0)), heroL: () => "people newly displaced in 2025",
      text: () => `Floods, drought and conflict forced people from their homes in every IGAD country. ${D.countries[topIso]} saw the most new displacement. Darker countries on the map had more people displaced.`,
      chart: () => ({ type: "bar", labels: MONTHS, sets: HZ.map(h => [h, regionMonthly(h)]), stacked: true }),
    },
    {
      title: "Sudan's rainy season", iso: "SDN", months: [6, 7, 8], hz: ["Flood"],
      hero: () => short(v("SDN", [6, 7, 8], ["Flood"])), heroL: () => `flood displacements in Sudan, July–September`,
      text: () => `${Math.round(v("SDN", [6, 7, 8], ["Flood"]) / Math.max(1, v("SDN", ALLM, ["Flood"])) * 100)}% of Sudan's yearly flood displacement happens in just three months, when the Nile and its tributaries overflow. Forecasts issued in June give a window for anticipatory action.`,
      chart: () => ({ type: "bar", labels: MONTHS, sets: [["Flood", countryMonthly("SDN", "Flood")]], focus: [6, 7, 8] }),
    },
    {
      title: "Somalia's two rainy seasons", iso: "SOM", months: [3, 4, 9, 10], hz: ["Flood"],
      hero: () => "2 peaks", heroL: () => "Gu (Apr–May) and Deyr (Oct–Nov)",
      text: () => `Somalia's flood displacement follows its two rainy seasons, so early warning must run twice a year. The Gu and Deyr peaks together account for ${Math.round(v("SOM", [3, 4, 9, 10], ["Flood"]) / Math.max(1, v("SOM", ALLM, ["Flood"])) * 100)}% of the country's flood displacement.`,
      chart: () => ({ type: "bar", labels: MONTHS, sets: [["Flood", countryMonthly("SOM", "Flood")]], focus: [3, 4, 9, 10] }),
    },
    {
      title: "Drought in the dry months", iso: null, months: [11, 0, 1, 2], hz: ["Drought"],
      hero: () => { const d = regionMonthly("Drought"); return Math.round((d[11] + d[0] + d[1] + d[2]) / d.reduce((a, b) => a + b, 0) * 100) + "%"; },
      heroL: () => "of drought displacement falls in Dec–Mar",
      text: () => `Drought moves more slowly than floods. As pasture and water run out in the dry season, pastoralist families move with their herds. Seasonal outlooks months ahead can trigger support before they have to leave.`,
      chart: () => ({ type: "bar", labels: MONTHS, sets: [["Drought", regionMonthly("Drought")]], focus: [11, 0, 1, 2] }),
    },
    {
      title: "Conflict: a constant pressure", iso: null, months: ALLM, hz: ["Conflict"],
      hero: () => short(ISO.reduce((s, i) => s + v(i, ALLM, ["Conflict"]), 0)), heroL: () => "conflict displacements in 2025",
      text: () => { const t = [...ISO].sort((a, b) => v(b, ALLM, ["Conflict"]) - v(a, ALLM, ["Conflict"]))[0]; return `Unlike seasonal hazards, conflict displacement is steady through the year, highest in ${D.countries[t]}. When a flood hits an area already affected by conflict, the risk of displacement multiplies.`; },
      chart: () => ({ type: "line", labels: MONTHS, sets: HZ.map(h => [h, regionMonthly(h)]) }),
    },
    {
      title: "From data to early action", iso: null, months: ALLM, hz: HZ,
      hero: () => "3 hazards", heroL: () => "one regional picture",
      text: () => `Bringing displacement data into the hazard watch systems lets decision-makers see who is likely to move, where and when, and act before it happens. This demo uses illustrative estimates; a real system would use IOM DTM and IDMC data.`,
      chart: () => ({ type: "bar", labels: [...ISO].sort((a, b) => yearAll(b) - yearAll(a)).map(i => D.countries[i]), sets: HZ.map(h => [h, [...ISO].sort((a, b) => yearAll(b) - yearAll(a)).map(i => v(i, ALLM, [h]))]), stacked: true, horizontal: true }),
    },
  ];
  let step = 0;
  function drawStory() {
    const s = STEPS[step];
    $("st-count").textContent = `Story · ${step + 1} of ${STEPS.length}`;
    $("st-dots").innerHTML = STEPS.map((_, i) => `<button aria-label="Step ${i + 1}" class="${i === step ? "on" : ""}" data-i="${i}"></button>`).join("");
    $("st-title").textContent = s.title;
    $("st-hero").textContent = s.hero(); $("st-hero-l").textContent = s.heroL();
    $("st-text").textContent = s.text();
    $("st-prev").disabled = step === 0;
    $("st-next").textContent = step === STEPS.length - 1 ? "Explore the data →" : "Next →";
    highlight = s.iso;
    paintMap(iso => v(iso, s.months, s.hz), `${s.hz.length === 3 ? "All hazards" : s.hz[0]} · ${s.months.length === 12 ? "2025" : s.months.map(m => MONTHS[m]).join(", ")}`);
    drawKpis(s.months, s.hz, s.months.length === 12 ? "2025, all IGAD countries" : `${s.months.map(m => MONTHS[m]).join(", ")} 2025`);
    fly((s.iso && boundsOf(s.iso)) || regionBounds, { padding: [20, 20], maxZoom: 6, duration: 0.9 });
    const c = s.chart();
    mk("c-story", {
      type: c.type,
      data: { labels: c.labels, datasets: c.sets.map(([h, data]) => c.type === "line"
        ? { label: h, data, borderColor: C[h], backgroundColor: C[h], borderWidth: 2, pointRadius: 0, tension: 0.3 }
        : bar(h, data, c.focus ? data.map((_, i) => c.focus.includes(i) ? C[h] : css("--neutral")) : C[h], { maxBarThickness: 16 })) },
      options: { maintainAspectRatio: false, indexAxis: c.horizontal ? "y" : "x",
        plugins: { legend: { display: c.sets.length > 1, position: "bottom" }, tooltip: { callbacks: { label: x => ` ${x.dataset.label}: ${fmt(x.raw)}` } } },
        scales: { x: { stacked: !!c.stacked, grid: { display: false }, ticks: c.horizontal ? { callback: short } : {} }, y: { stacked: !!c.stacked, grid: { display: !c.horizontal }, ticks: c.horizontal ? {} : { callback: short } } } },
    });
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
  function setView(v) {
    state.view = v; highlight = null;
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.view === v));
    $("map-layout").hidden = v === "insights";
    $("view-insights").hidden = v !== "insights";
    $("panel-explore").hidden = v !== "explore";
    $("panel-story").hidden = v !== "story";
    $("filterbar").hidden = v === "story";
    document.querySelector(".period").style.visibility = v === "insights" ? "hidden" : "";
    $("metric").style.visibility = v === "insights" ? "hidden" : "";
    if (v !== "insights") setTimeout(() => map.invalidateSize(), 50);
    if (v === "story") { step = 0; drawStory(); }
    else { if (v === "explore") fly(regionBounds, { padding: [10, 10], duration: 0.6 }); refresh(); }
  }
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => setView(b.dataset.view));

  // ---------- controls ----------
  document.querySelectorAll("#hazard button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#hazard button").forEach(x => x.classList.toggle("on", x === b));
    state.hazard = b.dataset.h; refresh();
  });
  document.querySelectorAll("#metric button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#metric button").forEach(x => x.classList.toggle("on", x === b));
    state.metric = b.dataset.m; refresh();
  });
  const slider = $("month");
  slider.oninput = () => { state.monthIdx = +slider.value; refresh(); };
  let timer = null;
  $("play").onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $("play").textContent = "▶"; return; }
    $("play").textContent = "❚❚";
    if (state.monthIdx >= 11) state.monthIdx = -1;
    timer = setInterval(() => {
      state.monthIdx++;
      if (state.monthIdx > 11) { clearInterval(timer); timer = null; $("play").textContent = "▶"; state.monthIdx = 12; }
      slider.value = state.monthIdx; refresh();
    }, 900);
  };
  $("download").onclick = () => {
    const rows = ISO.map(i => [D.countries[i], i, periodLabel(), state.hazard, val(i)]).sort((a, b) => b[4] - a[4]);
    const csv = ["country,iso3,period,hazard,new_displacements", ...rows.map(r => r.join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `displacement_${state.hazard}_${periodLabel().replace(/\s+/g, "_")}.csv`; a.click();
  };

  function refresh() {
    if (state.view === "insights") return drawInsights();
    if (state.view === "story") return drawStory();
    drawExplore();
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { C = HZC(); themeCharts(); refresh(); });
  refresh();
})();
