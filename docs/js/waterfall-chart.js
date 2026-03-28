// waterfall-chart.js — Floating Waterfall Chart with $0 center spine
// Employer bars extend LEFT from $0; employee bars float RIGHT-to-LEFT from gross.

const DURATION = 600;
const EASE = d3.easeCubicOut;

export class WaterfallChart {
  constructor(containerSelector, options = {}) {
    this.container =
      typeof containerSelector === 'string'
        ? document.querySelector(containerSelector)
        : containerSelector;
    this.currency = options.currency || '$';
    this.grossSalary = options.gross || 100000;
    this.totalEmployer = options.totalEmployer || 0;
    this.tooltip = options.tooltip || null;

    // Dimensions
    this.actionBarH = 30;
    this.anchorBarH = 40;
    this.rowGap = 14;
    this.rowSlotH = this.anchorBarH + this.rowGap;

    // State
    this.rows = [];
    this.employerCursor = 0;
    this.employeeCursor = this.grossSalary;

    this._initSvg();
  }

  // ─── SVG setup ──────────────────────────────────────────────────

  _initSvg() {
    const cw = this.container.offsetWidth || 800;
    const hasEmployer = this.totalEmployer > 0;
    this.margin = {
      top: 36,
      bottom: 24,
      left: hasEmployer ? 190 : 48,
      right: 190,
    };
    this.width = cw;
    this.innerWidth = this.width - this.margin.left - this.margin.right;

    // Scale: negative = employer, positive = employee
    const leftExtent = hasEmployer
      ? -this.totalEmployer * 1.04
      : -this.grossSalary * 0.04;
    this.xScale = d3
      .scaleLinear()
      .domain([leftExtent, this.grossSalary])
      .range([0, this.innerWidth]);

    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('class', 'waterfall-svg')
      .attr('width', '100%')
      .attr('preserveAspectRatio', 'xMidYMin meet');

    this.g = this.svg
      .append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // $0 center spine
    this.zeroX = this.xScale(0);
    this.spineLine = this.g
      .append('line')
      .attr('class', 'wf-spine')
      .attr('x1', this.zeroX)
      .attr('x2', this.zeroX)
      .attr('y1', -this.margin.top + 8)
      .attr('y2', 0)
      .attr('stroke', '#555')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3');

    this.g
      .append('text')
      .attr('class', 'wf-spine-label')
      .attr('x', this.zeroX)
      .attr('y', -this.margin.top + 6)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .attr('font-size', '11px')
      .text(this.currency + '0');

    // Cursor line (tracks employee cursor during employee phase)
    this.cursorLine = this.g
      .append('line')
      .attr('class', 'wf-cursor')
      .attr('x1', this.xScale(this.grossSalary))
      .attr('x2', this.xScale(this.grossSalary))
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#eab308')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,3')
      .attr('opacity', 0);

    this._updateHeight();
  }

  // ─── Helpers ────────────────────────────────────────────────────

  _rowY(idx) {
    return idx * this.rowSlotH;
  }

  _updateHeight() {
    const rows = Math.max(1, this.rows.length + 1); // +1 for padding
    const h = this.margin.top + rows * this.rowSlotH + this.margin.bottom;
    this.svg.attr('viewBox', `0 0 ${this.width} ${h}`);
    // Extend spine
    this.spineLine.attr('y2', this.rows.length * this.rowSlotH + 8);
  }

  _fmt(v) {
    return Math.abs(Math.round(v)).toLocaleString();
  }

  _centeredY(barH) {
    return (this.rowSlotH - barH) / 2;
  }

  // ─── Gross bar (first row, right of $0) ─────────────────────────

