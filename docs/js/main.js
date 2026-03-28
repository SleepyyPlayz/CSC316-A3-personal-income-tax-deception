// main.js — Orchestration: data loading, animation sequences, wiring

import { TaxCalculator } from './calculator.js';
import { BarScene } from './bar-scene.js';
import { SalaryInput } from './salary-input.js';
import { Tooltip } from './tooltip.js';
import { ScrollController } from './scroll-controller.js';

// ─── Color constants ───────────────────────────────────────────────
const C = {
  blue: '#3b82f6', blueDark: '#2563eb', blueLight: '#60a5fa',
  orange: '#f97316', orangeLight: '#fb923c', orangeDark: '#ea580c',
  red: '#ef4444', redDark: '#dc2626',
  green: '#22c55e',
  purple: '#a855f7', purpleDark: '#9333ea', purpleLight: '#c084fc',
  yellow: '#eab308',
};

// ─── Globals ───────────────────────────────────────────────────────
let taxData = {};
let tooltip;
let scrollCtrl;
const calculators = {};

// ─── Helpers ───────────────────────────────────────────────────────
function fmt(v, currency = '') {
  const abs = Math.abs(Math.round(v));
  const str = abs.toLocaleString();
  return (v < 0 ? '−' : '') + currency + str;
}

function fmtPct(v) {
  return (v * 100).toFixed(1) + '%';
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function showEl(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}

// ─── Data loading ──────────────────────────────────────────────────
async function loadData() {
  const countries = ['ontario', 'ireland', 'sweden', 'estonia', 'hungary', 'france'];
  const results = await Promise.all(
    countries.map(c => fetch(`data/${c}.json`).then(r => r.json()))
  );
  for (const d of results) {
    taxData[d.id] = d;
    calculators[d.id] = new TaxCalculator(d);
  }
  window.taxData = taxData;
}

// ─── Hero background animation ─────────────────────────────────────
function initHeroBg() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, lines;

  function resize() {
    w = canvas.width = canvas.offsetWidth;
    h = canvas.height = canvas.offsetHeight;
    lines = [];
    for (let i = 0; i < 40; i++) {
      lines.push({
        y: Math.random() * h,
        speed: 0.2 + Math.random() * 0.5,
        alpha: 0.03 + Math.random() * 0.06,
        width: 0.5 + Math.random() * 1,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const line of lines) {
      line.y += line.speed;
      if (line.y > h) line.y = -2;
      ctx.beginPath();
      ctx.moveTo(0, line.y);
      ctx.lineTo(w, line.y);
      ctx.strokeStyle = `rgba(255,255,255,${line.alpha})`;
      ctx.lineWidth = line.width;
      ctx.stroke();
    }
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  draw();
}

// ─── Scroll arrow ──────────────────────────────────────────────────
function initScrollArrow() {
  const arrow = document.getElementById('scroll-arrow');
  if (arrow) {
    arrow.addEventListener('click', () => {
      document.getElementById('intro').scrollIntoView({ behavior: 'smooth' });
    });
  }
}

// ─── Intro Animation A — Employee-Side ─────────────────────────────
async function playIntroA() {
  const vizEl = document.getElementById('intro-a-viz');
  const textEl = document.getElementById('intro-a-text');
  vizEl.innerHTML = '';
  textEl.textContent = '';

  const scene = new BarScene('#intro-a-viz', { tooltip, currency: '$' });
  const gross = 100000;

  // Step 1: Headline only
  scene.reset(gross, 'Your Gross Salary', 0);
  await delay(800);
  await scene.addSlice('income_tax', 28000, gross, C.blue, 'Income Tax (headline bracket)');
  textEl.textContent = 'If only it were that simple.';
  await delay(1500);

  // Step 2: Social contributions come first
  textEl.style.opacity = '0';
  await delay(400);
  scene.clear();
  scene.reset(gross, 'Your Gross Salary', 0);
  textEl.style.opacity = '1';
  await delay(600);
  await scene.addSlice('social', 12000, gross, C.purple, 'Social Contributions');
  await delay(300);
  await scene.addSlice('income_tax2', 25000, gross, C.blue, 'Income Tax (on reduced base)');
  textEl.textContent = 'Many countries deduct social contributions before calculating income tax — shrinking the base, but adding a new burden.';
  await delay(2000);

  // Step 3: Surtaxes
  await scene.addSlice('surtax', 4000, gross, C.orange, 'Surtax');
  textEl.textContent = 'And some jurisdictions apply surtaxes on top — calculated not on your income, but on your already-calculated tax.';
  await delay(2000);

  // Step 4: Summary comparison
  textEl.textContent = '';
  scene.clear();

  const bar1 = {
    layers: [{ id: 'it', label: 'Income Tax', amount: 28000, color: C.blue }],
    netIncome: 72000, grossSalary: gross
  };
  const bar2 = {
    layers: [
      { id: 'social', label: 'Social Contributions', amount: 12000, color: C.purple },
      { id: 'it', label: 'Income Tax', amount: 25000, color: C.blue },
      { id: 'surtax', label: 'Surtax', amount: 4000, color: C.orange },
    ],
    netIncome: 59000, grossSalary: gross
  };
  scene.showComparison(bar1, bar2, ['What the bracket table suggests', 'What actually happens']);

  textEl.innerHTML = `<strong style="color:${C.orange}">+$${(72000 - 59000).toLocaleString()} more than expected</strong>`;
}

// ─── Intro Animation B — Employer-Side ─────────────────────────────
async function playIntroB() {
  const vizEl = document.getElementById('intro-b-viz');
  const textEl = document.getElementById('intro-b-text');
  vizEl.innerHTML = '';
  textEl.textContent = '';

  const scene = new BarScene('#intro-b-viz', { tooltip, currency: '$' });
  const gross = 100000;

  // Step 1
  scene.reset(gross, 'Your Gross Salary', 0);
  textEl.textContent = 'You negotiated $100,000. That\'s what your contract says.';
  await delay(2000);

  // Step 2 — Employer extension
  textEl.textContent = 'Your employer budgeted $131,000 for your role. You see $100,000.';
  await scene.extendRight(31000, gross, C.red, 'Employer Social Contributions: +$31,000', 0);
  await delay(2500);

  // Step 3 — Full picture comparison
  textEl.textContent = '';
  scene.clear();

  const bar1 = {
    layers: [
      { id: 'deductions', label: 'Your Deductions', amount: 27000, color: C.blue },
    ],
    netIncome: 73000, grossSalary: gross
  };
  const bar2 = {
    layers: [
      { id: 'deductions', label: 'Employee Deductions', amount: 27000, color: C.blue },
    ],
    netIncome: 73000, grossSalary: gross, employerTotal: 31000
  };
  scene.showComparison(bar1, bar2, [
    'What you see (after deductions): Net $73,000',
    'What was actually spent: $131,000'
  ]);

  textEl.innerHTML = `<strong style="color:${C.yellow}">For every $1 you take home, your employer spent $1.79</strong>`;
}

// ─── Country: Ontario ──────────────────────────────────────────────
function initOntario() {
  const calc = calculators.ontario;
  new SalaryInput('#ontario-input', {
    currency: 'CAD', flag: '🇨🇦', defaultValue: 120000,
    presets: [
      { label: 'Median', value: 65000 },
      { label: 'Average SWE', value: 120000 },
      { label: 'Top 10%', value: 200000 },
    ],
    onCalculate: (salary) => animateOntario(salary, calc)
  });
}

async function animateOntario(salary, calc) {
  const pass1 = calc.calculatePass1(salary);
  const pass2 = calc.calculatePass2(salary);

  const vizEl = document.getElementById('ontario-viz');
  vizEl.innerHTML = '';

  const scene = new BarScene('#ontario-viz', { tooltip, currency: '$', barHeight: 48, gap: 70 });

  // Bar A: Headline
  scene.reset(salary, 'Headline Calculation', 0);
  for (const layer of pass1.layers) {
    await scene.addSlice(layer.id + '_p1', layer.amount, salary, layer.color, layer.label, 200);
  }
  await delay(600);

  // Bar B: Reality
  scene.reset(salary, 'Reality Calculation', 1);
  for (const layer of pass2.layers) {
    await scene._addSliceToRow(1, layer.id, layer.amount, salary, layer.color, layer.label, 400);
    if (layer.highlight) scene.pulseSlice(layer.id, 1);
  }

  // Summary table
  const diffDed = pass2.totalDeductions - pass1.totalDeductions;
  const effRate1 = pass1.totalDeductions / salary;
  const effRate2 = pass2.totalDeductions / salary;
  const surtaxAmt = pass2.layers.find(l => l.id === 'ontario_surtax')?.amount || 0;

  document.getElementById('ontario-summary').innerHTML = buildSummaryTable(
    salary, pass1.totalDeductions, pass2.totalDeductions,
    pass1.netIncome, pass2.netIncome, effRate1, effRate2, '$'
  );

  const callout = document.getElementById('ontario-callout');
  callout.innerHTML = `🔴 The Ontario Surtax alone added <strong>${fmt(surtaxAmt, '$')}</strong> to your tax bill — it's not in any bracket table.`;
  callout.classList.add('show');
  showEl('ontario-next');
}

// ─── Country: Ireland ──────────────────────────────────────────────
function initIreland() {
  const calc = calculators.ireland;
  new SalaryInput('#ireland-input', {
    currency: 'EUR', flag: '🇮🇪', defaultValue: 85000,
    presets: [
      { label: 'Median', value: 44000 },
      { label: 'Average SWE', value: 85000 },
      { label: 'Top 10%', value: 140000 },
    ],
    onCalculate: (salary) => animateIreland(salary, calc)
  });
}

async function animateIreland(salary, calc) {
  const pass1 = calc.calculatePass1(salary);
  const pass2 = calc.calculatePass2(salary);

  const vizEl = document.getElementById('ireland-viz');
  vizEl.innerHTML = '';

  const scene = new BarScene('#ireland-viz', { tooltip, currency: '€', barHeight: 48, gap: 70 });

  // Bar A: Headline
  scene.reset(salary, 'Headline (Income Tax + Credits)', 0);
  for (const layer of pass1.layers) {
    await scene.addSlice(layer.id + '_p1', layer.amount, salary, layer.color, layer.label, 200);
  }
  await delay(600);

  // Bar B: Reality
  scene.reset(salary, 'Reality', 1);
  for (const layer of pass2.layers) {
    if (layer.isCredit) {
      await scene._addCreditToRow(1, layer.id, layer.amount, salary, layer.color, layer.label, 400);
    } else {
      await scene._addSliceToRow(1, layer.id, layer.amount, salary, layer.color, layer.label, 400);
      if (layer.highlight) scene.pulseSlice(layer.id, 1);
    }
  }

  const effRate1 = pass1.totalDeductions / salary;
  const effRate2 = pass2.totalDeductions / salary;

  document.getElementById('ireland-summary').innerHTML = buildSummaryTable(
    salary, pass1.totalDeductions, pass2.totalDeductions,
    pass1.netIncome, pass2.netIncome, effRate1, effRate2, '€'
  );

  const callout = document.getElementById('ireland-callout');
  callout.innerHTML = `🔴 Your tax credits saved you <strong>${fmt(pass2.creditsTotal, '€')}</strong> on income tax — but did nothing to reduce the <strong>${fmt(pass2.uscTotal, '€')}</strong> USC bill.`;
  callout.classList.add('show');
  showEl('ireland-next');
}

// ─── Country: Sweden ───────────────────────────────────────────────
function initSweden() {
  const calc = calculators.sweden;
  new SalaryInput('#sweden-input', {
    currency: 'SEK', flag: '🇸🇪', defaultValue: 780000,
    presets: [
      { label: 'Median', value: 420000 },
      { label: 'Typical SWE', value: 780000 },
      { label: 'Senior', value: 1100000 },
    ],
    onCalculate: (salary) => animateSweden(salary, calc)
  });
}

async function animateSweden(salary, calc) {
  const emp = calc.calculatePass1(salary);
  const employer = calc.calculateEmployerReveal(salary);

  const vizEl = document.getElementById('sweden-viz');
  vizEl.innerHTML = '';

  const scene = new BarScene('#sweden-viz', { tooltip, currency: 'SEK ', barHeight: 48 });

  // Employee deductions
  scene.reset(salary, 'Your Gross Salary', 0);
  for (const layer of emp.layers) {
    if (layer.isCredit) {
      await scene.addCredit(layer.id, layer.amount, salary, layer.color, layer.label, 400);
    } else {
      await scene.addSlice(layer.id, layer.amount, salary, layer.color, layer.label, 400);
    }
  }
  await delay(800);

  // Employer extension
  const empTotal = employer.totalEmployer;
  await scene.extendRight(empTotal, salary, C.red, `Employer Arbetsgivaravgift: +31.42%`, 0);

  const net = emp.netIncome;
  const trueCost = employer.trueCost;
  const govTake = trueCost - net;

  const callout = document.getElementById('sweden-callout');
  callout.innerHTML = `🔴 Your employer spent <strong>SEK ${fmt(trueCost)}</strong> on you. You took home <strong>SEK ${fmt(net)}</strong>. The government collected the difference — <strong>SEK ${fmt(govTake)} total</strong>.`;
  callout.classList.add('show');

  // Breakdown
  const breakdownWrap = document.getElementById('sweden-breakdown-wrap');
  const breakdown = employer.layers[0]?.meta?.breakdown;
  if (breakdown) {
    breakdownWrap.innerHTML = `
      <button class="breakdown-toggle" id="sweden-bd-toggle">Show employer contribution breakdown</button>
      <div class="breakdown-panel" id="sweden-bd-panel">
        <ul class="breakdown-list">
          ${breakdown.map(b => `<li><span>${b.label}</span><span>${(b.rate * 100).toFixed(2)}%  →  SEK ${fmt(salary * b.rate)}</span></li>`).join('')}
        </ul>
      </div>
    `;
    document.getElementById('sweden-bd-toggle').addEventListener('click', () => {
      document.getElementById('sweden-bd-panel').classList.toggle('open');
    });
  }

  showEl('sweden-next');
}

// ─── Country: Estonia ──────────────────────────────────────────────
function initEstonia() {
  const calc = calculators.estonia;
  new SalaryInput('#estonia-input', {
    currency: 'EUR', flag: '🇪🇪', defaultValue: 36000,
    presets: [
      { label: 'Median', value: 22000 },
      { label: 'Typical SWE', value: 36000 },
      { label: 'Senior', value: 60000 },
    ],
    onCalculate: (salary) => animateEstonia(salary, calc)
  });
}

async function animateEstonia(salary, calc) {
  const emp = calc.calculatePass1(salary);
  const employer = calc.calculateEmployerReveal(salary);

  const vizEl = document.getElementById('estonia-viz');
  vizEl.innerHTML = '';

  const scene = new BarScene('#estonia-viz', { tooltip, currency: '€', barHeight: 48 });

  scene.reset(salary, 'Your Gross Salary', 0);
  for (const layer of emp.layers) {
    await scene.addSlice(layer.id, layer.amount, salary, layer.color, layer.label, 400);
  }
  await delay(800);

  await scene.extendRight(employer.totalEmployer, salary, C.red, `Employer Contributions: +33.8%`, 0);

  const callout = document.getElementById('estonia-callout');
  callout.innerHTML = `🔴 Estonia's flat 22% income tax is real. So is the <strong>33.8% employer contribution</strong> that never appears in that headline.`;
  callout.classList.add('show');
  showEl('estonia-next');
}

// ─── Country: Hungary ──────────────────────────────────────────────
function initHungary() {
  const calc = calculators.hungary;
  new SalaryInput('#hungary-input', {
    currency: 'HUF', flag: '🇭🇺', defaultValue: 1200000,
    presets: [
      { label: 'Median', value: 600000 },
      { label: 'Typical SWE', value: 1200000 },
      { label: 'Senior', value: 2000000 },
    ],
    onCalculate: (salary) => animateHungary(salary, calc)
  });
}

async function animateHungary(salary, calc) {
  const pass1 = calc.calculatePass1(salary);
  const pass2 = calc.calculatePass2(salary);
  const employer = calc.calculateEmployerReveal(salary);

  const vizEl = document.getElementById('hungary-viz');
  vizEl.innerHTML = '';

  const scene = new BarScene('#hungary-viz', { tooltip, currency: 'HUF ', barHeight: 48, gap: 70 });

  // Bar A: Headline 15%
  scene.reset(salary, 'Headline: "15% Flat Tax"', 0);
  for (const layer of pass1.layers) {
    await scene.addSlice(layer.id + '_p1', layer.amount, salary, layer.color, layer.label, 200);
  }
  await delay(600);

  // Bar B: Reality 15% + 18.5%
  scene.reset(salary, 'Reality: PIT + SSC', 1);
  for (const layer of pass2.layers) {
    await scene._addSliceToRow(1, layer.id, layer.amount, salary, layer.color, layer.label, 400);
    if (layer.highlight) scene.pulseSlice(layer.id, 1);
  }
  await delay(600);

  // Employer extension on bar B
  await scene.extendRight(employer.totalEmployer, salary, C.red, `Employer: +13%`, 1);

  const effRate1 = pass1.totalDeductions / salary;
  const effRate2 = pass2.totalDeductions / salary;

  document.getElementById('hungary-summary').innerHTML = buildSummaryTable(
    salary, pass1.totalDeductions, pass2.totalDeductions,
    pass1.netIncome, pass2.netIncome, effRate1, effRate2, 'HUF '
  );

  const callout = document.getElementById('hungary-callout');
  const ssc = pass2.layers.find(l => l.id === 'employee_ssc')?.amount || 0;
  callout.innerHTML = `🔴 The "15% flat tax" is real. The <strong>18.5% social contribution that stacks alongside it</strong> is not in the headline — and neither is the <strong>13% your employer pays on top</strong>.`;
  callout.classList.add('show');
  showEl('hungary-next');
}

// ─── Country: France ───────────────────────────────────────────────
function initFrance() {
  const calc = calculators.france;
  new SalaryInput('#france-input', {
    currency: 'EUR', flag: '🇫🇷', defaultValue: 65000,
    presets: [
      { label: 'SMIC (min)', value: 21622 },
      { label: 'Typical SWE', value: 65000 },
      { label: 'Senior', value: 100000 },
    ],
    onCalculate: (salary) => animateFrance(salary, calc)
  });
}

async function animateFrance(salary, calc) {
  const pass1 = calc.calculateFrancePass1(salary);
  const pass2 = calc.calculateFrancePass2(salary);
  const employer = calc.calculateFranceEmployer(salary);

  const vizEl = document.getElementById('france-viz');
  vizEl.innerHTML = '';

  const scene = new BarScene('#france-viz', { tooltip, currency: '€', barHeight: 44, gap: 70 });

  // Phase 1 — Headline
  scene.reset(salary, 'Phase 1: What the brackets suggest', 0);
  await scene.addSlice('income_tax_p1', pass1.incomeTax, salary, C.blue, 'Income Tax (headline)', 300);
  await delay(800);

  // Phase 2 — Employee reality
  scene.reset(salary, 'Phase 2: What actually gets deducted', 1);
  const sscLayers = pass2.layers.filter(l => l.id !== 'income_tax');
  for (const layer of sscLayers) {
    await scene._addSliceToRow(1, layer.id, layer.amount, salary, layer.color, layer.label, 300);
    if (layer.highlight) scene.pulseSlice(layer.id, 1);
  }
  // Income tax recalculated (smaller than pass1)
  const itLayer = pass2.layers.find(l => l.id === 'income_tax');
  await scene._addSliceToRow(1, 'income_tax_p2', itLayer.amount, salary, C.blue, 'Income Tax (reduced base)', 400);

  // Annotation
  const annotation = document.getElementById('france-annotation');
  const itDiff = pass1.incomeTax - pass2.incomeTax;
  if (itDiff > 0) {
    annotation.innerHTML = `⚠️ Income tax went <strong>DOWN</strong> by €${fmt(itDiff)} because SSC reduced the taxable base — but total deductions still went up by <strong>€${fmt(pass2.totalDeductions - pass1.totalDeductions)}</strong>`;
    annotation.style.display = 'block';
  }
  await delay(800);

  // Phase 3 — Employer reveal
  await scene.extendRight(employer.totalEmployer, salary, C.red, `Employer Contributions`, 1);

  // Summary
  const effRate1 = pass1.totalDeductions / salary;
  const effRate2 = pass2.totalDeductions / salary;
  document.getElementById('france-summary').innerHTML = buildSummaryTable(
    salary, pass1.totalDeductions, pass2.totalDeductions,
    pass1.netIncome, pass2.netIncome, effRate1, effRate2, '€'
  );

  const callout = document.getElementById('france-callout');
  const govTotal = pass2.totalDeductions + employer.totalEmployer;
  callout.innerHTML = `🔴 France's income tax: <strong>${fmt(pass2.incomeTax, '€')}</strong>. Hidden employee SSC: <strong>${fmt(pass2.totalSSC, '€')}</strong>. Employer contributions: <strong>${fmt(employer.totalEmployer, '€')}</strong>. Combined government take: <strong>${fmt(govTotal, '€')}</strong> — on a €${salary.toLocaleString()} salary.`;
  callout.classList.add('show');
  showEl('france-next');
}

// ─── Summary chart (Section 12) ────────────────────────────────────
function buildSummaryChart() {
  const container = document.getElementById('summary-viz');
  if (!container) return;

  const countries = [
    { id: 'ontario', label: 'Ontario 🇨🇦', salary: 120000, curr: '$' },
    { id: 'ireland', label: 'Ireland 🇮🇪', salary: 85000, curr: '€' },
    { id: 'hungary', label: 'Hungary 🇭🇺', salary: 1200000, curr: '' },
    { id: 'sweden', label: 'Sweden 🇸🇪', salary: 780000, curr: '' },
    { id: 'estonia', label: 'Estonia 🇪🇪', salary: 36000, curr: '€' },
    { id: 'france', label: 'France 🇫🇷', salary: 65000, curr: '€' },
  ];

  const rows = countries.map(c => {
    const calc = calculators[c.id];
    const p2 = calc.calculatePass2(c.salary);
    const emp = calc.calculateEmployerReveal(c.salary);
    const total = c.salary + emp.totalEmployer;
    return {
      ...c, pass2: p2, employer: emp,
      totalCost: total,
      empDeductions: p2.totalDeductions,
      empNet: p2.netIncome,
      employerContrib: emp.totalEmployer,
      effEmployeeRate: p2.totalDeductions / c.salary,
      effTotalRate: (p2.totalDeductions + emp.totalEmployer) / total,
    };
  });

  // Normalize by percentage of total cost
  const margin = { top: 10, right: 120, bottom: 30, left: 130 };
  const barH = 36;
  const gap = 18;
  const w = Math.min(container.offsetWidth, 900);
  const innerW = w - margin.left - margin.right;
  const h = margin.top + rows.length * (barH + gap) + margin.bottom;

  const svg = d3.select(container).append('svg')
    .attr('width', '100%').attr('height', h)
    .attr('viewBox', `0 0 ${w} ${h}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear().domain([0, 1]).range([0, innerW]);

  rows.forEach((row, i) => {
    const y = i * (barH + gap);
    const total = row.totalCost;

    // Country label
    g.append('text')
      .attr('x', -8).attr('y', y + barH / 2).attr('dy', '0.35em')
      .attr('text-anchor', 'end').attr('fill', '#ccc').attr('font-size', '13px')
      .text(row.label);

    let x = 0;
    // Employee deduction layers
    const p2Layers = row.pass2.layers.filter(l => !l.isCredit && l.amount > 0);
    for (const layer of p2Layers) {
      const ww = xScale(layer.amount / total);
      g.append('rect')
        .attr('x', x).attr('y', y)
        .attr('width', ww).attr('height', barH)
        .attr('fill', layer.color).attr('opacity', 0.85);
      x += ww;
    }

    // Employer contributions (red)
    if (row.employerContrib > 0) {
      const ww = xScale(row.employerContrib / total);
      g.append('rect')
        .attr('x', x).attr('y', y)
        .attr('width', ww).attr('height', barH)
        .attr('fill', C.red).attr('opacity', 0.85);
      x += ww;
    }

    // Net (green)
    const netW = xScale(row.empNet / total);
    g.append('rect')
      .attr('x', x).attr('y', y)
      .attr('width', netW).attr('height', barH)
      .attr('fill', C.green).attr('opacity', 0.7);

    // Effective rate label
    g.append('text')
      .attr('x', innerW + 8).attr('y', y + barH / 2).attr('dy', '0.35em')
      .attr('fill', '#888').attr('font-size', '12px')
      .text(`Eff: ${(row.effTotalRate * 100).toFixed(1)}%`);
  });

  // Legend
  const legend = svg.append('g').attr('transform', `translate(${margin.left}, ${h - 10})`);
  const items = [
    { color: C.blue, label: 'Income Tax' },
    { color: C.purple, label: 'Social Contributions' },
    { color: C.orange, label: 'Surtax/USC/CSG' },
    { color: C.red, label: 'Employer' },
    { color: C.green, label: 'Net Take-home' },
  ];
  let lx = 0;
  items.forEach(item => {
    legend.append('rect').attr('x', lx).attr('y', 0).attr('width', 12).attr('height', 12).attr('fill', item.color).attr('rx', 2);
    legend.append('text').attr('x', lx + 16).attr('y', 10).attr('fill', '#888').attr('font-size', '11px').text(item.label);
    lx += item.label.length * 7 + 30;
  });
}

// ─── Summary table builder ─────────────────────────────────────────
function buildSummaryTable(gross, ded1, ded2, net1, net2, rate1, rate2, curr) {
  return `
    <table class="summary-table">
      <thead><tr><th></th><th>Headline</th><th>Reality</th><th>Difference</th></tr></thead>
      <tbody>
        <tr><td>Total Deductions</td><td>${fmt(ded1, curr)}</td><td>${fmt(ded2, curr)}</td><td class="diff-col">+${fmt(ded2 - ded1, curr)}</td></tr>
        <tr><td>Effective Rate</td><td>${fmtPct(rate1)}</td><td>${fmtPct(rate2)}</td><td class="diff-col">+${((rate2 - rate1) * 100).toFixed(1)} pp</td></tr>
        <tr class="net-row"><td>Take-home</td><td>${fmt(net1, curr)}</td><td>${fmt(net2, curr)}</td><td class="diff-col">−${fmt(net1 - net2, curr)}</td></tr>
      </tbody>
    </table>
  `;
}

// ─── Replay buttons ────────────────────────────────────────────────
function initReplayButtons() {
  document.querySelectorAll('.replay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target === 'intro-anim-a') playIntroA();
      else if (target === 'intro-anim-b') playIntroB();
      else {
        // For country sections, re-trigger the calculate button
        const section = document.getElementById(target);
        if (section) {
          const calcBtn = section.querySelector('.calc-btn');
          if (calcBtn) calcBtn.click();
        }
      }
    });
  });
}

// ─── Init ──────────────────────────────────────────────────────────
async function init() {
  tooltip = new Tooltip();
  await loadData();

  initHeroBg();
  initScrollArrow();

  scrollCtrl = new ScrollController();

  // Intro animations on scroll
  let introAPlayed = false;
  let introBPlayed = false;
  scrollCtrl.onEnterView('#intro-anim-a', () => {
    if (!introAPlayed) { introAPlayed = true; playIntroA(); }
  }, { threshold: 0.3, once: true });
  scrollCtrl.onEnterView('#intro-anim-b', () => {
    if (!introBPlayed) { introBPlayed = true; playIntroB(); }
  }, { threshold: 0.3, once: true });

  // Country inputs
  initOntario();
  initIreland();
  initSweden();
  initEstonia();
  initHungary();
  initFrance();

  // Replay buttons
  initReplayButtons();

  // Summary chart
  scrollCtrl.onEnterView('#closing', () => {
    buildSummaryChart();
  }, { threshold: 0.2, once: true });
}

init();
