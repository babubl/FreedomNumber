/* ===========================================================
   FreedomNumber — script.js (compat-friendly, no optional chaining)
   - Buttons work (no accidental form submit)
   - Existing rows become editable on load
   - Add Item / Add Event append editable rows
   - Auto-compute Key Metrics + table
   =========================================================== */

(function () {
  "use strict";

  // Marker logs
  try { console.log("[FreedomNumber] script loaded"); } catch (e) {}

  // ---------- Helpers ----------
  function $(id) { return document.getElementById(id); }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function num(id) {
    var el = $(id);
    var v = el ? el.value : "0";
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  function cleanNum(str) {
    return parseFloat(String(str).replace(/[₹,\s]/g, "")) || 0;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m];
    });
  }
  function money(n) {
    return isNaN(n) ? "—" : ("₹ " + Math.round(n).toLocaleString("en-IN"));
  }
  function pct(x, d) {
    d = (typeof d === "number") ? d : 2;
    return isNaN(x) ? "—" : ((x*100).toFixed(d) + "%");
  }
  function setText(id, val) {
    var el = $(id);
    if (el) el.textContent = val;
  }

  // ---------- Tables: read current state ----------
  function getTables() {
    var regs = qa("#regTable tbody tr").map(function (tr) {
      var td = tr.querySelectorAll("td");
      var nameIn   = tr.querySelector("input[data-field='name']");
      var amountIn = tr.querySelector("input[data-field='amount']");
      var growthIn = tr.querySelector("input[data-field='growth']");
      var tenureIn = tr.querySelector("input[data-field='tenure']");
      var startIn  = tr.querySelector("input[data-field='start']");
      return {
        name:  nameIn ? nameIn.value : ((td[0] && td[0].textContent.trim()) || "Item"),
        amount: amountIn ? parseFloat(amountIn.value) || 0 : cleanNum((td[1] && td[1].textContent) || ""),
        growth: growthIn ? parseFloat(growthIn.value) || 0 : (parseFloat((td[2] && td[2].textContent) || "0") || 0),
        tenure: tenureIn ? parseFloat(tenureIn.value) || 0 : (parseFloat((td[3] && td[3].textContent) || "0") || 0),
        start:  startIn ? parseFloat(startIn.value) || 0 : (parseFloat((td[4] && td[4].textContent) || "0") || 0)
      };
    });

    var plans = qa("#planTable tbody tr").map(function (tr) {
      var td = tr.querySelectorAll("td");
      var nameIn  = tr.querySelector("input[data-field='name']");
      var eventIn = tr.querySelector("input[data-field='event']");
      var amountIn= tr.querySelector("input[data-field='amount']");
      var inflIn  = tr.querySelector("input[data-field='infl']");
      return {
        name:  nameIn ? nameIn.value : ((td[0] && td[0].textContent.trim()) || "Event"),
        event: eventIn ? (parseFloat(eventIn.value) || 0) : (parseFloat((td[1] && td[1].textContent) || "0") || 0),
        amount: amountIn ? (parseFloat(amountIn.value) || 0) : cleanNum((td[2] && td[2].textContent) || ""),
        infl:  inflIn ? (parseFloat(inflIn.value) || 0) : (parseFloat((td[3] && td[3].textContent) || "0") || 0)
      };
    });

    return { regs: regs, plans: plans };
  }

  // ---------- Tables: render as editable ----------
  function renderTablesEditable(regs, plans) {
    var regBody  = q("#regTable tbody");
    var planBody = q("#planTable tbody");
    if (!regBody || !planBody) {
      try { console.warn("[FreedomNumber] regTable/planTable tbody not found."); } catch (e) {}
      return;
    }

    regBody.innerHTML = "";
    regs.forEach(function (r, idx) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td><input type="text" value="' + escapeHtml(r.name) + '" data-field="name" /></td>' +
        '<td class="num"><input type="number" step="1" value="' + (+r.amount || 0) + '" data-field="amount" /></td>' +
        '<td class="num"><input type="number" step="0.001" value="' + (+r.growth || 0) + '" data-field="growth" /></td>' +
        '<td class="num"><input type="number" step="1" value="' + (+r.tenure || 0) + '" data-field="tenure" /></td>' +
        '<td class="num"><input type="number" step="1" value="' + (+r.start || 0) + '" data-field="start" /></td>' +
        '<td class="num"><button type="button" class="btn btn--secondary" data-action="del-reg" data-idx="' + idx + '">Remove</button></td>';
      regBody.appendChild(tr);
    });

    planBody.innerHTML = "";
    plans.forEach(function (p, idx) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td><input type="text" value="' + escapeHtml(p.name) + '" data-field="name" /></td>' +
        '<td class="num"><input type="number" step="1" value="' + (+p.event || 0) + '" data-field="event" /></td>' +
        '<td class="num"><input type="number" step="1" value="' + (+p.amount || 0) + '" data-field="amount" /></td>' +
        '<td class="num"><input type="number" step="0.001" value="' + (+p.infl || 0) + '" data-field="infl" /></td>' +
        '<td class="num"><button type="button" class="btn btn--secondary" data-action="del-plan" data-idx="' + idx + '">Remove</button></td>';
      planBody.appendChild(tr);
    });

    // Recompute on edits
    qa("#regTable input, #planTable input").forEach(function (inp) {
      inp.addEventListener("input", recompute, { passive: true });
    });

    // Delegate deletes
    regBody.onclick = function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("button[data-action='del-reg']") : null;
      if (!btn) return;
      var idx = parseInt(btn.getAttribute("data-idx"), 10);
      var state = getTables();
      state.regs.splice(idx, 1);
      renderTablesEditable(state.regs, state.plans);
      recompute();
    };
    planBody.onclick = function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("button[data-action='del-plan']") : null;
      if (!btn) return;
      var idx = parseInt(btn.getAttribute("data-idx"), 10);
      var state = getTables();
      state.plans.splice(idx, 1);
      renderTablesEditable(state.regs, state.plans);
      recompute();
    };
  }

  // ---------- Bootstrap: convert default static rows to inputs ----------
  function bootstrapTablesFromDOM() {
    if (q("#regTable tbody input") || q("#planTable tbody input")) return;

    var regs = [];
    qa("#regTable tbody tr").forEach(function (tr) {
      var td = tr.querySelectorAll("td");
      if (td.length < 5) return;
      regs.push({
        name:  (td[0] && td[0].textContent.trim()) || "Item",
        amount: cleanNum((td[1] && td[1].textContent) || ""),
        growth: parseFloat((td[2] && td[2].textContent) || "0") || 0,
        tenure: parseFloat((td[3] && td[3].textContent) || "0") || 0,
        start:  parseFloat((td[4] && td[4].textContent) || "0") || 0
      });
    });

    var plans = [];
    qa("#planTable tbody tr").forEach(function (tr) {
      var td = tr.querySelectorAll("td");
      if (td.length < 4) return;
      plans.push({
        name:  (td[0] && td[0].textContent.trim()) || "Event",
        event: parseFloat((td[1] && td[1].textContent) || "0") || 0,
        amount: cleanNum((td[2] && td[2].textContent) || ""),
        infl:  parseFloat((td[3] && td[3].textContent) || "0") || 0
      });
    });

    renderTablesEditable(regs, plans);
  }

  // ---------- Projection math ----------
  function computeProjection(inputs, regs, plans) {
    var currentAge = inputs.currentAge;
    var freedomAge = inputs.freedomAge;
    var lifeAge = inputs.lifeAge;
    var inflation = inputs.inflation;
    var ret = inputs.ret;
    var buffer = inputs.buffer;
    var currentCorpus = inputs.currentCorpus;
    var monthlySIP = inputs.monthlySIP;
    var annualRetirementIncome = inputs.annualRetirementIncome;
    var ter = inputs.ter;
    var stressOn = inputs.stressOn;

    var rEffBase = ret - ter; // nominal net
    var proj = [];
    var corpus = currentCorpus;

    // Pre-freedom growth with SIPs
    for (var age = currentAge; age < freedomAge; age++) {
      corpus += monthlySIP * 12;
      corpus *= 1 + rEffBase;
    }

    for (var a = freedomAge; a <= lifeAge; a++) {
      // Regular
      var regSum = regs.reduce(function (s, r) {
        var active = a >= r.start && a < r.start + r.tenure;
        if (!active) return s;
        return s + r.amount * Math.pow(1 + r.growth, a - r.start);
      }, 0);

      // Planned
      var planSum = plans.reduce(function (s, p) {
        if (a !== p.event) return s;
        var yrs = Math.max(0, a - currentAge);
        return s + p.amount * Math.pow(1 + p.infl, yrs);
      }, 0);

      var total = regSum + planSum;
      var totalWithBuffer = total * (1 + buffer);

      // Stress: reduce real return by 2% in first 10 post-freedom years
      var rEff = rEffBase;
      if (stressOn && a < freedomAge + 10) {
        var real = (1 + rEffBase) / (1 + inflation) - 1;
        var stressedReal = real - 0.02;
        rEff = (1 + stressedReal) * (1 + inflation) - 1;
      }

      var retAmt = corpus * rEff;
      var spendAfterIncome = Math.max(0, totalWithBuffer - annualRetirementIncome); // income deducted after buffer
      var endCorpus = corpus + retAmt - spendAfterIncome;

      proj.push({
        age: a,
        reg: regSum,
        planned: planSum,
        total: total,
        totalWithBuffer: totalWithBuffer,
        startCorpus: corpus,
        ret: retAmt,
        endCorpus: endCorpus
      });

      corpus = endCorpus;
    }

    return proj;
  }

  // Annual spend today = regular at currentAge (+ planned only if event is this year)
  function computeAnnualToday(regs, plans, currentAge) {
    var regSum = regs.reduce(function (a, r) {
      var active = currentAge >= r.start && currentAge < r.start + r.tenure;
      if (!active) return a;
      return a + r.amount * Math.pow(1 + r.growth, currentAge - r.start);
    }, 0);
    var planToday = plans.reduce(function (a, p) {
      return a + (p.event === currentAge ? p.amount : 0);
    }, 0);
    return regSum + planToday;
  }

  // ---------- Rendering ----------
  function renderProjection(proj) {
    var tbody = q("#projTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    proj.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + r.age + "</td>" +
        '<td class="num">' + money(r.reg) + "</td>" +
        '<td class="num">' + money(r.planned) + "</td>" +
        '<td class="num">' + money(r.total) + "</td>" +
        '<td class="num">' + money(r.totalWithBuffer) + "</td>" +
        '<td class="num">' + money(r.startCorpus) + "</td>" +
        '<td class="num">' + money(r.ret) + "</td>" +
        '<td class="num">' + money(r.endCorpus) + "</td>";
      tbody.appendChild(tr);
    });
  }

  function renderKPIs(proj, inputs, regs, plans) {
    if (!proj.length) return;

    var first = proj[0];
    var last  = proj[proj.length - 1];

    var annualToday = computeAnnualToday(regs, plans, inputs.currentAge);
    var rule40      = annualToday * 40;
    var year1Spend  = Math.max(0, first.totalWithBuffer - inputs.annualRetirementIncome);
    var swr         = first.startCorpus > 0 ? year1Spend / first.startCorpus : NaN;
    var maxCorpus   = Math.max.apply(null, proj.map(function (r) { return r.startCorpus; }));
    var end         = last.endCorpus;
    var gap         = end < 0 ? Math.abs(end) : 0;

    setText("kpiAnnual",        money(annualToday));
    setText("kpi40x",           money(rule40));
    setText("kpiCorpusFreedom", money(first.startCorpus));
    setText("kpiSpendYear1",    money(year1Spend));
    setText("kpiSWR",           pct(swr));
    setText("kpiMax",           money(maxCorpus));
    setText("rowCount",         String(proj.length));
    setText("lifeAgeEcho",      String(inputs.lifeAge));
    setText("freedomEcho",      String(inputs.freedomAge));

    var wrap = $("kpiSurplusWrap");
    if (wrap) {
      wrap.classList.remove("kpi--surplus");
      wrap.classList.remove("kpi--shortfall");
      if (end > 1) wrap.classList.add("kpi--surplus");
      else if (end < -1) wrap.classList.add("kpi--shortfall");
    }
    setText("kpiSurplus", end >= 0 ? ("Surplus " + money(end)) : ("Shortfall " + money(Math.abs(end))));
    setText("kpiReq", money(gap));

    var badge = $("kpiStatus");
    var banner = $("summaryBanner");
    if (badge) {
      badge.classList.remove("badge--ok");
      badge.classList.remove("badge--risk");
      badge.classList.remove("badge--neutral");
    }

    if (end > 1) {
      if (badge) { badge.classList.add("badge--ok"); badge.textContent = "Surplus"; }
      if (banner) banner.textContent = "You’re projected to finish with a surplus of " + money(end) + " at age " + inputs.lifeAge + ".";
    } else if (end < -1) {
      if (badge) { badge.classList.add("badge--risk"); badge.textContent = "Shortfall"; }
      if (banner) banner.textContent = "Projected shortfall of " + money(Math.abs(end)) + " by age " + inputs.lifeAge + ".";
    } else {
      if (badge) { badge.classList.add("badge--neutral"); badge.textContent = "Balanced"; }
      if (banner) banner.textContent = "Your plan balances near ₹0 at age " + inputs.lifeAge + ".";
    }

    var band = (!isFinite(swr)) ? "—" : (swr <= 0.04 ? "conservative" : (swr <= 0.06 ? "reasonable" : "aggressive"));
    var narrative =
      "At age " + inputs.freedomAge + ", corpus is " + money(first.startCorpus) + ". " +
      "Year-1 spend is " + money(year1Spend) + " → SWR " + pct(swr) + " (" + band + "). " +
      (end < -1
        ? "Add about " + money(Math.abs(end)) + " today (or adjust SIP/age/spend)."
        : end > 1
          ? "On current settings you retain a surplus of " + money(end) + " by age " + inputs.lifeAge + "."
          : "This plan is calibrated to finish near ₹0 by age " + inputs.lifeAge + ".");
    setText("kpiNarrative", narrative);
  }

  // ---------- Recompute ----------
  function recompute() {
    var inputs = {
      currentAge: num("currentAge"),
      freedomAge: num("freedomAge"),
      lifeAge: num("lifeAge"),
      inflation: num("inflation"),
      ret: num("ret"),
      buffer: num("buffer"),
      currentCorpus: num("currentCorpus"),
      monthlySIP: num("monthlySIP"),
      annualRetirementIncome: num("annualRetirementIncome"),
      ter: num("ter"),
      stressOn: (function () {
        var on = $("stressOn");
        return on ? (on.getAttribute("aria-pressed") === "true") : false;
      })()
    };

    var t = getTables();
    var proj = computeProjection(inputs, t.regs, t.plans);

    renderProjection(proj);
    renderKPIs(proj, inputs, t.regs, t.plans);

    try {
      localStorage.setItem("inputs", JSON.stringify(inputs));
      localStorage.setItem("regs", JSON.stringify(t.regs));
      localStorage.setItem("plans", JSON.stringify(t.plans));
    } catch (e) {}
  }

  // ---------- Init ----------
  function init() {
    try { console.log("[FreedomNumber] init start"); } catch (e) {}

    // 1) Convert default static rows to editable inputs (once)
    bootstrapTablesFromDOM();

    // 2) Non-table inputs: recompute on change
    qa("input").forEach(function (inp) {
      if (inp.closest && (inp.closest("#regTable") || inp.closest("#planTable"))) return; // tables bind separately
      inp.addEventListener("input", recompute, { passive: true });
    });

    // 3) Stress toggle
    var on  = $("stressOn");
    var off = $("stressOff");
    if (on && off) {
      on.addEventListener("click", function () {
        on.setAttribute("aria-pressed", "true");
        off.setAttribute("aria-pressed", "false");
        recompute();
      });
      off.addEventListener("click", function () {
        on.setAttribute("aria-pressed", "false");
        off.setAttribute("aria-pressed", "true");
        recompute();
      });
    }

    // 4) Longevity presets
    [["life85",85],["life90",90],["life95",95]].forEach(function (pair) {
      var id = pair[0], val = pair[1];
      var b = $(id);
      if (!b) return;
      b.addEventListener("click", function () {
        var life = $("lifeAge");
        if (life) life.value = val;
        setText("lifeAgeEcho", String(val));
        recompute();
      });
    });

    // 5) Add Item / Add Event
    var addReg = $("addReg");
    if (addReg) addReg.addEventListener("click", function () {
      var state = getTables();
      state.regs.push({ name: "New Item", amount: 60000, growth: 0.06, tenure: 30, start: num("currentAge") });
      renderTablesEditable(state.regs, state.plans);
      recompute();
    });

    var addPlan = $("addPlan");
    if (addPlan) addPlan.addEventListener("click", function () {
      var state = getTables();
      state.plans.push({ name: "New Event", event: num("freedomAge") + 5, amount: 300000, infl: 0.06 });
      renderTablesEditable(state.regs, state.plans);
      recompute();
    });

    // 6) Reset / Prefill
    var resetBtn = $("resetBtn");
    if (resetBtn) resetBtn.addEventListener("click", function () {
      try { localStorage.clear(); } catch (e) {}
      location.reload();
    });
    var loadIndicative = $("loadIndicative");
    if (loadIndicative) loadIndicative.addEventListener("click", function () {
      try { localStorage.clear(); } catch (e) {}
      location.reload();
    });

    // 7) First compute
    recompute();

    try { console.log("[FreedomNumber] init complete"); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
