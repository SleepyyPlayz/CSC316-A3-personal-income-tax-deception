// bar-scene.js — D3 animated stacked-bar scene system

import { Tooltip } from './tooltip.js';

const DURATION = 700;
const EASE = d3.easeCubicInOut;

export class BarScene {
  constructor(containerSelector, opts = {}) {
    this.container = d3.select(containerSelector);
    this.container.selectAll('svg.bar-scene').remove();

    this.margin = opts.margin || { top: 30, right: 20, bottom: 30, left: 20 };
    this.barHeight = opts.barHeight || 52;
    this.gap = opts.gap || 60;
    this.currency = opts.currency || '';
    this.tooltip = opts.tooltip || new Tooltip();

    const cRect = this.container.node().getBoundingClientRect();
    this.fullWidth = Math.min(cRect.width, 900);
    this.innerWidth = this.fullWidth - this.margin.left - this.margin.right;

    this.rows = [];
    this.svg = null;
    this._ensureSvg(1);
  }

  _ensureSvg(numRows) {
    const totalH = this.margin.top + numRows * (this.barHeight + this.gap) + this.margin.bottom;
    if (this.svg) {
      this.svg.attr('height', totalH).attr('viewBox', `0 0 ${this.fullWidth} ${totalH}`);
      return;
    }
    this.svg = this.container.append('svg')
      .attr('class', 'bar-scene')
      .attr('width', '100%')
      .attr('height', totalH)
      .attr('viewBox', `0 0 ${this.fullWidth} ${totalH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');
    this.g = this.svg.append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
  }

  _rowY(index) {
    return index * (this.barHeight + this.gap);
  }

  _fmt(v) {
    return Math.abs(v) >= 1
      ? Math.round(v).toLocaleString()
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  // ─── Reset: single full-width green bar ──────────────────────────

  reset(totalAmount, label, rowIndex = 0) {
    while (this.rows.length <= rowIndex) this.rows.push({ slices: [], total: 0, extended: 0 });
    const row = this.rows[rowIndex];
    row.slices = [];
    row.total = totalAmount;
    row.extended = 0;

    this._ensureSvg(this.rows.length);
    const y = this._rowY(rowIndex);
    const grp = this.g.selectAll(`.bar-row-${rowIndex}`).data([1]);
    const grpEnter = grp.enter().append('g').attr('class', `bar-row bar-row-${rowIndex}`).attr('transform', `translate(0,${y})`);
    const merged = grpEnter.merge(grp);
    merged.selectAll('*').remove();

    const scale = d3.scaleLinear().domain([0, totalAmount]).range([0, this.innerWidth]);
    row.scale = scale;

    // Full green bar
    merged.append('rect')
      .attr('class', 'bar-base')
      .attr('x', 0).attr('y', 0)
      .attr('width', scale(totalAmount))
      .attr('height', this.barHeight)
      .attr('rx', 6)
      .attr('fill', '#22c55e');

    // Label
    merged.append('text')
      .attr('class', 'bar-label')
      .attr('x', scale(totalAmount) / 2)
      .attr('y', this.barHeight / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .text(`${label}: ${this.currency}${this._fmt(totalAmount)}`);

    return this;
  }

  // ─── Add a slice from the right ──────────────────────────────────

  addSlice(id, amount, totalAmount, color, label, delay = 0) {
    return this._addSliceToRow(0, id, amount, totalAmount, color, label, delay);
  }

  _addSliceToRow(rowIndex, id, amount, totalAmount, color, label, delay = 0) {
    const row = this.rows[rowIndex];
    if (!row) return Promise.resolve();
    const scale = row.scale;
    const grp = this.g.select(`.bar-row-${rowIndex}`);
    const tooltip = this.tooltip;
    const currency = this.currency;

    // Calculate position
    const prevUsed = row.slices.reduce((s, sl) => s + sl.amount, 0);
    const remaining = totalAmount - prevUsed;
    const sliceW = scale(Math.abs(amount));
    const xStart = scale(remaining);
    const xFinal = scale(remaining - Math.abs(amount));

    return new Promise(resolve => {
      setTimeout(() => {
        // Shrink the base bar
        grp.select('.bar-base')
          .transition().duration(DURATION).ease(EASE)
          .attr('width', scale(remaining - Math.abs(amount)));

        // New slice
        const rect = grp.append('rect')
          .attr('class', `slice slice-${id}`)
          .attr('data-id', id)
          .attr('x', xStart)
          .attr('y', 0)
          .attr('width', 0)
          .attr('height', this.barHeight)
          .attr('rx', 0)
          .attr('fill', color)
          .attr('opacity', 0.92)
          .attr('cursor', 'pointer');

        rect.transition().duration(DURATION).ease(EASE)
          .attr('x', xFinal)
          .attr('width', sliceW)
          .on('end', resolve);

        // Tooltip events
        const sliceData = { label, amount, currency, meta: null };
        rect
          .on('mouseover touchstart', (event) => { tooltip.show(event, sliceData); })
          .on('mousemove', (event) => { tooltip.move(event); })
          .on('mouseout touchend', () => { tooltip.hide(); });

        // Slice label (if wide enough)
        if (sliceW > 60) {
          grp.append('text')
            .attr('class', `slice-label slice-label-${id}`)
            .attr('x', xFinal + sliceW / 2)
            .attr('y', this.barHeight / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '11px')
            .attr('font-weight', '500')
            .attr('pointer-events', 'none')
            .attr('opacity', 0)
            .text(`${label}: ${currency}${this._fmt(Math.abs(amount))}`)
            .transition().delay(DURATION * 0.5).duration(400)
            .attr('opacity', 1);
        }

        // Update remaining label
        const newRemaining = remaining - Math.abs(amount);
        grp.select('.bar-label')
          .transition().duration(DURATION).ease(EASE)
          .attr('x', scale(newRemaining) / 2)
          .tween('text', function () {
            const i = d3.interpolateNumber(remaining, newRemaining);
            return function (t) {
              d3.select(this).text(`Net: ${currency}${Math.round(i(t)).toLocaleString()}`);
            };
          });

        row.slices.push({ id, amount, color, label });
      }, delay);
    });
  }

  // ─── Add credit (bar grows back slightly) ────────────────────────

  addCredit(id, amount, totalAmount, color, label, delay = 0) {
    return this._addCreditToRow(0, id, amount, totalAmount, color, label, delay);
  }

  _addCreditToRow(rowIndex, id, amount, totalAmount, color, label, delay = 0) {
    const row = this.rows[rowIndex];
    if (!row) return Promise.resolve();
    const scale = row.scale;
    const grp = this.g.select(`.bar-row-${rowIndex}`);
    const currency = this.currency;

    const prevUsed = row.slices.reduce((s, sl) => s + sl.amount, 0);
    const currentNetWidth = scale(totalAmount - prevUsed);
    const creditWidth = scale(Math.abs(amount));
    const newNetWidth = currentNetWidth + creditWidth;

    return new Promise(resolve => {
      setTimeout(() => {
        // Grow base bar back
        grp.select('.bar-base')
          .transition().duration(DURATION).ease(EASE)
          .attr('width', newNetWidth);

        // Flash effect
        grp.append('rect')
          .attr('x', currentNetWidth).attr('y', 0)
          .attr('width', 0).attr('height', this.barHeight)
          .attr('fill', color).attr('opacity', 0.6)
          .transition().duration(DURATION).ease(EASE)
          .attr('width', creditWidth)
          .transition().duration(400)
          .attr('opacity', 0)
          .remove();

        // Update label
        const newRemaining = totalAmount - prevUsed + Math.abs(amount);
        grp.select('.bar-label')
          .transition().duration(DURATION).ease(EASE)
          .attr('x', newNetWidth / 2)
          .tween('text', function () {
            const start = totalAmount - prevUsed;
            const i = d3.interpolateNumber(start, newRemaining);
            return function (t) {
              d3.select(this).text(`Net: ${currency}${Math.round(i(t)).toLocaleString()}`);
            };
          });

        row.slices.push({ id, amount: -Math.abs(amount), color, label });

        setTimeout(resolve, DURATION);
      }, delay);
    });
  }

  // ─── Extend right (employer reveal) ──────────────────────────────

  extendRight(amount, originalTotal, color, label, rowIndex = 0) {
    const row = this.rows[rowIndex];
    if (!row) return Promise.resolve();
    const grp = this.g.select(`.bar-row-${rowIndex}`);
    const tooltip = this.tooltip;
    const currency = this.currency;

    const newTotal = originalTotal + amount;
    const newScale = d3.scaleLinear().domain([0, newTotal]).range([0, this.innerWidth]);

    return new Promise(resolve => {
      // Rescale all existing elements
      const oldScale = row.scale;
      row.scale = newScale;

      // Shrink existing bars proportionally
      grp.select('.bar-base')
        .transition().duration(DURATION).ease(EASE)
        .attr('width', function () {
          const currentW = +d3.select(this).attr('width');
          return currentW * (newScale(originalTotal) / oldScale(originalTotal));
        });

      grp.selectAll('.slice')
        .transition().duration(DURATION).ease(EASE)
        .attr('x', function () {
          return +d3.select(this).attr('x') * (newScale(originalTotal) / oldScale(originalTotal));
        })
        .attr('width', function () {
          return +d3.select(this).attr('width') * (newScale(originalTotal) / oldScale(originalTotal));
        });

      grp.selectAll('text:not(.employer-label)')
        .transition().duration(DURATION).ease(EASE)
        .attr('x', function () {
          return +d3.select(this).attr('x') * (newScale(originalTotal) / oldScale(originalTotal));
        });

      // After rescale, add the red extension
      setTimeout(() => {
        const empX = newScale(originalTotal);
        const empW = newScale(amount);

        const rect = grp.append('rect')
          .attr('class', 'slice employer-extension')
          .attr('x', empX).attr('y', 0)
          .attr('width', 0)
          .attr('height', this.barHeight)
          .attr('fill', color)
          .attr('opacity', 0.92)
          .attr('rx', 0)
          .attr('cursor', 'pointer');

        rect.transition().duration(DURATION).ease(EASE)
          .attr('width', empW)
          .on('end', resolve);

        const sliceData = { label, amount, currency, meta: null };
        rect
          .on('mouseover touchstart', (event) => { tooltip.show(event, sliceData); })
          .on('mousemove', (event) => { tooltip.move(event); })
          .on('mouseout touchend', () => { tooltip.hide(); });

        if (empW > 80) {
          grp.append('text')
            .attr('class', 'employer-label')
            .attr('x', empX + empW / 2)
            .attr('y', this.barHeight / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('pointer-events', 'none')
            .attr('opacity', 0)
            .text(`${label}: ${currency}${this._fmt(amount)}`)
            .transition().delay(300).duration(400)
            .attr('opacity', 1);
        }
      }, DURATION + 100);
    });
  }

  // ─── Comparison: two bars vertically ─────────────────────────────

  showComparison(bar1, bar2, labels) {
    this.g.selectAll('*').remove();
    this.rows = [];

    const totalOf = (d) => d.grossSalary + (d.employerTotal || 0);
    const maxVal = Math.max(totalOf(bar1), totalOf(bar2));
    this._ensureSvg(2);

    const drawBar = (rowIdx, data, barLabel) => {
      this.rows[rowIdx] = {
        slices: [],
        total: maxVal,
        scale: d3.scaleLinear().domain([0, maxVal]).range([0, this.innerWidth])
      };
      const row = this.rows[rowIdx];
      const y = this._rowY(rowIdx);
      const grp = this.g.append('g').attr('class', `bar-row bar-row-${rowIdx}`).attr('transform', `translate(0,${y})`);

      // Row label above
      grp.append('text')
        .attr('x', 0).attr('y', -8)
        .attr('fill', '#888')
        .attr('font-size', '12px')
        .text(barLabel);

      let x = 0;
      // Deduction slices
      const deductionLayers = data.layers.filter(l => !l.isCredit && l.amount > 0);
      for (const layer of deductionLayers) {
        const w = row.scale(layer.amount);
        grp.append('rect')
          .attr('x', x).attr('y', 0)
          .attr('width', w).attr('height', this.barHeight)
          .attr('fill', layer.color)
          .attr('opacity', 0.9);
        if (w > 40) {
          grp.append('text')
            .attr('x', x + w / 2).attr('y', this.barHeight / 2)
            .attr('dy', '0.35em').attr('text-anchor', 'middle')
            .attr('fill', '#fff').attr('font-size', '10px')
            .text(this._fmt(layer.amount));
        }
        x += w;
      }

      // Employer (red) if present
      if (data.employerTotal) {
        const empW = row.scale(data.employerTotal);
        grp.append('rect')
          .attr('x', x).attr('y', 0)
          .attr('width', empW).attr('height', this.barHeight)
          .attr('fill', '#ef4444').attr('opacity', 0.9);
        x += empW;
      }

      // Net (green)
      const netW = Math.max(0, row.scale(data.netIncome));
      if (netW > 2) {
        grp.append('rect')
          .attr('x', x).attr('y', 0)
          .attr('width', netW).attr('height', this.barHeight)
          .attr('fill', '#22c55e').attr('rx', 0);
      }
      if (netW > 40) {
        grp.append('text')
          .attr('x', x + netW / 2).attr('y', this.barHeight / 2)
          .attr('dy', '0.35em').attr('text-anchor', 'middle')
          .attr('fill', '#fff').attr('font-size', '11px').attr('font-weight', '600')
          .text(`Net: ${this.currency}${this._fmt(data.netIncome)}`);
      }
    };

    drawBar(0, bar1, labels[0]);
    drawBar(1, bar2, labels[1]);
  }

  // ─── Three-bar comparison (France) ───────────────────────────────

  showThreeComparison(bars, labels) {
    this.g.selectAll('*').remove();
    this.rows = [];

    const maxVal = Math.max(...bars.map(b => b.grossSalary + (b.employerTotal || 0)));
    this._ensureSvg(3);

    bars.forEach((data, rowIdx) => {
      this.rows[rowIdx] = {
        slices: [],
        total: maxVal,
        scale: d3.scaleLinear().domain([0, maxVal]).range([0, this.innerWidth])
      };
      const row = this.rows[rowIdx];
      const y = this._rowY(rowIdx);
      const grp = this.g.append('g').attr('class', `bar-row bar-row-${rowIdx}`).attr('transform', `translate(0,${y})`);

      grp.append('text')
        .attr('x', 0).attr('y', -8)
        .attr('fill', '#888').attr('font-size', '12px')
        .text(labels[rowIdx]);

      let x = 0;
      const deductionLayers = data.layers.filter(l => !l.isCredit && l.amount > 0);
      for (const layer of deductionLayers) {
        const w = row.scale(layer.amount);
        grp.append('rect')
          .attr('x', x).attr('y', 0)
          .attr('width', w).attr('height', this.barHeight)
          .attr('fill', layer.color).attr('opacity', 0.9);
        x += w;
      }

      // Employer (red) if present
      if (data.employerTotal) {
        const empW = row.scale(data.employerTotal);
        grp.append('rect')
          .attr('x', x).attr('y', 0)
          .attr('width', empW).attr('height', this.barHeight)
          .attr('fill', '#ef4444').attr('opacity', 0.9);
        x += empW;
      }

      // Net
      const netW = Math.max(0, row.scale(data.netIncome));
      if (netW > 2) {
        grp.append('rect')
          .attr('x', x).attr('y', 0)
          .attr('width', netW).attr('height', this.barHeight)
          .attr('fill', '#22c55e');
      }

      // Right-side summary
      grp.append('text')
        .attr('x', this.innerWidth + 4).attr('y', this.barHeight / 2)
        .attr('dy', '0.35em').attr('fill', '#f5f5f5').attr('font-size', '12px').attr('font-weight', '600')
        .text(data.employerTotal
          ? `Cost: ${this.currency}${this._fmt(data.grossSalary + data.employerTotal)}`
          : `Net: ${this.currency}${this._fmt(data.netIncome)}`);
    });
  }

  // ─── Highlight pulse on a slice ──────────────────────────────────

  pulseSlice(id, rowIndex = 0) {
    const grp = this.g.select(`.bar-row-${rowIndex}`);
    const slice = grp.select(`.slice-${id}`);
    if (slice.empty()) return;
    slice
      .transition().duration(300).attr('opacity', 1).attr('stroke', '#eab308').attr('stroke-width', 2)
      .transition().duration(300).attr('opacity', 0.92).attr('stroke', 'none')
      .transition().duration(300).attr('opacity', 1).attr('stroke', '#eab308').attr('stroke-width', 2)
      .transition().duration(300).attr('opacity', 0.92).attr('stroke', 'none');
  }

  // ─── Clear ───────────────────────────────────────────────────────

  clear() {
    if (this.g) this.g.selectAll('*').remove();
    this.rows = [];
  }

  destroy() {
    if (this.svg) this.svg.remove();
    this.rows = [];
  }
}
