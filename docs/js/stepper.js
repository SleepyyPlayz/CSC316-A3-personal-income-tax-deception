// stepper.js — Step-by-step navigation controller for waterfall charts

import { WaterfallChart } from './waterfall-chart.js';

export class Stepper {
  /**
   * @param {string} chartSelector  — container for the SVG waterfall chart
   * @param {string} panelSelector  — container for the explanation panel
   * @param {Object} options
   * @param {Array}  options.steps   — step objects from calculator.generateSteps()
   * @param {string} options.currency
   * @param {number} options.gross
   * @param {number} options.totalEmployer
   * @param {Object} options.tooltip
   * @param {Function} options.onComplete — called when the last step is reached
   */
  constructor(chartSelector, panelSelector, options = {}) {
    this.chartContainer =
      typeof chartSelector === 'string'
        ? document.querySelector(chartSelector)
        : chartSelector;
    this.panelContainer =
      typeof panelSelector === 'string'
        ? document.querySelector(panelSelector)
        : panelSelector;

    this.steps = options.steps || [];
    this.currency = options.currency || '$';
    this.gross = options.gross || 100000;
    this.totalEmployer = options.totalEmployer || 0;
    this.tooltip = options.tooltip || null;
    this.onComplete = options.onComplete || null;

    this.currentStep = -1; // nothing shown yet
    this.chart = null;
    this.autoplayTimer = null;
    this.isPlaying = false;

    this._buildPanel();
  }

  // ─── Panel DOM ──────────────────────────────────────────────────

  _buildPanel() {
    this.panelContainer.innerHTML = `
      <div class="stepper-panel">
        <div class="stepper-header">
          <span class="stepper-step-label"></span>
        </div>
        <div class="stepper-dots"></div>
        <div class="stepper-explanation"></div>
        <div class="stepper-stats"></div>
        <div class="stepper-nav">
          <button class="stepper-btn stepper-prev" disabled>← Prev</button>
          <button class="stepper-btn stepper-play">▶ Autoplay</button>
          <button class="stepper-btn stepper-next">Next →</button>
        </div>
      </div>
    `;

    this.els = {
      stepLabel: this.panelContainer.querySelector('.stepper-step-label'),
      dots: this.panelContainer.querySelector('.stepper-dots'),
      explanation: this.panelContainer.querySelector('.stepper-explanation'),
      stats: this.panelContainer.querySelector('.stepper-stats'),
      prevBtn: this.panelContainer.querySelector('.stepper-prev'),
      playBtn: this.panelContainer.querySelector('.stepper-play'),
      nextBtn: this.panelContainer.querySelector('.stepper-next'),
    };

    // Build dots
    this._buildDots();

    // Wire buttons
    this.els.prevBtn.addEventListener('click', () => {
      this.stopAutoplay();
      this.prev();
    });
    this.els.nextBtn.addEventListener('click', () => {
      this.stopAutoplay();
      this.next();
    });
    this.els.playBtn.addEventListener('click', () => this.toggleAutoplay());

    // Initial panel state
    this._updatePanel();
  }

  _buildDots() {
    this.els.dots.innerHTML = '';
    for (let i = 0; i < this.steps.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'stepper-dot';
      const step = this.steps[i];
      if (step.phase === 1) dot.classList.add('dot-employer');
      else dot.classList.add('dot-employee');
      this.els.dots.appendChild(dot);
    }
  }

  // ─── Start / Reset ─────────────────────────────────────────────

  start() {
    this.currentStep = -1;
    this.chartContainer.innerHTML = '';
    this.chart = new WaterfallChart(this.chartContainer, {
      currency: this.currency,
      gross: this.gross,
      totalEmployer: this.totalEmployer,
      tooltip: this.tooltip,
    });
    this._updatePanel();
    // Auto-advance to step 0 (gross bar)
    this.next();
  }

  reset() {
    this.stopAutoplay();
    this.start();
  }

  // ─── Navigation ────────────────────────────────────────────────

