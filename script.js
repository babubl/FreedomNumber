/* ===========================================================
   FreedomNumber – script.js (v7 – KPI presentation polish)
   NOTE: This file assumes your existing compute + table logic.
   It updates KPI rendering to improve clarity & narrative.
   =========================================================== */

(function () {
  "use strict";

  // ---- Helpers ----
  const fmt = n =>
    isNaN(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const money = n => (isNaN(n) ? "—" : `₹ ${fmt(Math.round(n))}`);
  const pct = x => (isNaN(x) ? "—" : `${(x * 100).toFixed(2)}%`);

  const $ = id => document.getElementById(id);
  const q = sel => document.querySelector(sel);
  const qa = sel => document.querySelectorAll(sel);
  const num = id => parseFloat($(id)?.value || "0") || 0;

  // ---- Core calculation (existing approach) ----
  // Uses current corpus and SIP growth to freedom age, then projects to life age with buffer & offsets.
  function computeProjection(inputs, regs, plans) {
    const {
      currentAge, freedomAge, lifeAge,
      inflation, ret, buffer, currentCorpus,
      monthlySIP, annualRetirementIncome, ter, stressOn
    } = inputs;

    const rEffBase = ret - ter;
    const proj = [];
    let corpus = currentCorpus;

    // Grow to freedom age with SIP contributions (start-of-year contrib + growth)
    for (let age = inputs.currentAge; age < freedomAge; age++) {
      corpus += monthlySIP * 12;
      corpus *= 1 + rEffBase;
    }

    for (let age = freedomAge; age <= lifeAge; age++) {
      // regular
      const regSum = regs.reduce((s, r) => {
        const active = age >= r.start && age < r.start + r.tenure;
        if (!active) return s;
        return s + r.amount * Math.pow(1 + r.growth, age - r.start);
      }, 0);

      // planned
      const planSum = plans.reduce((s, p) => {
        if (age !== p.event) return s;
        const yrs = Math.max(0, age - inputs.currentAge);
        return s + p.amount * Math.pow(1 + p.infl, yrs);
      }, 0);

      const total = regSum + planSum;
      const totalWithBuffer = total * (1 + buffer);

      // effective nominal rate (stress = −2% real in first 10 post-freedom years)
      let rEff = rEffBase;
      if (stressOn && age < freedomAge + 10) {
        const realReduction = 0.02;
        const real = (1 + rEffBase) / (1 + inflation) - 1;
        rEff = (1 + (real - realReduction)) * (1 + inflation) - 1;
      }

      const retAmt = corpus * rEff;

      // policy: deduct retirement income AFTER buffer (floor at 0)
      const spendAfterIncome = Math.max(0, totalWithBuffer - annualRetirementIncome);

      const endCorpus = corpus + retAmt - spendAfterIncome;

      proj.push({
        age,
        reg: regSum,
        planned: planSum,
        total,
        totalWithBuffer,
        startCorpus: corpus,
        ret: retAmt,
        endCorpus
      });

      corpus = endCorpus;
    }

    return proj;
  }

  // ---- Tables (read-only capture; keep your existing renderers) ----
  function getTables() {
    const regs = [...qa("#regTable tbody tr")].map(tr => {
      const td = tr.querySelectorAll("td");
      return {
        name: (td[0]?.textContent || "").trim(),
        amount: parseFloat((td[1]?.textContent || "").replace(/[₹,\s]/g, "")) || 0,
        growth: parseFloat(td[2]?.textContent || "0") || 0,
        tenure: parseFloat(td[3]?.textContent || "0") || 0,
        start: parseFloat(td[4]?.textContent || "0") || 0
      };
    });
    const plans = [...qa("#planTable tbody tr")].map(tr => {
      const td = tr.querySelectorAll("td");
      return {
        name: (td[0]?.textContent || "").trim(),
        event: parseFloat(td[1]?.textContent || "0") || 0,
        amount: parseFloat((td[2]?.textContent || "").replace(/[₹,\s]/g, "")) || 0,
        infl: parseFloat(td[3]?.textContent || "0") || 0
      };
    });
    return { regs, plans };
  }

  // ---- Projection table (keep your existing renderer) ----
  function renderProjection(proj) {
    const tbody = q("#projTable tbody");
    tbody.innerHTML = "";
    proj.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.age}</td>
        <td class="num">${money(r.reg)}</td>
        <td class="num">${money(r.planned)}</td>
        <td class="num">${money(r.total)}</td>
        <td class="num">${money(r.totalWithBuffer)}</td>
        <td class="num">${money(r.startCorpus)}</td>
        <td class="num">${money(r.ret)}</td>
        <td class="num">${money(r.endCorpus)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ---- KPIs + Narrative ----
  function renderKPIs(proj, inputs) {
    if (!proj.length) return;

    const first = proj[0];
    const last = proj[proj.length - 1];

    // Basic metrics
    const annualSpend = first.total;                 // active spend today (at freedom age this equals first.total)
    const rule40 = annualSpend * 40;
    const impliedSWR = first.startCorpus > 0 ? first.totalWithBuffer / first.startCorpus : NaN;
    const maxCorpus = Math.max(...proj.map(r => r.startCorpus));
    const surplusAtEnd = last.endCorpus;            // +ve surplus / −ve shortfall

    // Populate fields
    $("#lifeAgeEcho").textContent = inputs.lifeAge;
    $("#kpiAnnual").textContent = money(annualSpend);
    $("#kpi40x").textContent = money(rule40);
    $("#kpiCorpusFreedom").textContent = money(first.startCorpus);
    $("#kpiSWR").textContent = pct(impliedSWR);
    $("#kpiMax").textContent = money(maxCorpus);

    // Surplus/Shortfall KPI colour
    const wrap = $("#kpiSurplusWrap");
    wrap.classList.remove("kpi--surplus", "kpi--shortfall");
    if (surplusAtEnd > 1) {
      wrap.classList.add("kpi--surplus");
      $("#kpiSurplus").textContent = `Surplus ${money(surplusAtEnd)}`;
    } else if (surplusAtEnd < -1) {
      wrap.classList.add("kpi--shortfall");
      $("#kpiSurplus").textContent = `Shortfall ${money(Math.abs(surplusAtEnd))}`;
    } else {
      $("#kpiSurplus").textContent = `Balanced (₹0)`;
    }

    // Status badge
    const badge = $("#kpiStatus");
    badge.classList.remove("badge--ok", "badge--risk", "badge--neutral");
    if (surplusAtEnd > 1) {
      badge.textContent = "Surplus";
      badge.classList.add("badge--ok");
    } else if (surplusAtEnd < -1) {
      badge.textContent = "Shortfall";
      badge.classList.add("badge--risk");
    } else {
      badge.textContent = "Balanced";
      badge.classList.add("badge--neutral");
    }

    // Additional Lump Sum Needed (simple gap approximation)
    const extraNeededToday = surplusAtEnd < -1 ? Math.abs(surplusAtEnd) : 0;
    $("#kpiReq").textContent = money(extraNeededToday);

    // Narrative — one clean sentence
    const swrBand =
      isNaN(impliedSWR) ? "—" :
      impliedSWR <= 0.04 ? "conservative" :
      impliedSWR <= 0.06 ? "reasonable" : "aggressive";

    const statusWord = surplusAtEnd < -1 ? "shortfall" : (surplusAtEnd > 1 ? "surplus" : "balance");
    const summary = [
      `At age ${inputs.freedomAge}, your corpus is ${money(first.startCorpus)}.`,
      `Year-1 implied withdrawal rate is ${pct(impliedSWR)} (${swrBand}).`,
      surplusAtEnd < -1
        ? `You’re on track to run out around age ${inputs.lifeAge} with a shortfall of ${money(Math.abs(surplusAtEnd))}.`
        : surplusAtEnd > 1
          ? `You’re projected to finish with a surplus of ${money(surplusAtEnd)} at age ${inputs.lifeAge}.`
          : `Your plan balances to approximately ₹0 at age ${inputs.lifeAge}.`,
      extraNeededToday > 1
        ? `To fully fund the plan, you’d add ~${money(extraNeededToday)} today (or adjust SIP/retirement age/spend).`
        : `No additional lump sum is required under current assumptions.`
    ].join(" ");
    $("#kpiNarrative").textContent = summary;

    // Row count
    $("#rowCount").textContent = String(proj.length);
  }

  // ---- Recompute pipeline ----
  function recompute() {
    const inputs = {
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
      stressOn: q("#stressOn")?.getAttribute("aria-pressed") === "true"
    };

    const { regs, plans } = getTables();
    const proj = computeProjection(inputs, regs, plans);

    renderProjection(proj);
    renderKPIs(proj, inputs);

    // Persist inputs
    localStorage.setItem("inputs", JSON.stringify(inputs));
  }

  // ---- Init & bindings (kept simple) ----
  function init() {
    // Auto-prefill on first visit if no state or share param
    const saved = localStorage.getItem("inputs");
    if (!saved && !location.search.includes("?s=")) {
      // simple default rows if your page starts empty (already provided earlier)
      // You can keep your existing prefill routine; we just trigger recompute.
      $("#loadIndicative")?.click?.();
      // In case no handler exists, still recompute:
      setTimeout(recompute, 50);
    } else {
      // load saved values into fields if you keep that logic elsewhere
      setTimeout(recompute, 0);
    }

    // Recompute on input change
    qa("input").forEach(inp => inp.addEventListener("input", recompute));

    // Stress toggle pressed state
    const on = $("#stressOn"), off = $("#stressOff");
    [on, off].forEach(btn => btn?.addEventListener("click", e => {
      on.setAttribute("aria-pressed", e.target === on ? "true" : "false");
      off.setAttribute("aria-pressed", e.target === off ? "true" : "false");
      recompute();
    }));

    // Longevity presets
    [["life85",85],["life90",90],["life95",95]].forEach(([id,val])=>{
      const b = $("#"+id);
      b?.addEventListener("click", ()=>{
        $("#lifeAge").value = val;
        $("#lifeAgeEcho").textContent = val;
        recompute();
      });
    });

    // Export CSV (uses current rendered projection table)
    $("#exportBtn")?.addEventListener("click", ()=>{
      const rows = [["Age","Regular","Planned","Total","TotalWithBuffer","StartCorpus","Return","EndCorpus"]];
      qa("#projTable tbody tr").forEach(tr=>{
        const cells=[...tr.querySelectorAll("td")].map(td=>td.textContent.replace(/[₹,\s]/g,""));
        rows.push(cells);
      });
      const csv = rows.map(r=>r.join(",")).join("\n");
      const blob = new Blob([csv],{type:"text/csv"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "projection.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // Reset / Prefill explicit
    $("#resetBtn")?.addEventListener("click", ()=>{ localStorage.clear(); location.reload(); });
    $("#loadIndicative")?.addEventListener("click", ()=>{ localStorage.clear(); location.reload(); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
