// salary-input.js — Reusable salary input component

export class SalaryInput {
  constructor(containerSelector, opts = {}) {
    this.container = document.querySelector(containerSelector);
    this.currency = opts.currency || '';
    this.currencySymbol = opts.currencySymbol || '';
    this.flag = opts.flag || '';
    this.defaultValue = opts.defaultValue || 0;
    this.min = opts.min || 0;
    this.max = opts.max || 10000000;
    this.onCalculate = opts.onCalculate || (() => {});
    this.presets = opts.presets || [];
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="salary-input-wrap">
        <label class="salary-label">Enter gross annual salary</label>
        <div class="input-row">
          <span class="currency-badge">${this.flag} ${this.currency}</span>
          <input type="text" class="salary-field" value="${this._formatNum(this.defaultValue)}" inputmode="numeric" />
          <button class="calc-btn">Calculate →</button>
        </div>
        ${this.presets.length ? `
        <div class="salary-presets">
          ${this.presets.map(p => `<button class="preset-pill" data-value="${p.value}">${p.label}</button>`).join('')}
        </div>` : ''}
      </div>
    `;

    this.input = this.container.querySelector('.salary-field');
    this.btn = this.container.querySelector('.calc-btn');

    // Format on blur
    this.input.addEventListener('blur', () => {
      const val = this._parseNum(this.input.value);
      this.input.value = this._formatNum(val);
    });

    // Enter key
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleCalculate();
    });

    // Calculate button
    this.btn.addEventListener('click', () => this._handleCalculate());

    // Preset pills
    this.container.querySelectorAll('.preset-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const val = Number(pill.dataset.value);
        this.input.value = this._formatNum(val);
        this._handleCalculate();
      });
    });
  }

  _handleCalculate() {
    const val = this._parseNum(this.input.value);
    if (val <= 0 || isNaN(val)) return;

    // Button loading state
    this.btn.classList.add('loading');
    this.btn.textContent = '...';
    this.btn.disabled = true;

    // Trigger callback
    Promise.resolve(this.onCalculate(val)).finally(() => {
      this.btn.classList.remove('loading');
      this.btn.textContent = 'Calculate →';
      this.btn.disabled = false;
    });
  }

  _formatNum(n) {
    return Math.round(n).toLocaleString();
  }

  _parseNum(str) {
    return Number(String(str).replace(/[^0-9.\-]/g, ''));
  }

  getValue() {
    return this._parseNum(this.input.value);
  }
}
