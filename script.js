/* ===========================================================
   FreedomNumber — script.js (robust init + button fixes)
   - Binds even if DOMContentLoaded already fired
   - Add Item / Add Event work and stay editable
   - Stress toggle + longevity presets fixed
   - Live KPIs + table recompute on any change
   =========================================================== */

(function () {
  "use strict";

  // Marker logs (check DevTools console)
  try { console.log("[FreedomNumber] script loaded"); } catch {}

  // ---------- Helpers ----------
  const $  = (id)  => document.getElementById(id);
  const q  = (sel) => document.querySelector(sel);
  const qa = (sel) => Array.from(document.querySelectorAll(sel));

  const num = (id) => parseFloat($(id)?.value || "0") || 0;
  const cleanNum = (str) => parseFloat(String(str).replace(/[₹,\s]/g, "")) || 0;
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  const money = (n) => (isNaN(n) ? "—" : `₹ ${Math.round(n).toLocaleString("en-IN")}`);
  const pct   = (x, d=2) => (isNaN(x) ? "—" : `${(x*100).toFixed(d)}%`);
  const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };

  // ---------- Tables: read current state ----------
  function getTables() {
    const regs = qa("#regTable tbody tr").map(tr => {
      const td = tr.querySelectorAll("td");
      return {
        name:  tr.querySelector("input[data-field='name']")?.value ?? (td[0]?.textContent.trim() || "Item"),
        amount:+(tr.querySelector("input[data-field='amount']")?.value ?? cleanNum(td[1]?.textContent || "")),
        growth:+(tr.querySelector("input[data-field='growth']")?.value ?? parseFloat(td[2]?.textContent || "0") || 0),
        tenure:+(tr.querySelector("input[data-field='tenure']")?.value ?? parseFloat(td[3]?.textContent || "0") || 0),
        start: +(tr.querySelector("input[data-field='start']")?.value ?? parseFloat(td[4]?.textContent || "0") || 0),
      };
    });

    const plans = qa("#planTable tbody tr").map(tr => {
      const td = tr.querySelectorAll("td");
      return {
        name:  tr.querySelector("input[data-field='name']")?.value ?? (td[0]?.textContent.trim() || "Event"),
        event: +(tr.querySelector("input[data-field='event']")?.value ?? parseFloat(td[1]?.textContent || "0") || 0),
        amount:+(tr.querySelector("input[data-field='amount']")?.value ?? cleanNum(td[2]?.textContent || "")),
        infl:  +(tr.querySelector("input[data-field='infl']")?.value ?? parseFloat(td[3]?.textContent || "0") || 0),
      };
    });

    return { regs, plans };
  }

  // ---------- Tables: render as editable ----------
  function renderTablesEditable(regs, plans) {
    const regBody  = q("#regTable tbody");
    const planBody = q("#planTable tbody");
    if (!regBody || !planBody) {
      console.warn("[FreedomNumber] regTable/planTable tbody not found.");
      return;
    }

    regBody.innerHTML = "";
    regs.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" value="${escapeHtml(r.name)}" data-field="name" /></td>
        <td class="num"><input type="number" step="1" value="${+r.amount || 0}" data-field="amount" /></td>
        <td class="num"><input type="number" step="0.001" value="${+r.growth || 0}" data-field="growth" /></td>
        <td class="num"><input type="number" step="1" value="${+r.tenure || 0}" data-field="tenure" /></td>
        <td class="num"><input type="number" step="1" value="${+r.start || 0}" data-field="start" /></td>
        <td class="num"><button type="button" class="btn btn--secondary" data-action="del-reg" data-idx="${idx}">Remove</button></td>
      `;
      regBody.appendChild(tr);
    });

    planBody.innerHTML = "";
    plans.forEach((p, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" value="${escapeHtml(p.name)}" data-field="name" /></td>
        <td class="num"><input type="number" step="1" value="${+p.event || 0}" data-field="event" /></td>
        <td class="num"><input type="number" step="1" value="${+p.amount || 0}" data-field="amount" /></td>
        <td class="num"><input type="number" step="0.001" value="${+p.infl || 0}" data-field="infl" /></td>
        <td class="num"><button type="button" class="btn btn--secondary" data-action="del-plan" data-idx="${idx}">Remove</button></td>
      `;
      planBody.appendChild(tr);
    });

    // Recompute on edits
    qa("#regTable input, #planTable input").forEach(inp => {
      inp.addEventListener("input", recompute, { passive: true });
    });

    // Delegate deletes
    regBody.onclick = (e) => {
      const btn = e.target.closest("button[data-action='del-reg']");
      if (!btn) return;
      const idx = +btn.dataset.idx;
      const state = getTables();
      state.regs.splice(idx, 1);
      renderTablesEditable(state.regs, state.plans);
      recompute();
    };
    planBody.onclick = (e) => {
      const btn = e.target.closest("button[data-action='del-plan']");
      if (!btn) return;
      const idx = +btn.dataset.idx;
      const state = getTables();
      state.plans.splice(idx, 1);
      renderTablesEditable(state.regs, state.plans);
      recompute();
    };
  }

  // ---------- Bootstrap: convert default static rows to inputs ----------
  function bootstrapTablesFromDOM() {
    const alreadyEditable = !!q("#regTable tbody input") || !!q("#planTable tbody input");
    if (alreadyEditable) return;

    const regs = [];
    qa("#regTable tbody tr").forEach(tr => {
      const td = tr.querySelectorAll("td");
      if (td.length < 5) return;
      regs.push({
        name:  td[0].textContent.trim() || "Item",
        amount: cleanNum(td[1].textContent),
        growth: parseFloat(td[2].textContent) || 0,
        tenure: parseFloat(td[3].textContent) || 0,
        start:  parseFloat(td[4].textContent) || 0,
      });
    });

    const plans = [];
    qa("#planTable tbody tr").forEach(tr => {
      const td = tr.querySelectorAll("td");
      if (td.length < 4) return;
      plans.push({
        name:  td[0].textContent.trim() || "Event",
        event: parseFloat(td[1].textContent) || 0,
        amount: cleanNum(td[2].textContent),
        infl:  parseFloat(td[3].textContent) || 0,
      });
    });

    renderTablesEditable(regs, plans);
  }

  // ---------- Projection math ----------
  function computeProjection(inputs, regs, plans) {
    const {
      currentAge, freedomAge, lifeAge,
      inflation, ret, buffer, currentCorpus,
      monthlySIP, annualRetirementIncome, ter, stressOn
    } = inputs;

    const rEffBase = ret - ter; // nominal net (post-tax minus TER)
    const proj = [];
    let corpus = currentCorpus;

    // Pre-freedom growth with SIPs
    for (let age = currentAge; age < freedomAge; age++) {
      corpus += monthlySIP * 12;
      corpus *= 1 + rEffBase;
    }

    for (let age = freedomAge; age <= lifeAge; age++) {
      // Regular
      const regSum = regs.reduce((s, r) => {
        const active = age >= r.start && age < r.start + r.tenure;
        if (!active) return s;
        return s + r.amount * Math.pow(1 + r.growth, age - r.start);
      }, 0);

      // Planned
      const planSum = plans.reduce((s, p) => {
        if (age !== p.event) return s;
        const yrs = Math.max(0, age - currentAge);
        return s + p.amount * Math.pow(1 + p.infl, yrs);
      }, 0);

      const total = regSum + planSum;
      const totalWithBuffer = total * (1 + buffer);

      // Stress: reduce real return by 2% in first 10 post-freedom years
      let rEff = rEffBase;
      if (stressOn && age < freedomAge + 10) {
        const real = (1 + rEffBase) / (1 + inflation) - 1;
        const stressedReal = real - 0.02;
        rEff = (1 + stressedReal) * (1 + inflation) - 1;
      }

      const retAmt = corpus * rEff;
      const spendAfterIncome = Math.max(0, totalWithBuffer - annualRetirementIncome); // income deducted after buffer
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

  // Annual spend today = regular at currentAge (+ planned only if event is this year)
  function computeAnnualToday(regs, plans, currentAge) {
    const regSum = regs.reduce((a, r) => {
      const active = currentAge >= r.start && currentAge < r.start + r.tenure;
      if (!active) return a;
      return a + r.amount * Math.pow(1 + r.growth, currentAge - r.start);
    }, 0);
    const planToday = plans.reduce((a, p) => a + (p.event === currentAge ? p.amount : 0), 0);
    return regSum + planToday;
  }

  // ---------- Rendering ----------
  function renderProjection(proj) {
    const tbody = q("#projTable tbody");
    if (!tbody) return;
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

  function renderKPIs(proj, inputs, regs, plans) {
    if (!proj.length) return;

    const first = proj[0];
    const last  = proj[proj.length - 1];

    const annualToday = computeAnnualToday(regs, plans, inputs.currentAge);
    const rule40      = annualToday * 40;
    const year1Spend  = Math.max(0, first.totalWithBuffer - inputs.annualRetirementIncome);
    const swr         = first.startCorpus > 0 ? year1Spend / first.startCorpus : NaN;
    const maxCorpus   = Math.max(...proj.map(r => r.startCorpus));
    const end         = last.endCorpus;
    const gap         = end < 0 ? Math.abs(end) : 0;

    setText("kpiAnnual",        money(annualToday));
    setText("kpi40x",           money(rule40));
    setText("kpiCorpusFreedom", money(first.startCorpus));
    setText("kpiSpendYear1",    money(year1Spend));
    setText("kpiSWR",           pct(swr));
    setText("kpiMax",           money(maxCorpus));
    setText("rowCount",         String(proj.length));
    setText("lifeAgeEcho",      String(inputs.lifeAge));
    setText("freedomEcho",      String(inputs.freedomAge));

    const wrap = $("#kpiSurplusWrap");
    if (wrap) {
      wrap.classList.remove("kpi--surplus", "kpi--shortfall");
      if (end > 1) wrap.classList.add("kpi--surplus");
      else if (end < -1) wrap.classList.add("kpi--shortfall");
    }
    setText("kpiSurplus", end >= 0 ? `Surplus ${money(end)}` : `Shortfall ${money(Math.abs(end))}`);
    setText("kpiReq", money(gap));

    const badge = $("#kpiStatus");
    const banner = $("#summaryBanner");
    if (badge) badge.classList.remove("badge--ok", "badge--risk", "badge--neutral");

    if (end > 1) {
      badge && badge.classList.add("badge--ok");
      if (badge) badge.textContent = "Surplus";
      if (banner) banner.textContent = `You’re projected to finish with a surplus of ${money(end)} at age ${inputs.lifeAge}.`;
    } else if (end < -1) {
      badge && badge.classList.add("badge--risk");
      if (badge) badge.textContent = "Shortfall";
      if (banner) banner.textContent = `Projected shortfall of ${money(Math.abs(end))} by age ${inputs.lifeAge}.`;
    } else {
      badge && badge.classList.add("badge--neutral");
      if (badge) badge.textContent = "Balanced";
      if (banner) banner.textContent = `Your plan balances near ₹0 at age ${inputs.lifeAge}.`;
    }

    const band = !isFinite(swr) ? "—" : (swr <= 0.04 ? "conservative" : (swr <= 0.06 ? "reasonable" : "aggressive"));
    const narrative =
      `At age ${inputs.freedomAge}, corpus is ${money(first.startCorpus)}. ` +
      `Year-1 spend is ${money(year1Spend)} → SWR ${pct(swr)} (${band}). ` +
      (end < -1
        ? `Add about ${money(Math.abs(end))} today (or adjust SIP/age/spend).`
        : end > 1
          ? `On current settings you retain a surplus of ${money(end)} by age ${inputs.lifeAge}.`
          : `This plan is calibrated to finish near ₹0 by age ${inputs.lifeAge}.`);
    setText("kpiNarrative", narrative);
  }

  // ---------- Recompute ----------
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
      stressOn: $("#stressOn")?.getAttribute("aria-pressed") === "true",
    };

    const { regs, plans } = getTables();
    const proj = computeProjection(inputs, regs, plans);

    renderProjection(proj);
    renderKPIs(proj, inputs, regs, plans);

    try {
      localStorage.setItem("inputs", JSON.stringify(inputs));
      localStorage.setItem("regs", JSON.stringify(regs));
      localStorage.setItem("plans", JSON.stringify(plans));
    } catch {}
  }

  // ---------- Init (robust) ----------
  function init() {
    try { console.log("[FreedomNumber] init start"); } catch {}

    // 1) Convert default static rows to editable inputs (once)
    bootstrapTablesFromDOM();

    // 2) Non-table inputs: recompute on change
    //    (bind to ALL inputs, not just under #calc — this was the main issue)
    qa("input").forEach(inp => {
      if (inp.closest("#regTable") || inp.closest("#planTable")) return; // tables bind separately
      inp.addEventListener("input", recompute, { passive: true });
    });

    // 3) Stress toggle
    const on  = $("#stressOn");
    const off = $("#stressOff");
    if (on && off) {
      on.addEventListener("click", () => {
        on.setAttribute("aria-pressed", "true");
        off.setAttribute("aria-pressed", "false");
        recompute();
      });
      off.addEventListener("click", () => {
        on.setAttribute("aria-pressed", "false");
        off.setAttribute("aria-pressed", "true");
        recompute();
      });
    }

    // 4) Longevity presets
    [["life85",85],["life90",90],["life95",95]].forEach(([id,val])=>{
      const b = $("#"+id);
      if (!b) return;
      b.addEventListener("click", ()=>{
        const life = $("#lifeAge");
        if (life) life.value = val;
        setText("lifeAgeEcho", String(val));
        recompute();
      });
    });

    // 5) Add Item / Add Event
    const addReg = $("#addReg");
    if (addReg) addReg.addEventListener("click", () => {
      const state = getTables();
      state.regs.push({ name: "New Item", amount: 60000, growth: 0.06, tenure: 30, start: num("currentAge") });
      renderTablesEditable(state.regs, state.plans);
      recompute();
    });

    const addPlan = $("#addPlan");
    if (addPlan) addPlan.addEventListener("click", () => {
      const state = getTables();
      state.plans.push({ name: "New Event", event: num("freedomAge") + 5, amount: 300000, infl: 0.06 });
      renderTablesEditable(state.regs, state.plans);
      recompute();
    });

    // 6) Reset / Prefill
    $("#resetBtn")?.addEventListener("click", () => { try { localStorage.clear(); } catch {} location.reload(); });
    $("#loadIndicative")?.addEventListener("click", () => { try { localStorage.clear(); } catch {} location.reload(); });

    // 7) First compute
    recompute();

    try { console.log("[FreedomNumber] init complete"); } catch {}
  }

  // Run now if DOM is ready; otherwise wait for DOMContentLoaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
