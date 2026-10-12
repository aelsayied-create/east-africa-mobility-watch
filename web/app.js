// East Africa Mobility Watch — demo front end (Leaflet + Chart.js)
(async function () {
  const [D, geo] = await Promise.all([
    fetch("data/displacement.json").then(r => r.json()),
    fetch("data/igad_countries.geojson").then(r => r.json()),
  ]);

  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const HZ_COLORS = { Flood: "#2b7bb9", Drought: "#d98e2b", Conflict: "#9b3b3b" };
  const RAMP = ["#fff5eb","#fdd8a8","#fdae6b","#f17c32","#d94801","#8c2d04"];

  const state = { hazard: "All", monthIdx: 12, selected: null }; // 12 = full year
  const fmt = n => n.toLocaleString("en-US");

  // ---------- data helpers ----------
  function value(iso, monthIdx = state.monthIdx, hazard = state.hazard) {
    const months = monthIdx === 12 ? D.months : [D.months[monthIdx]];
    const hz = hazard === "All" ? D.hazards : [hazard];
    let s = 0;
    for (const m of months) for (const h of hz) s += (D.values[iso]?.[m]?.[h] || 0);
    return s;
  }
  function breaks() {
    const vals = Object.keys(D.countries).map(i => value(i)).sort((a, b) => a - b);
    const max = vals[vals.length - 1] || 1;
    // nice-ish quantile style breaks
    return [0.05, 0.15, 0.3, 0.5, 0.75].map(p => Math.round(max * p));
  }
  function color(v, b) {
    let i = 0; while (i < b.length && v > b[i]) i++;
    return RAMP[i];
  }

  // ---------- map ----------
  const map = L.map("map", { zoomControl: true, minZoom: 3 }).setView([6, 38], 4);
  const basemaps = {
    light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap contributors © CARTO", maxZoom: 18 }),
    imagery: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Imagery © Esri", maxZoom: 18 }),
  };
  basemaps.light.addTo(map);

  let b = breaks();
  const layer = L.geoJSON(geo, {
    style: f => style(f),
    onEachFeature: (f, l) => {
      l.on({
        mouseover: e => e.target.setStyle({ weight: 2.5, color: "#0f3d4c" }),
        mouseout: e => layer.resetStyle(e.target),
        click: () => select(f.properties.iso3),
      });
      l.bindTooltip(() => tip(f.properties.iso3), { sticky: true, className: "tt" });
    },
  }).addTo(map);
  map.fitBounds(layer.getBounds(), { padding: [10, 10] });

  function style(f) {
    const iso = f.properties.iso3;
    const sel = state.selected === iso;
    return { fillColor: color(value(iso), b), fillOpacity: 0.82,
             color: sel ? "#0f3d4c" : "#ffffff", weight: sel ? 3 : 1 };
  }
  function tip(iso) {
    return `<b>${D.countries[iso]}</b><br>${fmt(value(iso))} new displacements<br>
            <span style="color:#5b6b75">${periodLabel()} · ${state.hazard}</span>`;
  }
  function periodLabel() {
    return state.monthIdx === 12 ? "Full year 2025" : `${MONTH_NAMES[state.monthIdx]} 2025`;
  }

  // ---------- legend ----------
  function drawLegend() {
    const labels = [`≤ ${fmt(b[0])}`];
    for (let i = 1; i < b.length; i++) labels.push(`${fmt(b[i - 1] + 1)} – ${fmt(b[i])}`);
    labels.push(`> ${fmt(b[b.length - 1])}`);
    document.getElementById("legend").innerHTML =
      `<h4>New displacements</h4>` +
      labels.map((t, i) => `<div class="row"><i style="background:${RAMP[i]}"></i>${t}</div>`).join("");
  }

  // ---------- side panel ----------
  const chart = new Chart(document.getElementById("chart"), {
    type: "bar",
    data: { labels: MONTH_NAMES, datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { stacked: true, ticks: { font: { size: 10 }, callback: v => v >= 1000 ? v / 1000 + "k" : v } },
      },
    },
  });

  function drawChart() {
    const isos = state.selected ? [state.selected] : Object.keys(D.countries);
    const hz = state.hazard === "All" ? D.hazards : [state.hazard];
    chart.data.datasets = hz.map(h => ({
      label: h, backgroundColor: HZ_COLORS[h], borderRadius: 2,
      data: D.months.map((_, mi) => isos.reduce((s, i) => s + value(i, mi, h), 0)),
    }));
    chart.update();
  }

  function rankRows() {
    return Object.keys(D.countries)
      .map(i => ({ iso: i, name: D.countries[i], v: value(i) }))
      .sort((a, z) => z.v - a.v);
  }

  function drawPanel() {
    const rows = rankRows();
    const total = rows.reduce((s, r) => s + r.v, 0);
    document.getElementById("kTotal").textContent = fmt(state.selected ? value(state.selected) : total);
    document.getElementById("kTop").textContent = rows[0].name;
    document.getElementById("monthLabel").textContent = periodLabel();
    document.getElementById("dTitle").textContent = state.selected ? D.countries[state.selected] : "IGAD region";
    document.getElementById("dHint").innerHTML = state.selected
      ? `Monthly trend · <a href="#" id="clearSel">back to region</a>`
      : "Click a country on the map to see its monthly trend.";
    const clr = document.getElementById("clearSel");
    if (clr) clr.onclick = e => { e.preventDefault(); select(null); };
    document.querySelector("#rank tbody").innerHTML = rows.map(r =>
      `<tr data-iso="${r.iso}"${r.iso === state.selected ? ' style="font-weight:600"' : ""}>
         <td>${r.name}</td><td class="r">${fmt(r.v)}</td></tr>`).join("");
    document.querySelectorAll("#rank tbody tr").forEach(tr => tr.onclick = () => select(tr.dataset.iso));
  }

  function refresh() {
    b = breaks();
    layer.setStyle(style);
    drawLegend(); drawPanel(); drawChart();
  }

  function select(iso) {
    state.selected = iso;
    if (iso) {
      layer.eachLayer(l => { if (l.feature.properties.iso3 === iso) map.fitBounds(l.getBounds(), { maxZoom: 5 }); });
    } else {
      map.fitBounds(layer.getBounds(), { padding: [10, 10] });
    }
    refresh();
  }

  // ---------- controls ----------
  document.querySelectorAll("#hazard button").forEach(btn => btn.onclick = () => {
    document.querySelectorAll("#hazard button").forEach(x => x.classList.toggle("on", x === btn));
    state.hazard = btn.dataset.h; refresh();
  });
  document.querySelectorAll("#basemap button").forEach(btn => btn.onclick = () => {
    document.querySelectorAll("#basemap button").forEach(x => x.classList.toggle("on", x === btn));
    Object.values(basemaps).forEach(l => map.removeLayer(l));
    basemaps[btn.dataset.b].addTo(map).bringToBack();
  });
  const slider = document.getElementById("month");
  slider.oninput = () => { state.monthIdx = +slider.value; refresh(); };

  let timer = null;
  const playBtn = document.getElementById("play");
  playBtn.onclick = () => {
    if (timer) { clearInterval(timer); timer = null; playBtn.textContent = "▶"; return; }
    playBtn.textContent = "❚❚";
    if (state.monthIdx >= 11) { state.monthIdx = -1; }
    timer = setInterval(() => {
      state.monthIdx++;
      if (state.monthIdx > 11) { clearInterval(timer); timer = null; playBtn.textContent = "▶"; state.monthIdx = 12; }
      slider.value = state.monthIdx; refresh();
    }, 900);
  };

  document.getElementById("download").onclick = () => {
    const lines = ["country,iso3,period,hazard,new_displacements",
      ...rankRows().map(r => `${r.name},${r.iso},${periodLabel()},${state.hazard},${r.v}`)];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `displacement_${state.hazard}_${periodLabel().replace(/\s+/g, "_")}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  refresh();
})();
