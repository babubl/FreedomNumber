/* ===========================================================
   FreedomNumber — script.js
   - Auto-compute key metrics
   - Editable tables (existing rows become inputs)
   - Add Item / Add Event supported
   - Simple, transparent calculations
   =========================================================== */

(function () {
  "use strict";

  // ---------- Shortcuts ----------
  const $  = (id)  => document.getElementById(id);
  const q  = (sel) => document.querySelector(sel);
  const qa = (sel) => Array.from(document.querySelectorAll(sel));

  const num = (id) => parseFloat($(id)?.value || "0") || 0;
  const money = (n) =>
    isNaN(n) ? "—" : `₹ ${Math.round(n).toLocaleString("en-IN")}`;
  const pct = (x, d=2) => isNaN(x) ? "—" : `${(x*100).toFixed(d)}%`;

  // ---------- Table: render editable rows ----------
  function renderTablesEditable(regs, plans) {
    const regBody  = q("#regTable tbody");
    const planBody = q("#planTable tbody");
    regBody.innerHTML = "";
    planBody.innerHTML = "";

    // Regular expenses rows
    regs.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" value="${escapeHtml(r.name)}" data-field="name" /></td>
        <td class="num"><input type="number" step="1" value="${+r.amount || 0}" data-field="amount" /></td>
        <td class="num"><input type="number" step="0.001" value="${+r.growth || 0}" data-field="growth" /></td>
        <td class="num"><input type="number" step="1" value="${+r.tenure || 0}" data-field="tenure" /></td>
        <td class="num"><input type="number" step="1" value="${+r.start || 0}" data-field="start" /></td>
        <td class="num"><button class="btn btn--secondary" data-action="del-reg" data-idx="${idx}">Remove</button></td>
      `;
      regBody.appendChild(tr);
    });

    // Planned events rows
    plans.forEach((p, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" value="${escapeHtml(p.name)}" data-field="name" /></td>
        <td class="num"><input type="number" step="1" value="${+p.event || 0}" data-field="event" /></td>
        <td class="num"><input type="number" step="1" value="${+p.amount || 0}" data-field="amount" /></td>
        <td class="num"><input type="number" step="0.001" value="${+p.infl || 0}" data-field="infl" /></td>
        <td class="num"><button class="btn btn--secondary" data-action="del-plan" data-idx="${idx}">Remove</button></td>
      `;
      planBody.appendChild(tr);
    });

    // Recompute when any input inside tables changes
    qa("#regTable input, #planTable input").forEach(inp => {
      inp.addEventListener("input", recompute);
    });

    // Delete buttons
    regBody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action='del-reg']");
      if (!btn) return;
      const idx = +btn.getAttribute("data-idx");
      const rows = getTables().regs;
      rows.splice(idx, 1);
      renderTablesEditable(rows, getTables().plans);
      recompute();
    });

    planBody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action='del-plan']");
      if (!btn) return;
      const idx = +btn.getAttribute("data-idx");
      const obj = getTables();
      obj.plans.splice(idx, 1);
      renderTablesEditable(obj.regs, obj.plans);
      recompute();
    });
  }

  // Convert initial static DOM rows (numbers) to editable objects
  function bootstrapTablesFromDOM() {
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

    // Re-render as editable
    renderTablesEditable(regs, plans);
  }

  // Read current tables (from inputs if present, else from text)
  function getTables() {
    const regs = qa("#regTable tbody tr").map(tr => {
      const obj = {
        name:  getCellVal(tr, "[data-field='name']"),
        amount: +getCellVal(tr, "[data-field='amount']"),
        growth: +getCellVal(tr, "[data-field='growth']"),
        tenure: +getCellVal(tr, "[data-field='tenure']"),
        start:  +getCellVal(tr, "[data-field='start']"),
      };
      // fallback if not in editable mode
      if (!obj.name && tr.cells.length) {
        const td = tr.cells;
        obj.name  = (td[0]?.textContent || "").trim() || "Item";
        obj.amount = cleanNum(td[1]?.textContent || "");
        obj.growth = parseFloat(td[2]?.textContent || "0") || 0;
        obj.tenure = parseFloat(td[3]?.textContent || "0") || 0;
        obj.start  = parseFloat(td[4]?.textContent || "0") || 0;
      }
      return obj;
    });

    const plans = qa("#planTable tbody tr").map(tr => {
      const obj = {
        name:  getCellVal(tr, "[data-field='name']"),
        event: +getCellVal(tr, "[data-field='event']"),
        amount:+getCellVal(tr, "[data-field='amount']"),
        infl:  +getCellVal(tr, "[data-field='infl']"),
      };
      if (!obj.name && tr.cells.length) {
        const td = tr.cells;
        obj.name  = (td[0]?.textContent || "").trim() || "Event";
        obj.event = parseFloat(td[1]?.textContent || "0") || 0;
        obj.amount= cleanNum(td[2]?.textContent || "");
        obj.infl  = parseFloat(td[3]?.textContent || "0") || 0;
      }
      return obj;
    });

    return { regs, plans };
  }

  function getCellVal(tr, sel) {
    const el = tr.querySelector(sel);
    if (!el) return "";
    return el.type === "number" || el.type === "text" ? el.value : (el.textContent || "");
  }

  function cleanNum(str) {
    return parseFloat(String(str).replace(/[₹,\s]/g, "")) || 0;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  // ---------- Core math ----------
  function computeProjection(inputs, regs, plans) {
    const {
      currentAge, freedomAge, lifeAge,
      inflation, ret, buffer, currentCorpus,
      monthlySIP, annualRetirementIncome, ter,
      stressOn
    } = inputs;

    const rEffBase = ret - ter; // net nominal (post-tax minus TER)
    const proj = [];

    // Grow corpus to freedom age with SIPs
    let corpus = currentCorpus;
    for (let age = currentAge; age < freedomAge; age++) {
      corpus += monthlySIP * 12;
      corpus *= (1 + rEffBase);
    }

    for (let age = freedomAge; age <= lifeAge; age++) {
      // Regular at this age (respect start & tenure)
      const regSum = regs.reduce((acc, r) => {
        const active = age >= r.start && age < r.start + r.tenure;
        if (!active) return acc;
        const years = age - r.start;
        return acc + r.amount * Math.pow(1 + r.growth, years);
      }, 0);

      // Planned if event hits this age
      const planSum = plans.reduce((acc, p) => {
        if (age !== p.event) return acc;
        const yrs = Math.max(0, age - currentAge);
        return acc + p.amount * Math.pow(1 + p.infl, yrs);
      }, 0);

      const total = regSum + planSum;
      const totalWithBuffer = total * (1 + buffer);

      // Effective return: stress reduces real return by 2% in first 10 post-freedom years
      let rEff = rEffBase;
      if (stressOn && age < freedomAge + 10) {
        const realReduction = 0.02;
        const real = (1 + rEffBase) / (1 + inflation) - 1;
        rEff = (1 + (real - realReduction)) * (1 + inflation) - 1;
      }

      const retAmt = corpus * rEff;
      const spendAfterIncome = Math.max(0, totalWithBuffer - annualRetirementIncome); // policy: income after buffer
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

  // Compute “annual spend today” = regular at currentAge (planned only if event == currentAge)
  function computeAnnualToday(regs, plans, currentAge) {
    const regSum = regs.reduce((acc, r) => {
      const active = currentAge >= r.start && currentAge < r.start + r.tenure;
      if (!active) return acc;
      const yrs = currentAge - r.start;
      return acc + r.amount * Math.pow(1 + r.growth, yrs);
    }, 0);

    const planToday = plans.reduce((acc, p) => {
      if (p.event !== currentAge) return acc;
      // if event is literally this year, inflate from today by 0 years
      return acc + p.amount;
    }, 0);

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
    const first = proj[0];                     // first retirement year (at freedom age)
    const last  = proj[proj.length - 1];

    const annualToday = computeAnnualToday(regs, plans, inputs.currentAge);
    const rule40 = annualToday * 40;

    // Year-1 Spend @ Freedom (incl. buffer & income)
    const year1Spend = Math.max(0, first.totalWithBuffer - inputs.annualRetirementIncome);

    // Implied withdrawal rate
    const swr = first.startCorpus > 0 ? year1Spend / first.startCorpus : NaN;

    // Max starting corpus seen during plan
    const maxCorpus = Math.max(...proj.map(r => r.startCorpus));

    // Surplus/shortfall at life
    const end = last.endCorpus;

    // Additional lump sum needed today (simple gap view)
    const gap = end < 0 ? Math.abs(end) : 0;

    // Fill values
    setText("kpiAnnual", money(annualToday));
    setText("kpi40x", money(rule40));
    setText("kpiCorpusFreedom", money(first.startCorpus));
    setText("kpiSWR", pct(swr));
    setText("kpiSpendYear1", money(year1Spend)); // if present in your HTML
    setText("kpiMax", money(maxCorpus));
    setText("rowCount", String(proj.length));
    setText("lifeAgeEcho", String(inputs.lifeAge));
    setText("freedomEcho", String(inputs.freedomAge));

    // Surplus/Shortfall card colouring + value
    const wrap = $("#kpiSurplusWrap");
    if (wrap) {
      wrap.classList.remove("kpi--surplus", "kpi--shortfall");
      if (end > 1) wrap.classList.add("kpi--surplus");
      else if (end < -1) wrap.classList.add("kpi--shortfall");
    }
    setText("kpiSurplus", end >= 0 ? `Surplus ${money(end)}` : `Shortfall ${money(Math.abs(end))}`);

    // Required lump sum
    setText("kpiReq", money(gap));

    // Badge + Summary banner
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

    // Narrative (plain-English)
    const band =
      isFinite(swr) && !isNaN(swr) ? (swr <= 0.04 ? "conservative" : (swr <= 0.06 ? "reasonable" : "aggressive")) : "—";

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

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  // ---------- Recompute pipeline ----------
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
      stressOn: q("#stressOn")?.getAttribute("aria-pressed") === "true",
    };

    const { regs, plans } = getTables();

    const proj = computeProjection(inputs, regs, plans);
    renderProjection(proj);
    renderKPIs(proj, inputs, regs, plans);

    localStorage.setItem("inputs", JSON.stringify(inputs));
    localStorage.setItem("regs", JSON.stringify(regs));
    localStorage.setItem("plans", JSON.stringify(plans));
  }

  // ---------- Event bindings ----------
  function init() {
    // Turn current static rows into editable inputs
    bootstrapTablesFromDOM();

    // Inputs: recompute on change
    qa("input").forEach(inp => inp.addEventListener("input", recompute));

    // Stress toggle UI
    const on  = $("#stressOn");
    const off = $("#stressOff");
    if (on && off) {
      [on, off].forEach(b => b.addEventListener("click", (e) => {
        on.setAttribute("aria-pressed", (e.target === on).toString());
        off.setAttribute("aria-pressed", (e.target === off ? "false" : "true"));
        // Fix for boolean strings
        if (e.target === on) { on.setAttribute("aria-pressed","true"); off.setAttribute("aria-pressed","false"); }
        else { on.setAttribute("aria-pressed","false"); off.setAttribute("aria-pressed","true"); }
        recompute();
      }));
    }

    // Longevity presets
    [["life85",85],["life90",90],["life95",95]].forEach(([id,val])=>{
      const b = $("#"+id);
      if (b) b.addEventListener("click", ()=>{
        $("#lifeAge").value = val;
        setText("lifeAgeEcho", String(val));
        recompute();
      });
    });

    // Add Item / Event
    const addReg  = $("#addReg");
    const addPlan = $("#addPlan");
    if (addReg) addReg.addEventListener("click", () => {
      const t = getTables();
      t.regs.push({ name:"New Item", amount:60000, growth:0.06, tenure:30, start: num("currentAge") });
      renderTablesEditable(t.regs, t.plans);
      recompute();
    });
    if (addPlan) addPlan.addEventListener("click", () => {
      const t = getTables();
      t.plans.push({ name:"New Event", event: num("freedomAge")+5, amount:300000, infl:0.06 });
      renderTablesEditable(t.regs, t.plans);
      recompute();
    });

    // Reset to defaults (reload page)
    $("#resetBtn")?.addEventListener("click", () => { localStorage.clear(); location.reload(); });

    // “Prefill India” (simple: clear saved state & reload to initial defaults in HTML)
    $("#loadIndicative")?.addEventListener("click", () => { localStorage.clear(); location.reload(); });

    // First compute
    recompute();
  }

  document.addEventListener("DOMContentLoaded", init);

})();