  addGrossBar(animate = true) {
    const idx = this.rows.length;
    const y = this._rowY(idx);
    const bh = this.anchorBarH;
    const cy = this._centeredY(bh);
    const x0 = this.zeroX;
    const bw = this.xScale(this.grossSalary) - x0;

    const grp = this.g
      .append('g')
      .attr('class', 'wf-row wf-gross')
      .attr('transform', `translate(0,${y})`);

    const rect = grp
      .append('rect')
      .attr('x', x0)
      .attr('y', cy)
      .attr('height', bh)
      .attr('fill', '#22c55e')
      .attr('rx', 3)
      .attr('opacity', 0.92);

    const lbl = grp
      .append('text')
      .attr('y', cy + bh / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#d4d4d4')
      .attr('font-size', '13px')
      .attr('font-weight', '600');

    if (animate) {
      rect
        .attr('width', 0)
        .transition()
        .duration(DURATION)
        .ease(EASE)
        .attr('width', bw);
      lbl
        .attr('x', x0 + bw + 8)
        .text(`Gross Salary: ${this.currency}${this._fmt(this.grossSalary)}`)
        .attr('opacity', 0)
        .transition()
        .delay(DURATION * 0.4)
        .duration(300)
        .attr('opacity', 1);
    } else {
      rect.attr('width', bw);
      lbl
        .attr('x', x0 + bw + 8)
        .text(`Gross Salary: ${this.currency}${this._fmt(this.grossSalary)}`)
        .attr('opacity', 1);
    }

    this.rows.push({
      type: 'gross',
      id: 'gross',
      amount: this.grossSalary,
      direction: 'right',
      grp,
      rect,
      lbl,
    });
    this.employeeCursor = this.grossSalary;
    this._updateHeight();
    return this;
  }

  // ─── Employer bar (left of $0) ──────────────────────────────────

  addEmployerBar(id, absAmount, color, title, animate = true) {
    const idx = this.rows.length;
    const y = this._rowY(idx);
    const bh = this.actionBarH;
    const cy = this._centeredY(bh);

    const newCursor = this.employerCursor - absAmount;
    const x0 = this.xScale(newCursor);
    const x1 = this.xScale(this.employerCursor);
    const bw = Math.max(0, x1 - x0);

    const grp = this.g
      .append('g')
      .attr('class', `wf-row wf-employer wf-${id}`)
      .attr('transform', `translate(0,${y})`);

    const rect = grp
      .append('rect')
      .attr('y', cy)
      .attr('height', bh)
      .attr('fill', color)
      .attr('rx', 2)
      .attr('opacity', 0.9);

    const lbl = grp
      .append('text')
      .attr('y', cy + bh / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', '#d4d4d4')
      .attr('font-size', '12px');

    const labelText = `${title}: -${this.currency}${this._fmt(absAmount)}`;

    if (animate) {
      rect
        .attr('x', x1)
        .attr('width', 0)
        .transition()
        .duration(DURATION)
        .ease(EASE)
        .attr('x', x0)
        .attr('width', bw);
      lbl
        .attr('x', x0 - 8)
        .text(labelText)
        .attr('opacity', 0)
        .transition()
        .delay(DURATION * 0.4)
        .duration(300)
        .attr('opacity', 1);
    } else {
      rect.attr('x', x0).attr('width', bw);
      lbl.attr('x', x0 - 8).text(labelText).attr('opacity', 1);
    }

    this.employerCursor = newCursor;
    this.rows.push({
      type: 'employer',
      id,
      amount: absAmount,
      direction: 'left',
      prevCursor: this.employerCursor + absAmount,
      grp,
      rect,
      lbl,
    });
    this._updateHeight();
    return this;
  }

  // ─── Employee action bar (floating waterfall, right side) ───────

  addEmployeeBar(id, absAmount, color, title, direction = 'left', animate = true) {
    const idx = this.rows.length;
    const y = this._rowY(idx);
    const bh = this.actionBarH;
    const cy = this._centeredY(bh);

    let x0, bw, newCursor;
    if (direction === 'left') {
      newCursor = this.employeeCursor - absAmount;
      x0 = this.xScale(newCursor);
      bw = this.xScale(this.employeeCursor) - x0;
    } else {
      newCursor = this.employeeCursor + absAmount;
      x0 = this.xScale(this.employeeCursor);
      bw = this.xScale(newCursor) - x0;
    }
    bw = Math.max(0, bw);

    const grp = this.g
      .append('g')
      .attr('class', `wf-row wf-employee wf-${id}`)
      .attr('transform', `translate(0,${y})`);

    const rect = grp
      .append('rect')
      .attr('y', cy)
      .attr('height', bh)
      .attr('fill', color)
      .attr('rx', 2)
      .attr('opacity', 0.9);

    const sign = direction === 'left' ? '-' : '+';
    const labelText = `${title}: ${sign}${this.currency}${this._fmt(absAmount)}`;

    const lbl = grp
      .append('text')
      .attr('y', cy + bh / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#d4d4d4')
      .attr('font-size', '12px');

    if (animate) {
      if (direction === 'left') {
        const anchorX = this.xScale(this.employeeCursor);
        rect
          .attr('x', anchorX)
          .attr('width', 0)
          .transition()
          .duration(DURATION)
          .ease(EASE)
          .attr('x', x0)
          .attr('width', bw);
      } else {
        rect
          .attr('x', x0)
          .attr('width', 0)
          .transition()
          .duration(DURATION)
          .ease(EASE)
          .attr('width', bw);
      }

      // Label to the right of the rightmost edge
      const lblX =
        direction === 'left'
          ? this.xScale(this.employeeCursor) + 8
          : this.xScale(newCursor) + 8;
      lbl
        .attr('x', lblX)
        .attr('text-anchor', 'start')
        .text(labelText)
        .attr('opacity', 0)
        .transition()
        .delay(DURATION * 0.4)
        .duration(300)
        .attr('opacity', 1);

      // Update cursor line
      this.cursorLine
        .attr('opacity', 0.5)
        .transition()
        .duration(DURATION)
        .ease(EASE)
        .attr('x1', this.xScale(newCursor))
        .attr('x2', this.xScale(newCursor))
        .attr('y2', (idx + 1) * this.rowSlotH);
    } else {
      rect.attr('x', x0).attr('width', bw);
      const lblX =
        direction === 'left'
          ? this.xScale(this.employeeCursor) + 8
          : this.xScale(newCursor) + 8;
      lbl.attr('x', lblX).attr('text-anchor', 'start').text(labelText).attr('opacity', 1);
      this.cursorLine
        .attr('opacity', 0.5)
        .attr('x1', this.xScale(newCursor))
        .attr('x2', this.xScale(newCursor))
        .attr('y2', (idx + 1) * this.rowSlotH);
    }

    const prevCursor = this.employeeCursor;
    this.employeeCursor = newCursor;
    this.rows.push({
      type: 'employee',
      id,
      amount: absAmount,
      direction,
      prevCursor,
      grp,
      rect,
      lbl,
    });
    this._updateHeight();
    return this;
  }

  // ─── Net bar (last row, right of $0) ────────────────────────────

  addNetBar(animate = true) {
    const idx = this.rows.length;
    const y = this._rowY(idx);
    const bh = this.anchorBarH;
    const cy = this._centeredY(bh);

    const netAmt = Math.max(0, this.employeeCursor);
    const x0 = this.zeroX;
    const bw = Math.max(0, this.xScale(netAmt) - x0);

    const grp = this.g
      .append('g')
      .attr('class', 'wf-row wf-net')
      .attr('transform', `translate(0,${y})`);

    const rect = grp
      .append('rect')
      .attr('x', x0)
      .attr('y', cy)
      .attr('height', bh)
      .attr('fill', '#22c55e')
      .attr('rx', 3)
      .attr('opacity', 0.92);

    const lbl = grp
      .append('text')
      .attr('y', cy + bh / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#d4d4d4')
      .attr('font-size', '13px')
      .attr('font-weight', '600');

    if (animate) {
      rect
        .attr('width', 0)
        .transition()
        .duration(DURATION)
        .ease(EASE)
        .attr('width', bw);
      lbl
        .attr('x', x0 + bw + 8)
        .text(`Net Take-Home: ${this.currency}${this._fmt(netAmt)}`)
        .attr('opacity', 0)
        .transition()
        .delay(DURATION * 0.4)
        .duration(300)
        .attr('opacity', 1);
      this.cursorLine.transition().duration(300).attr('opacity', 0);
    } else {
      rect.attr('width', bw);
      lbl
        .attr('x', x0 + bw + 8)
        .text(`Net Take-Home: ${this.currency}${this._fmt(netAmt)}`)
        .attr('opacity', 1);
      this.cursorLine.attr('opacity', 0);
    }

    this.rows.push({
      type: 'net',
      id: 'net',
      amount: netAmt,
      direction: 'right',
      grp,
      rect,
      lbl,
    });
    this._updateHeight();
    return this;
  }

  // ─── Remove last row (for Prev) ────────────────────────────────

  removeLastRow(animate = true) {
    if (this.rows.length === 0) return;
    const row = this.rows.pop();

    // Restore cursors
    if (row.type === 'employer') {
      this.employerCursor = row.prevCursor;
    } else if (row.type === 'employee') {
      this.employeeCursor = row.prevCursor;
    } else if (row.type === 'gross') {
      this.employeeCursor = 0;
    }
    // 'net' doesn't change cursors

    if (animate) {
      row.lbl.transition().duration(200).attr('opacity', 0);
      if (row.type === 'employer') {
        const anchorX = this.xScale(row.prevCursor);
        row.rect
          .transition()
          .duration(400)
          .ease(EASE)
          .attr('x', anchorX)
          .attr('width', 0)
          .on('end', () => row.grp.remove());
      } else if (row.type === 'employee' && row.direction === 'left') {
        const anchorX = this.xScale(row.prevCursor);
        row.rect
          .transition()
          .duration(400)
          .ease(EASE)
          .attr('x', anchorX)
          .attr('width', 0)
          .on('end', () => row.grp.remove());
      } else {
        row.rect
          .transition()
          .duration(400)
          .ease(EASE)
          .attr('width', 0)
          .on('end', () => row.grp.remove());
      }

      // Restore cursor line
      if (row.type === 'employee' || row.type === 'net') {
        if (this.rows.length > 0) {
          this.cursorLine
            .transition()
            .duration(400)
            .ease(EASE)
            .attr('opacity', 0.5)
            .attr('x1', this.xScale(this.employeeCursor))
            .attr('x2', this.xScale(this.employeeCursor));
        } else {
          this.cursorLine.transition().duration(300).attr('opacity', 0);
        }
      }
    } else {
      row.grp.remove();
    }

    this._updateHeight();
  }

  // ─── Build a static snapshot (no animation) for comparison ──────

  static buildStatic(container, steps, options = {}) {
    const chart = new WaterfallChart(container, options);
    for (const step of steps) {
      if (step.type === 'gross') chart.addGrossBar(false);
      else if (step.type === 'employer')
        chart.addEmployerBar(step.id, step.amount, step.color, step.title, false);
      else if (step.type === 'employee')
        chart.addEmployeeBar(step.id, step.amount, step.color, step.title, step.direction, false);
      else if (step.type === 'net') chart.addNetBar(false);
    }
    return chart;
  }

  // ─── Clear / destroy ───────────────────────────────────────────

  clear() {
    this.g.selectAll('.wf-row').remove();
    this.rows = [];
    this.employerCursor = 0;
    this.employeeCursor = this.grossSalary;
    this.cursorLine.attr('opacity', 0);
    this._updateHeight();
  }

  destroy() {
    if (this.svg) this.svg.remove();
    this.rows = [];
  }
}
