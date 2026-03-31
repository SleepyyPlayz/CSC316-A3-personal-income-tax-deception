// main.js — Orchestration: data loading, stepper wiring

import { TaxCalculator } from './calculator.js';
import { Stepper } from './stepper.js';
import { SalaryInput } from './salary-input.js';
import { Tooltip } from './tooltip.js';
import { ScrollController } from './scroll-controller.js';

// ─── Color constants ───────────────────────────────────────────────
const C = {
  blue: '#3b82f6', red: '#ef4444', green: '#22c55e',
  purple: '#a855f7', orange: '#f97316', yellow: '#eab308',
};

// ─── Globals ───────────────────────────────────────────────────────
let taxData = {};
let tooltip;
let scrollCtrl;
const calculators = {};
const steppers = {};
const salaryInputs = {};

// ─── Helpers ───────────────────────────────────────────────────────
function fmt(v, currency = '') {
  const abs = Math.abs(Math.round(v));
  return (v < 0 ? '−' : '') + currency + abs.toLocaleString();
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

// ─── Currency symbol lookup ────────────────────────────────────────
function currSym(currency) {
  switch (currency) {
    case 'CAD': return '$';
    case 'EUR': return '€';
    case 'SEK': return 'SEK ';
    case 'HUF': return 'HUF ';
    default: return currency + ' ';
  }
}

// ─── Generic country stepper launcher ──────────────────────────────
function launchStepper(countryId, salary) {
  try { return _launchStepperInner(countryId, salary); }
  catch (e) { console.error('launchStepper error:', e); throw e; }
}

function _launchStepperInner(countryId, salary) {
  console.log('[stepper] launch', countryId, salary);
  const calc = calculators[countryId];
  const data = taxData[countryId];
  const sym = currSym(data.currency);

  // Generate steps
  console.log('[stepper] generating steps...');
  const steps = calc.generateSteps(salary);
  console.log('[stepper] steps generated:', steps.length);

  // Calculate total employer for chart scale
  let totalEmployer = 0;
  for (const step of steps) {
    if (step.type === 'employer') totalEmployer += step.amount;
  }

  // Destroy previous stepper if exists
  if (steppers[countryId]) {
    steppers[countryId].destroy();
  }

  const inputEl = document.getElementById(`${countryId}-input`);
  const chartEl = document.getElementById(`${countryId}-chart`);
  const compEl = document.getElementById(`${countryId}-comparison`);
  console.log('[stepper] DOM elements:', { inputEl: !!inputEl, chartEl: !!chartEl, compEl: !!compEl });

  // Hide the salary-input-wrap, use the input container for the stepper panel
  const salaryWrap = inputEl.querySelector('.salary-input-wrap');
  if (salaryWrap) salaryWrap.style.display = 'none';

  // Create a panel wrapper inside inputEl for the stepper
  let panelWrap = inputEl.querySelector('.stepper-panel-wrap');
  if (!panelWrap) {
    panelWrap = document.createElement('div');
    panelWrap.className = 'stepper-panel-wrap';
    inputEl.appendChild(panelWrap);
  }
  panelWrap.innerHTML = '';
  panelWrap.style.display = '';

  chartEl.innerHTML = '';
  compEl.innerHTML = '';

  console.log('[stepper] creating Stepper instance...');
  const stepper = new Stepper(chartEl, panelWrap, {
    steps,
    currency: sym,
    gross: salary,
    totalEmployer,
    tooltip,
    onComplete: () => showComparison(countryId, salary, sym),
    onReset: () => resetStepper(countryId),
  });
  steppers[countryId] = stepper;
  console.log('[stepper] calling start()...');
  stepper.start();
  console.log('[stepper] done');
}

// ─── Reset: restore salary input, clear chart ──────────────────────
function resetStepper(countryId) {
  if (steppers[countryId]) {
    steppers[countryId].destroy();
    steppers[countryId] = null;
  }

  const inputEl = document.getElementById(`${countryId}-input`);
  const chartEl = document.getElementById(`${countryId}-chart`);
  const compEl = document.getElementById(`${countryId}-comparison`);

  // Hide the stepper panel wrapper
  const panelWrap = inputEl.querySelector('.stepper-panel-wrap');
  if (panelWrap) panelWrap.style.display = 'none';

  // Restore salary input
  const salaryWrap = inputEl.querySelector('.salary-input-wrap');
  if (salaryWrap) salaryWrap.style.display = '';

  chartEl.innerHTML = '';
  compEl.innerHTML = '';
}

// ─── Comparison (headline vs reality) after stepper completes ──────
function showComparison(countryId, salary, sym) {
  const compEl = document.getElementById(`${countryId}-comparison`);
  if (!compEl) return;

  const calc = calculators[countryId];
  const pass1 = calc.calculatePass1(salary);
  const pass2 = calc.calculatePass2(salary);
  const employer = calc.calculateEmployerReveal(salary);

  const headlineRate = (pass1.totalDeductions / salary * 100).toFixed(1);
  const realityRate = (pass2.totalDeductions / salary * 100).toFixed(1);
  const totalGov = pass2.totalDeductions + employer.totalEmployer;
  const trueCost = salary + employer.totalEmployer;
  const totalGovRate = (totalGov / trueCost * 100).toFixed(1);

  compEl.innerHTML = `
    <h3>Headline vs Reality</h3>
    <div class="comparison-callout">
      <p><strong>Headline effective rate:</strong> ${headlineRate}% → Take-home: ${sym}${Math.round(pass1.netIncome).toLocaleString()}</p>
      <p><strong>Full employee reality:</strong> ${realityRate}% → Take-home: ${sym}${Math.round(pass2.netIncome).toLocaleString()}</p>
      ${employer.totalEmployer > 0
        ? `<p><strong>True cost to employer:</strong> ${sym}${Math.round(trueCost).toLocaleString()} — government collected ${sym}${Math.round(totalGov).toLocaleString()} (${totalGovRate}% of total labour cost)</p>`
        : ''
      }
    </div>
  `;
}

// ─── Country initializers ──────────────────────────────────────────

function initOntario() {
  salaryInputs.ontario = new SalaryInput('#ontario-input', {
    currency: 'CAD', flag: '🇨🇦', defaultValue: 120000, minValue: 10000,
    presets: [
      { label: 'Median', value: 65000 },
      { label: 'Average SWE', value: 120000 },
      { label: 'Top 10%', value: 200000 },
    ],
    onCalculate: (salary) => launchStepper('ontario', salary),
  });
}

function initIreland() {
  salaryInputs.ireland = new SalaryInput('#ireland-input', {
    currency: 'EUR', flag: '🇮🇪', defaultValue: 85000, minValue: 10000,
    presets: [
      { label: 'Median', value: 44000 },
      { label: 'Average SWE', value: 85000 },
      { label: 'Top 10%', value: 140000 },
    ],
    onCalculate: (salary) => launchStepper('ireland', salary),
  });
}

function initSweden() {
  salaryInputs.sweden = new SalaryInput('#sweden-input', {
    currency: 'SEK', flag: '🇸🇪', defaultValue: 780000, minValue: 100000,
    presets: [
      { label: 'Median', value: 420000 },
      { label: 'Typical SWE', value: 780000 },
      { label: 'Senior', value: 1100000 },
    ],
    onCalculate: (salary) => launchStepper('sweden', salary),
  });
}

function initEstonia() {
  salaryInputs.estonia = new SalaryInput('#estonia-input', {
    currency: 'EUR', flag: '🇪🇪', defaultValue: 36000, minValue: 10000,
    presets: [
      { label: 'Median', value: 22000 },
      { label: 'Typical SWE', value: 36000 },
      { label: 'Senior', value: 60000 },
    ],
    onCalculate: (salary) => launchStepper('estonia', salary),
  });
}

function initHungary() {
  salaryInputs.hungary = new SalaryInput('#hungary-input', {
    currency: 'HUF', flag: '🇭🇺', defaultValue: 1200000, minValue: 1000000,
    presets: [
      { label: 'Median', value: 600000 },
      { label: 'Typical SWE', value: 1200000 },
      { label: 'Senior', value: 2000000 },
    ],
    onCalculate: (salary) => launchStepper('hungary', salary),
  });
}

function initFrance() {
  salaryInputs.france = new SalaryInput('#france-input', {
    currency: 'EUR', flag: '🇫🇷', defaultValue: 65000, minValue: 10000,
    presets: [
      { label: 'SMIC (min)', value: 21622 },
      { label: 'Typical SWE', value: 65000 },
      { label: 'Senior', value: 100000 },
    ],
    onCalculate: (salary) => launchStepper('france', salary),
  });
}

// ─── Summary chart (closing section) ───────────────────────────────
function buildSummaryChart() {
  const container = document.getElementById('summary-viz');
  if (!container || container.querySelector('svg')) return;

  const countries = [
    { id: 'ontario', label: 'Ontario 🇨🇦', salary: 120000 },
    { id: 'ireland', label: 'Ireland 🇮🇪', salary: 85000 },
    { id: 'hungary', label: 'Hungary 🇭🇺', salary: 1200000 },
    { id: 'sweden', label: 'Sweden 🇸🇪', salary: 780000 },
    { id: 'estonia', label: 'Estonia 🇪🇪', salary: 36000 },
    { id: 'france', label: 'France 🇫🇷', salary: 65000 },
  ];

  const rows = countries.map(c => {
    const calc = calculators[c.id];
    const p2 = calc.calculatePass2(c.salary);
    const emp = calc.calculateEmployerReveal(c.salary);
    const total = c.salary + emp.totalEmployer;
    return {
      ...c,
      totalCost: total,
      empNet: p2.netIncome,
      employeeDeductions: p2.totalDeductions,
      employerContrib: emp.totalEmployer,
      effTotalRate: (p2.totalDeductions + emp.totalEmployer) / total,
    };
  });

  const margin = { top: 10, right: 120, bottom: 30, left: 130 };
  const barH = 36;
  const gap = 18;
  const w = Math.min(container.offsetWidth || 800, 900);
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

    g.append('text')
      .attr('x', -8).attr('y', y + barH / 2).attr('dy', '0.35em')
      .attr('text-anchor', 'end').attr('fill', '#ccc').attr('font-size', '13px')
      .text(row.label);

    let x = 0;

    // Employee deductions (blue)
    const dedW = xScale(row.employeeDeductions / total);
    g.append('rect').attr('x', x).attr('y', y).attr('width', dedW).attr('height', barH)
      .attr('fill', C.blue).attr('opacity', 0.85);
    x += dedW;

    // Employer contributions (red)
    if (row.employerContrib > 0) {
      const empW = xScale(row.employerContrib / total);
      g.append('rect').attr('x', x).attr('y', y).attr('width', empW).attr('height', barH)
        .attr('fill', C.red).attr('opacity', 0.85);
      x += empW;
    }

    // Net (green)
    const netW = xScale(row.empNet / total);
    g.append('rect').attr('x', x).attr('y', y).attr('width', netW).attr('height', barH)
      .attr('fill', C.green).attr('opacity', 0.7);

    g.append('text')
      .attr('x', innerW + 8).attr('y', y + barH / 2).attr('dy', '0.35em')
      .attr('fill', '#888').attr('font-size', '12px')
      .text(`Eff: ${(row.effTotalRate * 100).toFixed(1)}%`);
  });

  // Legend
  const legend = svg.append('g').attr('transform', `translate(${margin.left}, ${h - 10})`);
  const items = [
    { color: C.blue, label: 'Employee Deductions' },
    { color: C.red, label: 'Employer Contributions' },
    { color: C.green, label: 'Net Take-home' },
  ];
  let lx = 0;
  items.forEach(item => {
    legend.append('rect').attr('x', lx).attr('y', 0).attr('width', 12).attr('height', 12)
      .attr('fill', item.color).attr('rx', 2);
    legend.append('text').attr('x', lx + 16).attr('y', 10).attr('fill', '#888').attr('font-size', '11px')
      .text(item.label);
    lx += item.label.length * 7 + 30;
  });
}

// ─── Init ──────────────────────────────────────────────────────────
async function init() {
  tooltip = new Tooltip();
  await loadData();

  initHeroBg();
  initScrollArrow();
  scrollCtrl = new ScrollController();

  // Country salary inputs
  initOntario();
  initIreland();
  initSweden();
  initEstonia();
  initHungary();
  initFrance();

  // Summary chart
  scrollCtrl.onEnterView('#closing', () => {
    buildSummaryChart();
  }, { threshold: 0.2, once: true });
}

init();
