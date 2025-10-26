/* =====================================================================
   FreedomNumber — script.js (v1.3)
   - Simple/Advanced modes
   - Regular expenses use From age / Until age
   - Editable rows + Add/Remove for both tables
   - Live KPIs (5 core metrics) + early depletion warning
   - Stress test, CSV export, Audit modal, Share link
   - No optional chaining; broad browser compatibility
   ===================================================================== */

(function () {
  "use strict";

  // ---- Console markers (for quick diagnostics) ----
  try { console.log("[FreedomNumber] script loaded v1.3"); } catch (e) {}

  // ------------------ Utilities --------------------
  function $(id) { return document.getElementById(id); }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function numVal(el) {
    if (!el) return 0;
    var n = parseFloat(el.value);
    return isNaN(n) ? 0 : n;
  }
  function num(id) { return numVal($(id)); }

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
    return isNaN(x) ? "—" : ((x * 100).toFixed(d) + "%");
  }
  function setText(id, val) {
    var el = $(id);
    if (el) el.textContent = val;
  }
  function clamp(x, lo, hi) {
    if (x < lo) return lo;
    if (x > hi) return hi;
    return x;
  }

  // ------------------ State I/O --------------------
  function getInputs() {
    var stressOn = false;
    var sOn = $("stressOn");
    if (sOn && sOn.getAttribute("aria-pressed") === "true") stressOn = true;

    var inp = {
      currentAge: num("currentAge"),
      freedomAge: num("freedomAge"),
      lifeAge: num("lifeAge"),
      currentCorpus: num("currentCorpus"),
      monthlySIP: num("monthlySIP"),
      annualRetirementIncome: num("annualRetirementIncome"),
      ret: num("ret"),                // after tax & fees (annual)
      inflation: num("inflation"),    // default inflation (advanced)
      buffer: num("buffer"),          // safety margin on spend
      ter: num("ter"),                // optional; if > 0, we treat `ret` as gross
      stressOn: stressOn
    };

    // gentle bounds to avoid extreme inputs causing NaNs
    inp.currentAge = clamp(inp.currentAge, 18, 100);
    inp.freedomAge = clamp(inp.freedomAge, 30, 80);
    inp.lifeAge    = clamp(inp.lifeAge, Math.max(inp.freedomAge, 60), 100);
    inp.ret        = clamp(inp.ret, 0, 0.15);
    inp.inflation  = clamp(inp.inflation || 0.06, 0, 0.20);
    inp.buffer     = clamp(inp.buffer || 0.15, 0, 0.30);
    inp.ter        = clamp(inp.ter || 0, 0, 0.03);

    // If TER is provided (>0), interpret ret as gross and net it.
    // Otherwise assume ret is already after tax & fees.
    if (inp.ter > 0) {
      inp.ret = Math.max(0, inp.ret - inp.ter);
    }

    return inp;
  }

  function getTables() {
    // REGULAR: Category | Amount | Growth | From age | Until age
    var regs = qa("#regTable tbody tr").map(function (tr) {
      var tds = tr.querySelectorAll("td");
      var nameIn   = tr.querySelector("input[data-field='name']");
      var amtIn    = tr.querySelector("input[data-field='amount']");
      var gIn      = tr.querySelector("input[data-field='growth']");
      var fromIn   = tr.querySelector("input[data-field='from']");
      var untilIn  = tr.querySelector("input[data-field='until']");
      return {
        name:  nameIn ? nameIn.value : ((tds[0] && tds[0].textContent.trim()) || "Item"),
        amount: amtIn ? (parseFloat(amtIn.value) || 0) : cleanNum((tds[1] && tds[1].textContent) || ""),
        growth: gIn ? (parseFloat(gIn.value) || 0) : (parseFloat((tds[2] && tds[2].textContent) || "0") || 0),
        from:  fromIn ? (parseFloat(fromIn.value) || 0) : (parseFloat((tds[3] && tds[3].textContent) || "0") || 0),
        until: untilIn ? (parseFloat(untilIn.value) || 0) : (parseFloat((tds[4] && tds[4].textContent) || "0") || 0)
      };
    });

    // PLANNED: Event | Age | Amount today | Inflation
    var plans = qa("#planTable tbody tr").map(function (tr) {
      var tds = tr.querySelectorAll("td");
      var nameIn  = tr.querySelector("input[data-field='name']");
      var ageIn   = tr.querySelector("input[data-field='event']");
      var amtIn   = tr.querySelector("input[data-field='amount']");
      var infIn   = tr.querySelector("input[data-field='infl']");
      return {
        name:  nameIn ? nameIn.value : ((tds[0] && tds[0].textContent.trim()) || "Event"),
        event: ageIn ? (parseFloat(ageIn.value) || 0) : (parseFloat((tds[1] && tds[1].textContent) || "0") || 0),
        amount: amtIn ? (parseFloat(amtIn.value) || 0) : cleanNum((tds[2] && tds[2].textContent) || ""),
        infl:  infIn ? (parseFloat(infIn.value) || 0) : (parseFloat((tds[3] && tds[3].textContent) || "0") || 0)
      };
    });

    return { regs: regs, plans: plans };
  }

  function renderTablesEditable(regs, plans) {
    var regBody  = q("#regTable tbody");
    var planBody = q("#planTable tbody");
    if (!regBody || !planBody) return;

    regBody.innerHTML = "";
    regs.forEach(function (r, idx) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td><input type="text" value="' + escapeHtml(r.name) + '" data-field="name" /></td>' +
        '<td class="num"><input type="number" step="1" value="' + (+r.amount || 0) + '" data-field="amount" /></td>' +
        '<td class="num"><input type="number" step="0.001" value="' + (+r.growth || 0) + '" data-field="growth" /></td>' +
        '<td class="num"><input type="number" step="1" value="' + (+r.from || 0) + '" data-field="from" /></td>' +
        '<td class="num"><input type="number" step="1" value="' + (+r.until || 0) + '" data-field="until" /></td>' +
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

    // Live recompute on table edits
    qa("#regTable input, #planTable input").forEach(function (inp) {
      inp.addEventListener("input", recompute, { passive: true });
    });

    // Remove row via delegation
    regBody.onclick = function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("button[data-action='del-reg']") : null;
      if (!btn) return;
      var idx = parseInt(btn.getAttribute("data-idx"), 10);
      regs.splice(idx, 1);
      renderTablesEditable(regs, plans);
      saveState();
      recompute();
    };
    planBody.onclick = function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("button[data-action='del-plan']") : null;
      if (!btn) return;
      var idx = parseInt(btn.getAttribute("data-idx"), 10);
      plans.splice(idx, 1);
      renderTablesEditable(regs, plans);
      saveState();
      recompute();
    };
  }

  // Parse initial static DOM rows (first load) → editable inputs
  function bootstrapTablesFromDOM() {
    if (q("#regTable tbody input") || q("#planTable tbody input")) return;

    var regs = [], plans = [];
    qa("#regTable tbody tr").forEach(function (tr) {
      var td = tr.querySelectorAll("td");
      if (td.length < 5) return;
      regs.push({
        name:  (td[0] && td[0].textContent.trim()) || "Item",
        amount: cleanNum((td[1] && td[1].textContent) || ""),
        growth: parseFloat((td[2] && td[2].textContent) || "0") || 0,
        from:  parseFloat((td[3] && td[3].textContent) || "0") || 0,
        until: parseFloat((td[4] && td[4].textContent) || "0") || 0
      });
    });
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

  // --------------- Core Calculations ----------------
  function computeProjection(inputs, regs, plans) {
    var currentAge = inputs.currentAge;
    var freedomAge = inputs.freedomAge;
    var lifeAge    = inputs.lifeAge;
    var inflation  = inputs.inflation;
    var ret        = inputs.ret;
    var buffer     = inputs.buffer;
    var currentCorpus = inputs.currentCorpus;
    var monthlySIP = inputs.monthlySIP;
    var annualRetirementIncome = inputs.annualRetirementIncome;
    var stressOn   = inputs.stressOn;

    var proj = [];
    var corpus = currentCorpus;

    // grow to freedom with SIPs
    for (var age = currentAge; age < freedomAge; age++) {
      corpus += monthlySIP * 12;
      corpus *= (1 + ret);
    }

    // post-freedom years
    for (var a = freedomAge; a <= lifeAge; a++) {
      // Regular spend active if from <= a <= until
      var regSum = regs.reduce(function (s, r) {
        var active = (a >= r.from) && (a <= r.until);
        if (!active) return s;
        var growth = (typeof r.growth === "number" ? r.growth : inflation);
        var years = Math.max(0, a - r.from);
        return s + r.amount * Math.pow(1 + growth, years);
      }, 0);

      // Planned events at age a (inflated from currentAge)
      var planSum = plans.reduce(function (s, p) {
        if (a !== p.event) return s;
        var yrs = Math.max(0, a - currentAge);
        var inf = (typeof p.infl === "number" ? p.infl : inflation);
        return s + p.amount * Math.pow(1 + inf, yrs);
      }, 0);

      var total = regSum + planSum;
      var totalWithBuffer = total * (1 + buffer);

      // Effective return: optional stress for first 10 post-freedom years
      var rEff = ret;
      if (stressOn && a < freedomAge + 10) {
        var real = (1 + ret) / (1 + inflation) - 1;
        var stressedReal = real - 0.02; // −2% real
        rEff = (1 + stressedReal) * (1 + inflation) - 1;
      }

      var retAmt = corpus * rEff;
      var spendAfterIncome = Math.max(0, totalWithBuffer - annualRetirementIncome);
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

  function computeAnnualToday(regs, plans, currentAge) {
    var regSum = regs.reduce(function (a, r) {
      var active = currentAge >= r.from && currentAge <= r.until;
      if (!active) return a;
      var yrs = Math.max(0, currentAge - r.from);
      var g = (typeof r.growth === "number" ? r.growth : 0.06);
      return a + r.amount * Math.pow(1 + g, yrs);
    }, 0);
    var planToday = plans.reduce(function (a, p) {
      return a + (p.event === currentAge ? p.amount : 0);
    }, 0);
    return regSum + planToday;
  }

  // ----------------- Rendering ----------------------
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
    var early = $("earlyWarning");
    if (!proj.length) {
      if (early) early.hidden = true;
      setText("kpiCorpusFreedom", "—");
      setText("kpiSpendYear1", "—");
      setText("kpiSWR", "—");
      setText("kpiSurplus", "—");
      setText("kpiReq", "—");
      setText("kpiNarrative", "—");
      setText("kpiAnnual", "—");
      setText("kpi40x", "—");
      return;
    }

    var first = proj[0];
    var last  = proj[proj.length - 1];

    var annualToday = computeAnnualToday(regs, plans, inputs.currentAge);
    var rule40      = annualToday * 40;
    var year1Spend  = Math.max(0, first.totalWithBuffer - inputs.annualRetirementIncome);
    var swr         = first.startCorpus > 0 ? (year1Spend / first.startCorpus) : NaN;
    var end         = last.endCorpus;
    var gap         = end < 0 ? Math.abs(end) : 0;

    // early depletion detection
    var depletionAge = null;
    for (var i = 0; i < proj.length; i++) {
      if (proj[i].endCorpus < 0) { depletionAge = proj[i].age; break; }
    }
    if (early) {
      if (depletionAge !== null) {
        early.textContent = "Warning: Corpus depletes at age " + depletionAge + ". Increase SIP, delay retirement, reduce spend, or adjust return assumptions.";
        early.hidden = false;
      } else {
        early.hidden = true;
      }
    }

    // KPIs
    setText("kpiCorpusFreedom", money(first.startCorpus));
    setText("kpiSpendYear1",    money(year1Spend));
    setText("kpiSWR",           pct(swr));
    setText("kpiSurplus",       end >= 0 ? ("Surplus " + money(end)) : ("Shortfall " + money(Math.abs(end))));
    setText("kpiReq",           money(gap));
    setText("lifeAgeEcho",      String(inputs.lifeAge));
    setText("freedomEcho",      String(inputs.freedomAge));

    // Compare section
    setText("kpiAnnual",        money(annualToday));
    setText("kpi40x",           money(rule40));

    // Status badge + summary
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

    var band = (!isFinite(swr)) ? "—" : (swr <= 0.05 ? "conservative" : (swr <= 0.06 ? "reasonable" : "aggressive"));
    var narrative =
      "At age " + inputs.freedomAge + ", corpus is " + money(first.startCorpus) + ". " +
      "Year-1 spend is " + money(year1Spend) + " → withdrawal rate " + pct(swr) + " (" + band + "). " +
      (end < -1
        ? "Add about " + money(Math.abs(end)) + " today (or increase SIP / delay retirement / trim spend)."
        : end > 1
          ? "On current settings you retain a surplus of " + money(end) + " by age " + inputs.lifeAge + "."
          : "This plan is calibrated to finish near ₹0 by age " + inputs.lifeAge + ".");
    setText("kpiNarrative", narrative);
  }

  // --------------- CSV / Share / Audit --------------
  function exportCSV(proj) {
    if (!proj || !proj.length) return;
    var header = ["Age","Regular","Planned","Total","Total+Buffer","StartCorpus","Return","EndCorpus"];
    var lines = [header.join(",")];
    proj.forEach(function (r) {
      lines.push([
        r.age,
        Math.round(r.reg),
        Math.round(r.planned),
        Math.round(r.total),
        Math.round(r.totalWithBuffer),
        Math.round(r.startCorpus),
        Math.round(r.ret),
        Math.round(r.endCorpus)
      ].join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "freedomnumber_projection.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  function encodeShareState(inputs, regs, plans) {
    var state = { i: inputs, r: regs, p: plans };
    try {
      var json = JSON.stringify(state);
      return btoa(unescape(encodeURIComponent(json))); // safe b64
    } catch (e) { return ""; }
  }
  function decodeShareState(hash) {
    try {
      var json = decodeURIComponent(escape(atob(hash)));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  function openAudit(proj, regs, plans) {
    var backdrop = $("auditBackdrop");
    if (!backdrop) return;
    backdrop.style.display = "block";

    $("auditClose").onclick = function () {
      backdrop.style.display = "none";
    };

    $("auditGo").onclick = function () {
      var age = num("auditAge");
      renderAuditForAge(age, proj, regs, plans);
    };
  }

  function renderAuditForAge(age, proj, regs, plans) {
    var row = null, i;
    for (i = 0; i < proj.length; i++) if (proj[i].age === age) { row = proj[i]; break; }
    var s = $("auditSummary"), ar = $("auditRegular"), ap = $("auditPlanned"), agg = $("auditAgg");
    if (!row) {
      if (s) s.textContent = "No data for age " + age + ".";
      if (ar) ar.textContent = "";
      if (ap) ap.textContent = "";
      if (agg) agg.textContent = "";
      return;
    }
    if (s) s.textContent =
      "Age " + age + ": Start " + money(row.startCorpus) + ", Regular " + money(row.reg) +
      ", Planned " + money(row.planned) + ", Total+Buffer " + money(row.totalWithBuffer) +
      ", Return " + money(row.ret) + ", End " + money(row.endCorpus) + ".";

    // Regular detail
    if (ar) {
      var linesR = [];
      regs.forEach(function (r) {
        if (age >= r.from && age <= r.until) {
          var yrs = Math.max(0, age - r.from);
          var g = (typeof r.growth === "number" ? r.growth : 0);
          var val = r.amount * Math.pow(1 + g, yrs);
          linesR.push(r.name + ": " + money(val) + "  (amt " + money(r.amount) + ", g " + pct(g) + ", from " + r.from + " to " + r.until + ")");
        }
      });
      ar.textContent = linesR.length ? linesR.join("\n") : "(none active)";
    }
    // Planned detail
    if (ap) {
      var linesP = [];
      plans.forEach(function (p) {
        if (p.event === age) {
          linesP.push(p.name + ": " + money(p.amount) + " (today) @ i " + pct(p.infl));
        }
      });
      ap.textContent = linesP.length ? linesP.join("\n") : "(none this year)";
    }
    // Aggregation / formula echo
    if (agg) {
      agg.textContent =
        "total = regular + planned\n" +
        "totalWithBuffer = total × (1 + safetyMargin)\n" +
        "return = startCorpus × rate\n" +
        "endCorpus = startCorpus + return − max(0, totalWithBuffer − retirementIncome)";
    }
  }

  // ----------------- Save / Load --------------------
  function saveState() {
    try {
      var inputs = getInputs();
      var t = getTables();
      localStorage.setItem("inputs", JSON.stringify(inputs));
      localStorage.setItem("regs", JSON.stringify(t.regs));
      localStorage.setItem("plans", JSON.stringify(t.plans));
    } catch (e) {}
  }

  function loadStateIfAny() {
    try {
      var h = location.hash.replace(/^#/, "");
      if (h) {
        var s = decodeShareState(h);
        if (s && s.i && s.r && s.p) {
          applyInputs(s.i);
          renderTablesEditable(s.r, s.p);
          return true;
        }
      }
      var iStr = localStorage.getItem("inputs");
      var rStr = localStorage.getItem("regs");
      var pStr = localStorage.getItem("plans");
      if (iStr && rStr && pStr) {
        applyInputs(JSON.parse(iStr));
        renderTablesEditable(JSON.parse(rStr), JSON.parse(pStr));
        return true;
      }
    } catch (e) {}
    return false;
  }

  function applyInputs(i) {
    function setVal(id, v) { var el = $(id); if (el) el.value = v; }
    setVal("currentAge", i.currentAge);
    setVal("freedomAge", i.freedomAge);
    setVal("lifeAge", i.lifeAge);
    setVal("currentCorpus", i.currentCorpus);
    setVal("monthlySIP", i.monthlySIP);
    setVal("annualRetirementIncome", i.annualRetirementIncome);
    setVal("ret", i.ret);
    if (typeof i.inflation === "number") setVal("inflation", i.inflation);
    if (typeof i.buffer === "number") setVal("buffer", i.buffer);
    if (typeof i.ter === "number") setVal("ter", i.ter);

    var on = $("stressOn"), off = $("stressOff");
    if (on && off) {
      if (i.stressOn) {
        on.setAttribute("aria-pressed","true");
        off.setAttribute("aria-pressed","false");
      } else {
        on.setAttribute("aria-pressed","false");
        off.setAttribute("aria-pressed","true");
      }
    }
    setText("lifeAgeEcho", String(i.lifeAge));
    setText("freedomEcho", String(i.freedomAge));
  }

  // ----------------- Recompute ----------------------
  function recompute() {
    var inputs = getInputs();
    var t = getTables();
    var proj = computeProjection(inputs, t.regs, t.plans);

    renderProjection(proj);
    renderKPIs(proj, inputs, t.regs, t.plans);

    saveState();

    // stash projection on window for export/audit without recompute
    try { window.__proj = proj; } catch (e) {}
  }

  // ------------------- Init -------------------------
  function bindInputs() {
    // Simple/Advanced mode
    var simpleBtn = $("modeSimpleBtn"), advBtn = $("modeAdvancedBtn");
    var simplePanel = $("simplePanel"), advancedPanel = $("advancedPanel");
    if (simpleBtn && advBtn && simplePanel && advancedPanel) {
      simpleBtn.addEventListener("click", function () {
        simpleBtn.classList.add("btn--primary"); simpleBtn.classList.remove("btn--secondary");
        advBtn.classList.remove("btn--primary");  advBtn.classList.add("btn--secondary");
        simplePanel.hidden = false; advancedPanel.hidden = true;
      });
      advBtn.addEventListener("click", function () {
        advBtn.classList.add("btn--primary"); advBtn.classList.remove("btn--secondary");
        simpleBtn.classList.remove("btn--primary"); simpleBtn.classList.add("btn--secondary");
        simplePanel.hidden = true; advancedPanel.hidden = false;
      });
    }

    // Non-table inputs → recompute
    qa("input").forEach(function (inp) {
      if (inp.closest && (inp.closest("#regTable") || inp.closest("#planTable"))) return;
      inp.addEventListener("input", recompute, { passive: true });
    });

    // Life expectancy quick-set
    [["life85",85],["life90",90],["life95",95]].forEach(function (pair) {
      var b = $(pair[0]);
      if (!b) return;
      b.addEventListener("click", function () {
        var life = $("lifeAge");
        if (life) life.value = pair[1];
        setText("lifeAgeEcho", String(pair[1]));
        recompute();
      });
    });

    // Stress toggle
    var on = $("stressOn"), off = $("stressOff");
    if (on && off) {
      on.addEventListener("click", function () {
        on.setAttribute("aria-pressed","true");
        off.setAttribute("aria-pressed","false");
        recompute();
      });
      off.addEventListener("click", function () {
        on.setAttribute("aria-pressed","false");
        off.setAttribute("aria-pressed","true");
        recompute();
      });
    }

    // Add Item / Event
    var addReg = $("addReg");
    if (addReg) addReg.addEventListener("click", function () {
      var t = getTables();
      var cAge = num("currentAge");
      var lAge = num("lifeAge");
      t.regs.push({ name: "New item", amount: 60000, growth: 0.06, from: cAge, until: lAge });
      renderTablesEditable(t.regs, t.plans);
      recompute();
    });
    var addPlan = $("addPlan");
    if (addPlan) addPlan.addEventListener("click", function () {
      var fAge = num("freedomAge");
      var t = getTables();
      t.plans.push({ name: "New event", event: fAge + 5, amount: 300000, infl: 0.06 });
      renderTablesEditable(t.regs, t.plans);
      recompute();
    });

    // Export / Share / Audit
    var exportBtn = $("exportBtn");
    if (exportBtn) exportBtn.addEventListener("click", function () {
      exportCSV(window.__proj || []);
    });

    var shareBtn = $("shareBtn");
    if (shareBtn) shareBtn.addEventListener("click", function () {
      var inputs = getInputs();
      var t = getTables();
      var hash = encodeShareState(inputs, t.regs, t.plans);
      if (hash) {
        var url = location.origin + location.pathname + "#" + hash;
        try {
          navigator.clipboard.writeText(url).then(function () {
            alert("Shareable link copied to clipboard!");
          }, function () {
            prompt("Copy your shareable link:", url);
          });
        } catch (e) {
          prompt("Copy your shareable link:", url);
        }
      }
    });

    var auditBtn = $("auditBtn");
    if (auditBtn) auditBtn.addEventListener("click", function () {
      openAudit(window.__proj || [], getTables().regs, getTables().plans);
    });

    // Reset / Prefill
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
  }

  function init() {
    try { console.log("[FreedomNumber] init start"); } catch (e) {}

    // Make initial tables editable (from static defaults)
    bootstrapTablesFromDOM();

    // If a saved or shared state exists, load it (overrides bootstrap)
    loadStateIfAny();

    // Bind controls
    bindInputs();

    // First compute
    recompute();

    try { console.log("[FreedomNumber] init complete"); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