  next() {
    if (this.currentStep >= this.steps.length - 1) {
      this.stopAutoplay();
      return;
    }
    this.currentStep++;
    this._applyStep(this.currentStep);
    this._updatePanel();

    // Auto-scroll chart into view
    const row = this.chart.rows[this.chart.rows.length - 1];
    if (row && row.grp) {
      const node = row.grp.node();
      if (node && node.getBoundingClientRect) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom > window.innerHeight) {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    if (this.currentStep === this.steps.length - 1) {
      this.stopAutoplay();
      if (this.onComplete) this.onComplete();
    }
  }

  prev() {
    if (this.currentStep <= 0) return;
    this.chart.removeLastRow(true);
    this.currentStep--;
    this._updatePanel();
  }

  _applyStep(idx) {
    const step = this.steps[idx];
    if (!step || !this.chart) return;

    switch (step.type) {
      case 'gross':
        this.chart.addGrossBar(true);
        break;
      case 'employer':
        this.chart.addEmployerBar(step.id, step.amount, step.color, step.title, true);
        break;
      case 'employee':
        this.chart.addEmployeeBar(
          step.id,
          step.amount,
          step.color,
          step.title,
          step.direction,
          true
        );
        break;
      case 'net':
        this.chart.addNetBar(true);
        break;
    }
  }

  // ─── Autoplay ──────────────────────────────────────────────────

  toggleAutoplay() {
    if (this.isPlaying) {
      this.stopAutoplay();
    } else {
      this.startAutoplay();
    }
  }

  startAutoplay() {
    if (this.currentStep >= this.steps.length - 1) return;
    this.isPlaying = true;
    this.els.playBtn.textContent = '⏸ Pause';
    this.autoplayTimer = setInterval(() => {
      this.next();
      if (this.currentStep >= this.steps.length - 1) {
        this.stopAutoplay();
      }
    }, 3000);
  }

  stopAutoplay() {
    this.isPlaying = false;
    if (this.autoplayTimer) {
      clearInterval(this.autoplayTimer);
      this.autoplayTimer = null;
    }
    if (this.els && this.els.playBtn) {
      this.els.playBtn.textContent = '▶ Autoplay';
    }
  }

  // ─── Panel update ──────────────────────────────────────────────

  _updatePanel() {
    const step = this.steps[this.currentStep];
    const total = this.steps.length;

    // Dots
    const dots = this.els.dots.querySelectorAll('.stepper-dot');
    dots.forEach((d, i) => {
      d.classList.toggle('active', i <= this.currentStep);
      d.classList.toggle('current', i === this.currentStep);
    });

    // Buttons
    this.els.prevBtn.disabled = this.currentStep <= 0;
    this.els.nextBtn.disabled = this.currentStep >= total - 1;

    if (!step) {
      this.els.stepLabel.textContent = `Step 0 of ${total}`;
      this.els.explanation.innerHTML = '<p class="step-prompt">Press <strong>Next →</strong> or <strong>▶ Autoplay</strong> to begin.</p>';
      this.els.stats.innerHTML = '';
      return;
    }

    // Header
    this.els.stepLabel.textContent = `Step ${this.currentStep + 1} of ${total} — ${step.title}`;

    // Explanation with cross-fade
    this.els.explanation.classList.add('fading');
    setTimeout(() => {
      let html = '';
      if (step.explanation) {
        html += `<p class="step-desc">${step.explanation}</p>`;
      }
      if (step.technicalNote) {
        html += `<p class="step-tech">${step.technicalNote}</p>`;
      }
      this.els.explanation.innerHTML = html;
      this.els.explanation.classList.remove('fading');
    }, 150);

    // Stats
    if (step.type === 'net') {
      this.els.stats.innerHTML = `<span class="stat-net">Net Take-Home: <strong>${this.currency}${this._fmt(step.runningNet)}</strong></span>`;
    } else if (step.type === 'gross') {
      this.els.stats.innerHTML = `<span class="stat-gross">Gross Salary: <strong>${this.currency}${this._fmt(this.gross)}</strong></span>`;
    } else {
      const sign = step.direction === 'left' ? '-' : '+';
      this.els.stats.innerHTML =
        `<span class="stat-amount">This step: <strong>${sign}${this.currency}${this._fmt(step.amount)}</strong></span>` +
        `<span class="stat-running">Running net: <strong>${this.currency}${this._fmt(step.runningNet)}</strong></span>`;
    }
  }

  _fmt(v) {
    return Math.abs(Math.round(v)).toLocaleString();
  }

  // ─── Cleanup ───────────────────────────────────────────────────

  destroy() {
    this.stopAutoplay();
    if (this.chart) this.chart.destroy();
    this.panelContainer.innerHTML = '';
  }
}
