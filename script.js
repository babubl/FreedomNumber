/* ===========================================================
   FreedomNumber – script.js  (final)
   =========================================================== */

(function () {
  "use strict";

  // ---------- Helpers ----------
  const fmt = n =>
    isNaN(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const getNum = id => parseFloat(document.getElementById(id).value) || 0;

  const el = sel => document.querySelector(sel);
  const els = sel => document.querySelectorAll(sel);

  const setText = (id, val) => {
    const e = document.getElementById(id);
    if (e) e.textContent = val;
  };

  // ---------- Core Calculation ----------
  function computeProjection(inputs, regs, plans) {
    const {
      currentAge,
      freedomAge,
      lifeAge,
      inflation,
      ret,
      buffer,
      currentCorpus,
      monthlySIP,
      annualRetirementIncome,
      ter,
      stressOn,
    } = inputs;

    const rEffBase = ret - ter;
    const proj = [];
    const nYears = lifeAge - currentAge;
    let corpus = currentCorpus;

    // Grow SIPs till freedom
    const yearsToFreedom = Math.max(0, freedomAge - currentAge);
    for (let y = 0; y < yearsToFreedom; y++) {
      corpus += monthlySIP * 12;
      corpus *= 1 + rEffBase;
    }

    for (let age = freedomAge; age <= lifeAge; age++) {
      const yearIndex = age - currentAge;
      const regSum = regs
        .map(r => {
          const ageDiff = age - r.start;
          if (age < r.start || ageDiff >= r.tenure) return 0;
          return r.amount * Math.pow(1 + r.growth, ageDiff);
        })
        .reduce((a, b) => a + b, 0);

      const planSum = plans
        .map(p => (age === p.event ? p.amount * Math.pow(1 + p.infl, age - currentAge) : 0))
        .reduce((a, b) => a + b, 0);

      const total = regSum + planSum;
      const totalWithBuffer = total * (1 + buffer);

      // Apply stress if active and within 10 yrs post-freedom
      let rEff = rEffBase;
      if (stressOn && age < freedomAge + 10) {
        // approximate -2% real -> reduce nominal by inflation*0.02 (simple)
        const realReduction = 0.02;
        rEff = (1 + rEffBase) / (1 + inflation) - 1 - realReduction;
        rEff += inflation; // convert back to nominal
      }

      const retAmt = corpus * rEff;
      // Offset retirement income AFTER buffer (policy)
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
        endCorpus,
      });

      corpus = endCorpus;
    }

    return proj;
  }

  // ---------- DOM Rendering ----------
  function renderProjection(proj) {
    const tbody = document.querySelector("#projTable tbody");
    tbody.innerHTML = "";
    proj.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.age}</td>
        <td class="num">₹ ${fmt(r.reg)}</td>
        <td class="num">₹ ${fmt(r.planned)}</td>
        <td class="num">₹ ${fmt(r.total)}</td>
        <td class="num">₹ ${fmt(r.totalWithBuffer)}</td>
        <td class="num">₹ ${fmt(r.startCorpus)}</td>
        <td class="num">₹ ${fmt(r.ret)}</td>
        <td class="num">₹ ${fmt(r.endCorpus)}</td>`;
      tbody.appendChild(tr);
    });
  }

  // ---------- KPI Computation ----------
  function computeKPIs(proj, inputs) {
    if (!proj.length) return;
    const first = proj[0];
    const last = proj[proj.length - 1];

    const annualSpend = first.total;
    const rule40 = annualSpend * 40;
    const impliedSWR = (first.totalWithBuffer / first.startCorpus) || 0;
    const maxCorpus = Math.max(...proj.map(r => r.startCorpus));
    const shortfall = last.endCorpus;

    setText("kpiAnnual", `₹ ${fmt(annualSpend)}`);
    setText("kpi40x", `₹ ${fmt(rule40)}`);
    setText("kpiMax", `₹ ${fmt(maxCorpus)}`);
    setText("kpiSWR", `${(impliedSWR * 100).toFixed(2)}%`);
    setText("rowCount", proj.length);

    // Surplus/Shortfall
    const surplusEl = el("#kpiSurplusWrap");
    if (shortfall > 0) {
      surplusEl.classList.add("kpi--surplus");
      surplusEl.classList.remove("kpi--shortfall");
      setText("kpiSurplus", `Surplus ₹ ${fmt(shortfall)}`);
    } else if (shortfall < 0) {
      surplusEl.classList.add("kpi--shortfall");
      surplusEl.classList.remove("kpi--surplus");
      setText("kpiSurplus", `Shortfall ₹ ${fmt(Math.abs(shortfall))}`);
    } else {
      surplusEl.classList.remove("kpi--shortfall", "kpi--surplus");
      setText("kpiSurplus", "Balanced (₹0)");
    }

    // Required Extra (lump sum) = shortfall < 0 ? abs(shortfall) : 0
    const extraNeeded = shortfall < 0 ? Math.abs(shortfall) : 0;
    setText("kpiReq", `₹ ${fmt(extraNeeded)}`);
  }

  // ---------- Prefill India Defaults ----------
  function prefillDefaults() {
    const regs = [
      { name: "Household", amount: 600000, growth: 0.06, tenure: 45, start: 40 },
      { name: "Healthcare", amount: 100000, growth: 0.08, tenure: 45, start: 40 },
      { name: "Travel", amount: 80000, growth: 0.05, tenure: 45, start: 40 },
    ];
    const plans = [
      { name: "Child Education", event: 50, amount: 1000000, infl: 0.06 },
      { name: "House Renovation", event: 60, amount: 800000, infl: 0.05 },
    ];
    saveTables(regs, plans);
    renderTables(regs, plans);
  }

  // ---------- Table Utilities ----------
  function getTables() {
    const regRows = [...document.querySelectorAll("#regTable tbody tr")].map(tr => {
      const tds = tr.querySelectorAll("td");
      return {
        name: tds[0]?.textContent || "Item",
        amount: parseFloat(tds[1]?.querySelector("input")?.value || tds[1]?.textContent) || 0,
        growth: parseFloat(tds[2]?.querySelector("input")?.value || tds[2]?.textContent) || 0,
        tenure: parseFloat(tds[3]?.querySelector("input")?.value || tds[3]?.textContent) || 0,
        start: parseFloat(tds[4]?.querySelector("input")?.value || tds[4]?.textContent) || 0,
      };
    });
    const planRows = [...document.querySelectorAll("#planTable tbody tr")].map(tr => {
      const tds = tr.querySelectorAll("td");
      return {
        name: tds[0]?.textContent || "Event",
        event: parseFloat(tds[1]?.querySelector("input")?.value || tds[1]?.textContent) || 0,
        amount: parseFloat(tds[2]?.querySelector("input")?.value || tds[2]?.textContent) || 0,
        infl: parseFloat(tds[3]?.querySelector("input")?.value || tds[3]?.textContent) || 0,
      };
    });
    return { regs: regRows, plans: planRows };
  }

  function renderTables(regs, plans) {
    const regBody = document.querySelector("#regTable tbody");
    const planBody = document.querySelector("#planTable tbody");
    regBody.innerHTML = "";
    planBody.innerHTML = "";

    regs.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.name}</td>
        <td class="num">${fmt(r.amount)}</td>
        <td class="num">${r.growth}</td>
        <td class="num">${r.tenure}</td>
        <td class="num">${r.start}</td>
        <td></td>`;
      regBody.appendChild(tr);
    });
    plans.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${p.name}</td>
        <td class="num">${p.event}</td>
        <td class="num">${fmt(p.amount)}</td>
        <td class="num">${p.infl}</td>
        <td></td>`;
      planBody.appendChild(tr);
    });
  }

  function saveTables(regs, plans) {
    localStorage.setItem("regs", JSON.stringify(regs));
    localStorage.setItem("plans", JSON.stringify(plans));
  }

  // ---------- Main Compute ----------
  function recompute() {
    const inputs = {
      currentAge: getNum("currentAge"),
      freedomAge: getNum("freedomAge"),
      lifeAge: getNum("lifeAge"),
      inflation: getNum("inflation"),
      ret: getNum("ret"),
      buffer: getNum("buffer"),
      currentCorpus: getNum("currentCorpus"),
      monthlySIP: getNum("monthlySIP"),
      annualRetirementIncome: getNum("annualRetirementIncome"),
      ter: getNum("ter"),
      stressOn: el("#stressOn")?.getAttribute("aria-pressed") === "true",
    };

    const { regs, plans } = getTables();
    const proj = computeProjection(inputs, regs, plans);
    renderProjection(proj);
    computeKPIs(proj, inputs);
    localStorage.setItem("inputs", JSON.stringify(inputs));
  }

  // ---------- Event Binding ----------
  function init() {
    // Prefill on first load
    const storedInputs = localStorage.getItem("inputs");
    if (!storedInputs && !location.search.includes("?s=")) prefillDefaults();

    // compute on load
    recompute();

    // Hook up Prefill & Reset
    el("#loadIndicative").onclick = () => { prefillDefaults(); recompute(); };
    el("#resetBtn").onclick = () => { localStorage.clear(); location.reload(); };

    // Stress toggle
    const stressOn = el("#stressOn");
    const stressOff = el("#stressOff");
    [stressOn, stressOff].forEach(btn =>
      btn.addEventListener("click", e => {
        stressOn.setAttribute("aria-pressed", e.target === stressOn);
        stressOff.setAttribute("aria-pressed", e.target === stressOff);
        recompute();
      })
    );

    // Longevity presets
    [["life85", 85], ["life90", 90], ["life95", 95]].forEach(([id, val]) => {
      el(`#${id}`).addEventListener("click", () => {
        el("#lifeAge").value = val;
        el("#lifeAgeEcho").textContent = val;
        recompute();
      });
    });

    // Input change triggers
    els("input").forEach(inp => inp.addEventListener("change", recompute));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
