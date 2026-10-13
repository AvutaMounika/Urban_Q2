/*
 * stats.js
 * Small, dependency-free statistics helpers used by the Faridabad NDBI site.
 * Every number shown in the "Trend statistics" panel is computed here from the
 * eight annual mean NDBI values, so the page can be audited by reading this file.
 *
 * Works in the browser (window.NDBIStats) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NDBIStats = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function mean(a) {
    return a.reduce(function (s, v) { return s + v; }, 0) / a.length;
  }

  function sd(a) {
    var m = mean(a);
    var ss = a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0);
    return Math.sqrt(ss / (a.length - 1));
  }

  /* ---------- log-gamma, regularised incomplete beta, Student t ---------- */

  function lgamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y += 1; ser += c[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  function betacf(a, b, x) {
    var MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function ibeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) +
                      a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }

  /* two-sided p-value of Student's t with df degrees of freedom */
  function tTwoSidedP(t, df) {
    return ibeta(df / 2, 0.5, df / (df + t * t));
  }

  /* CDF of Student's t, used to find the 97.5th percentile by bisection */
  function tCdf(t, df) {
    var p = 0.5 * ibeta(df / 2, 0.5, df / (df + t * t));
    return t > 0 ? 1 - p : p;
  }

  function tQuantile(p, df) {
    var lo = -50, hi = 50;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (tCdf(mid, df) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ---------- ordinary least squares y = a + b x ---------- */

  function ols(x, y) {
    var n = x.length, mx = mean(x), my = mean(y);
    var sxx = 0, sxy = 0, syy = 0;
    for (var i = 0; i < n; i++) {
      sxx += (x[i] - mx) * (x[i] - mx);
      sxy += (x[i] - mx) * (y[i] - my);
      syy += (y[i] - my) * (y[i] - my);
    }
    var slope = sxy / sxx;
    var intercept = my - slope * mx;
    var sse = 0;
    for (var k = 0; k < n; k++) {
      var r = y[k] - (intercept + slope * x[k]);
      sse += r * r;
    }
    var df = n - 2;
    var s2 = sse / df;
    var se = Math.sqrt(s2 / sxx);
    var t = slope / se;
    var tcrit = tQuantile(0.975, df);
    return {
      n: n, df: df, sxx: sxx, sxy: sxy, syy: syy, sse: sse,
      slope: slope, intercept: intercept, se: se, t: t,
      p: tTwoSidedP(t, df),
      r2: 1 - sse / syy,
      residualSd: Math.sqrt(s2),
      tcrit: tcrit,
      ciLow: slope - tcrit * se,
      ciHigh: slope + tcrit * se,
      minDetectableSlope: tcrit * se
    };
  }

  /* ---------- Sen's slope ---------- */

  function senSlope(x, y) {
    var s = [];
    for (var i = 0; i < x.length; i++)
      for (var j = i + 1; j < x.length; j++)
        s.push((y[j] - y[i]) / (x[j] - x[i]));
    s.sort(function (a, b) { return a - b; });
    var m = s.length;
    return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
  }

  /* ---------- Kendall's tau with an EXACT two-sided p-value (no ties) ----------
   * Under H0 (no trend) the number of discordant pairs D has the distribution of the
   * number of inversions of a random permutation of n items. Its counts follow
   * c_m[k] = sum_{j=0}^{m-1} c_{m-1}[k-j]  (Mahonian numbers).
   */
  function kendall(x, y) {
    var n = x.length, C = 0, D = 0;
    for (var i = 0; i < n; i++)
      for (var j = i + 1; j < n; j++) {
        var s = (x[j] - x[i]) * (y[j] - y[i]);
        if (s > 0) C++; else if (s < 0) D++;
      }
    var pairs = n * (n - 1) / 2;
    var tau = (C - D) / pairs;

    var c = [1];
    for (var m = 2; m <= n; m++) {
      var next = new Array(c.length + m - 1).fill(0);
      for (var k = 0; k < c.length; k++)
        for (var jj = 0; jj < m; jj++) next[k + jj] += c[k];
      c = next;
    }
    var total = c.reduce(function (a, b) { return a + b; }, 0);
    var extreme = Math.max(C, D);          /* larger of the two tails */
    var tail = 0;
    for (var d = extreme; d < c.length; d++) tail += c[d];
    var p = Math.min(1, 2 * tail / total);
    return { tau: tau, concordant: C, discordant: D, pairs: pairs, p: p };
  }

  /* slope after removing one observation (leave-one-out) */
  function leaveOneOut(x, y) {
    return x.map(function (xi, i) {
      var xs = x.filter(function (_, k) { return k !== i; });
      var ys = y.filter(function (_, k) { return k !== i; });
      var f = ols(xs, ys);
      return { omitted: xi, slope: f.slope, p: f.p };
    });
  }

  return {
    mean: mean, sd: sd, ols: ols, senSlope: senSlope,
    kendall: kendall, leaveOneOut: leaveOneOut,
    tTwoSidedP: tTwoSidedP, tQuantile: tQuantile
  };
});
