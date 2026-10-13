/*
 * main.js
 * Renders the key figures, tables and charts from NDBI_DATA / NDBIStats and builds the
 * Leaflet map. The charts are plain SVG, so only Leaflet is loaded from a CDN.
 */
(function () {
  "use strict";

  var D = window.NDBI_DATA;
  var S = window.NDBIStats;
  var MINUS = "−";

  /* ---------- helpers ---------- */

  function fmt(v, d) {
    var s = Math.abs(v).toFixed(d);
    return (v < 0 && Number(s) !== 0 ? MINUS : "") + s;
  }
  function fmtSigned(v, d) {
    return (v >= 0 ? "+" : "") + fmt(v, d);
  }
  function fmtInt(v) {
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined) e.textContent = text;
    return e;
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, text) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function $(id) { return document.getElementById(id); }

  var x = D.years, y = D.meanNDBI;
  var fit = S.ols(x, y);
  var sen = S.senSlope(x, y);
  var ken = S.kendall(x, y);
  var loo = S.leaveOneOut(x, y);

  /* ---------- key figure cards ---------- */

  function bindCards() {
    var net = y[y.length - 1] - y[0];
    var map = {
      netChange: fmtSigned(net, 4),
      slope: fmtSigned(fit.slope, 5) + " / yr",
      pText: "p = " + fit.p.toFixed(3),
      sd: S.sd(y).toFixed(4),
      imgRange: Math.min.apply(null, D.imageCount) + " – " + Math.max.apply(null, D.imageCount)
    };
    Object.keys(map).forEach(function (k) {
      var n = document.querySelector('[data-bind="' + k + '"]');
      if (n) n.textContent = map[k];
    });
  }

  /* ---------- tables ---------- */

  function fillDataTable() {
    var tb = document.querySelector("#table-data tbody");
    tb.textContent = "";
    x.forEach(function (yr, i) {
      var fitted = fit.intercept + fit.slope * yr;
      var tr = el("tr");
      if (D.imageCount[i] < 10) tr.className = "flag";
      var cells = [
        [String(yr), false],
        [fmt(y[i], 4), true],
        [String(D.imageCount[i]), true],
        [fmtInt(D.validPixels[i]), true],
        [fmt(fitted, 4), true],
        [fmtSigned(y[i] - fitted, 4), true]
      ];
      cells.forEach(function (c) { tr.appendChild(el("td", c[1] ? { "class": "num" } : null, c[0])); });
      tb.appendChild(tr);
    });
  }

  function fillStatsTable() {
    var tb = document.querySelector("#table-stats tbody");
    tb.textContent = "";
    var rows = [
      ["OLS slope", fmtSigned(fit.slope, 5) + " NDBI / yr", "Linear change per year, fitted to 8 annual means."],
      ["Standard error of slope", fit.se.toFixed(5), "s / sqrt(Sxx), with Sxx = " + fit.sxx + " for 8 consecutive years."],
      ["t statistic (df = " + fit.df + ")", fmt(fit.t, 3), "Slope divided by its standard error."],
      ["Two-sided p-value", fit.p.toFixed(3), "Probability of a |t| this large if the true slope were zero."],
      ["95% confidence interval", "[" + fmt(fit.ciLow, 5) + ", " + fmtSigned(fit.ciHigh, 5) + "]", "Contains zero, so no significant trend."],
      ["R squared", fit.r2.toFixed(3), "Share of variance explained by a linear trend."],
      ["Residual standard deviation", fit.residualSd.toFixed(5), "Scatter of annual means about the fitted line."],
      ["Minimum detectable slope (5%)", fit.minDetectableSlope.toFixed(5) + " / yr", "t(0.975, " + fit.df + ") x SE. Smaller trends cannot be distinguished from noise."],
      ["Sen's slope", fmtSigned(sen, 5) + " NDBI / yr", "Median of all 28 pairwise slopes; robust to outliers."],
      ["Kendall's tau", fmt(ken.tau, 3), ken.concordant + " concordant and " + ken.discordant + " discordant pairs out of " + ken.pairs + "."],
      ["Kendall exact p-value", ken.p.toFixed(3), "Exact two-sided test for n = 8 (no ties)."],
      ["Mean of the 8 annual means", fmt(S.mean(y), 4), "Overall level of the city-wide index."],
      ["Standard deviation of annual means", S.sd(y).toFixed(4), "Year-to-year spread."]
    ];
    rows.forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", null, r[0]));
      tr.appendChild(el("td", { "class": "num" }, r[1]));
      tr.appendChild(el("td", null, r[2]));
      tb.appendChild(tr);
    });
  }

  function fillLooTable() {
    var tb = document.querySelector("#table-loo tbody");
    tb.textContent = "";
    loo.forEach(function (r, i) {
      var tr = el("tr");
      if (D.imageCount[i] < 10) tr.className = "flag";
      tr.appendChild(el("td", null, String(r.omitted)));
      tr.appendChild(el("td", { "class": "num" }, fmtSigned(r.slope, 5)));
      tr.appendChild(el("td", { "class": "num" }, r.p.toFixed(3)));
      tb.appendChild(tr);
    });
  }

  /* ---------- SVG charts ---------- */

  function trendChart() {
    var host = $("chart-trend");
    host.textContent = "";
    var W = 760, H = 400, m = { l: 64, r: 22, t: 20, b: 70 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;

    var lo = Math.min.apply(null, y), hi = Math.max.apply(null, y);
    var ymin = Math.floor((lo - 0.003) / 0.01) * 0.01;
    var ymax = Math.ceil((hi + 0.003) / 0.01) * 0.01;
    function sx(v) { return m.l + (v - x[0]) / (x[x.length - 1] - x[0]) * iw; }
    function sy(v) { return m.t + (ymax - v) / (ymax - ymin) * ih; }

    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Annual mean NDBI from 2018 to 2025 with a linear fit" });

    for (var t = Math.round(ymin * 100); t <= Math.round(ymax * 100); t += 1) {
      var tv = t / 100;
      root.appendChild(svg("line", { x1: m.l, x2: W - m.r, y1: sy(tv), y2: sy(tv),
        "class": Math.abs(tv) < 1e-9 ? "zero" : "grid" }));
      root.appendChild(svg("text", { x: m.l - 8, y: sy(tv) + 4, "text-anchor": "end" }, fmt(tv, 2)));
    }
    x.forEach(function (yr) {
      root.appendChild(svg("text", { x: sx(yr), y: H - m.b + 20, "text-anchor": "middle" }, String(yr)));
    });
    root.appendChild(svg("text", { x: m.l + iw / 2, y: H - m.b + 42, "text-anchor": "middle", "class": "axis-title" }, "Year (January to March composite)"));
    var yl = svg("text", { transform: "translate(16," + (m.t + ih / 2) + ") rotate(-90)", "text-anchor": "middle", "class": "axis-title" }, "Mean NDBI");
    root.appendChild(yl);

    var pts = x.map(function (yr, i) { return sx(yr) + "," + sy(y[i]); }).join(" ");
    root.appendChild(svg("polyline", { points: pts, "class": "series" }));

    root.appendChild(svg("line", {
      x1: sx(x[0]), y1: sy(fit.intercept + fit.slope * x[0]),
      x2: sx(x[x.length - 1]), y2: sy(fit.intercept + fit.slope * x[x.length - 1]), "class": "fit" }));

    x.forEach(function (yr, i) {
      var c = svg("circle", { cx: sx(yr), cy: sy(y[i]), r: 5.5,
        "class": "pt" + (D.imageCount[i] < 10 ? " hollow" : "") });
      c.appendChild(svg("title", null, yr + ": mean NDBI " + fmt(y[i], 4) + ", " + D.imageCount[i] + " images"));
      root.appendChild(c);
    });

    /* legend */
    var ly = H - 14;
    root.appendChild(svg("line", { x1: m.l, x2: m.l + 28, y1: ly - 4, y2: ly - 4, "class": "series" }));
    root.appendChild(svg("text", { x: m.l + 34, y: ly, "class": "legend-text" }, "Annual mean"));
    root.appendChild(svg("line", { x1: m.l + 150, x2: m.l + 178, y1: ly - 4, y2: ly - 4, "class": "fit" }));
    root.appendChild(svg("text", { x: m.l + 184, y: ly, "class": "legend-text" },
      "OLS fit (" + fmtSigned(fit.slope, 5) + " / yr, p = " + fit.p.toFixed(2) + ")"));
    root.appendChild(svg("circle", { cx: m.l + 430, cy: ly - 4, r: 5, "class": "pt hollow" }));
    root.appendChild(svg("text", { x: m.l + 442, y: ly, "class": "legend-text" }, "Fewer than 10 images"));

    host.appendChild(root);
  }

  function countChart() {
    var host = $("chart-count");
    host.textContent = "";
    var W = 480, H = 400, m = { l: 44, r: 14, t: 20, b: 56 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var ymax = 20;
    function sy(v) { return m.t + (ymax - v) / ymax * ih; }
    var band = iw / x.length, bw = band * 0.62;

    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Number of Sentinel-2 images per year" });

    [0, 5, 10, 15, 20].forEach(function (tv) {
      root.appendChild(svg("line", { x1: m.l, x2: W - m.r, y1: sy(tv), y2: sy(tv), "class": tv === 0 ? "zero" : "grid" }));
      root.appendChild(svg("text", { x: m.l - 8, y: sy(tv) + 4, "text-anchor": "end" }, String(tv)));
    });
    x.forEach(function (yr, i) {
      var bx = m.l + band * i + (band - bw) / 2;
      var r = svg("rect", { x: bx, y: sy(D.imageCount[i]), width: bw, height: sy(0) - sy(D.imageCount[i]),
        "class": "bar" + (D.imageCount[i] < 10 ? " low" : "") });
      r.appendChild(svg("title", null, yr + ": " + D.imageCount[i] + " images"));
      root.appendChild(r);
      root.appendChild(svg("text", { x: bx + bw / 2, y: sy(D.imageCount[i]) - 5, "class": "val" }, String(D.imageCount[i])));
      root.appendChild(svg("text", { x: bx + bw / 2, y: H - m.b + 20, "text-anchor": "middle" }, String(yr)));
    });
    root.appendChild(svg("text", { x: m.l + iw / 2, y: H - 10, "text-anchor": "middle", "class": "axis-title" }, "Year"));
    root.appendChild(svg("text", { transform: "translate(14," + (m.t + ih / 2) + ") rotate(-90)", "text-anchor": "middle", "class": "axis-title" }, "Scenes"));
    host.appendChild(root);
  }

  /* ---------- map ---------- */

  function initMap() {
    var status = $("map-status");
    var mapEl = $("map");

    if (typeof window.L === "undefined") {
      status.textContent = "The map library could not be loaded (check the internet connection). The charts and tables still work.";
      status.className = "status warn";
      return;
    }

    var B = D.bounds;
    var bounds = L.latLngBounds([B.south, B.west], [B.north, B.east]);
    var map = L.map(mapEl, { minZoom: 9, maxZoom: 18 });
    map.fitBounds(bounds);

    var osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" });
    var sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Tiles &copy; Esri" });
    osm.addTo(map);
    L.control.layers({ "OpenStreetMap": osm, "Satellite": sat }, null, { collapsed: true }).addTo(map);
    L.control.scale({ metric: true, imperial: false }).addTo(map);

    /* ward boundaries (optional file) */
    var wardLayer = null;
    var wardsToggle = $("wards-toggle");
    fetch(D.files.wards)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (g) {
        wardLayer = L.geoJSON(g, {
          style: { color: "#111", weight: 1.2, fillOpacity: 0, opacity: 0.85 },
          onEachFeature: function (f, layer) {
            var p = f.properties || {};
            var no = p.Ward_No !== undefined ? p.Ward_No : p.ward_no;
            if (no !== undefined) layer.bindTooltip("Ward " + no, { sticky: true, className: "ward-tip" });
          }
        });
        if (wardsToggle.checked) wardLayer.addTo(map);
      })
      .catch(function () {
        wardsToggle.disabled = true;
        addNote("Ward boundaries not found at " + D.files.wards + ". Run export_for_web.py to create them.");
      });
    wardsToggle.addEventListener("change", function () {
      if (!wardLayer) return;
      if (wardsToggle.checked) wardLayer.addTo(map); else map.removeLayer(wardLayer);
    });

    var notes = [];
    function addNote(msg) {
      if (notes.indexOf(msg) === -1) notes.push(msg);
      status.textContent = notes.join(" ");
      status.className = "status warn";
    }

    /* legend */
    var legend = $("legend");
    function drawLegend(mode) {
      var v = mode === "change" ? D.changeVis : D.annualVis;
      legend.textContent = "";
      legend.appendChild(el("div", { "class": "title" },
        mode === "change" ? "NDBI change (2025 minus 2018)" : "NDBI (Jan–Mar median)"));
      var ramp = el("div", { "class": "ramp" });
      ramp.style.background = "linear-gradient(to right, " + v.palette.join(", ") + ")";
      legend.appendChild(ramp);
      var ticks = el("div", { "class": "ticks" });
      [v.min, (v.min + v.max) / 2, v.max].forEach(function (t) {
        ticks.appendChild(el("span", null, fmtSigned(t, 1).replace("+0.0", "0.0")));
      });
      legend.appendChild(ticks);
      if (mode === "change") {
        legend.appendChild(el("div", { "class": "ticks" }, null));
        legend.lastChild.appendChild(el("span", null, "decrease"));
        legend.lastChild.appendChild(el("span", null, "increase"));
      }
    }

    /* raster overlay */
    var modeSel = $("mode"), yearIn = $("year"), yearOut = $("year-out");
    var opacityIn = $("opacity"), playBtn = $("play");
    var overlay = null, token = 0, timer = null;

    function urlFor(mode, year) {
      return mode === "change" ? D.files.change : D.files.annualPattern.replace("{year}", year);
    }
    function probe(url) {
      return new Promise(function (resolve) {
        var im = new Image();
        im.onload = function () { resolve(true); };
        im.onerror = function () { resolve(false); };
        im.src = url;
      });
    }
    function render() {
      var mode = modeSel.value, year = Number(yearIn.value);
      yearOut.textContent = mode === "change" ? "2018 to 2025" : String(year);
      yearIn.disabled = mode === "change";
      drawLegend(mode);
      var url = urlFor(mode, year), my = ++token;
      probe(url).then(function (ok) {
        if (my !== token) return;
        if (overlay) { map.removeLayer(overlay); overlay = null; }
        if (!ok) {
          addNote("Raster " + url + " was not found. Run export_for_web.py and commit the data folder.");
          return;
        }
        notes = notes.filter(function (n) { return n.indexOf("Raster ") !== 0; });
        status.textContent = notes.join(" ");
        if (!notes.length) status.className = "status";
        overlay = L.imageOverlay(url, bounds, { opacity: Number(opacityIn.value), interactive: false }).addTo(map);
      });
    }

    modeSel.addEventListener("change", function () { stopPlay(); render(); });
    yearIn.addEventListener("input", render);
    opacityIn.addEventListener("input", function () { if (overlay) overlay.setOpacity(Number(opacityIn.value)); });

    function stopPlay() {
      if (timer) { clearInterval(timer); timer = null; }
      playBtn.textContent = "Play";
      playBtn.setAttribute("aria-pressed", "false");
    }
    playBtn.addEventListener("click", function () {
      if (timer) { stopPlay(); return; }
      if (modeSel.value === "change") { modeSel.value = "annual"; }
      playBtn.textContent = "Pause";
      playBtn.setAttribute("aria-pressed", "true");
      timer = setInterval(function () {
        var next = Number(yearIn.value) + 1;
        if (next > D.years[D.years.length - 1]) next = D.years[0];
        yearIn.value = next;
        render();
      }, 1300);
      render();
    });

    render();
  }

  /* ---------- start ---------- */

  function start() {
    bindCards();
    fillDataTable();
    fillStatsTable();
    fillLooTable();
    trendChart();
    countChart();
    initMap();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
