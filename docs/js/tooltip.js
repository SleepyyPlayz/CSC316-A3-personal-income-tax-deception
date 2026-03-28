// tooltip.js — Custom D3 tooltip for bar slices

export class Tooltip {
  constructor() {
    this.el = d3.select('body').append('div')
      .attr('class', 'tax-tooltip')
      .style('opacity', 0)
      .style('pointer-events', 'none');
  }

  show(event, data) {
    const fmt = (v) => {
      if (Math.abs(v) >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
      return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    };

    let html = `<div class="tt-title">${data.label}</div>`;
    if (data.meta?.rate !== undefined) {
      html += `<div class="tt-row"><span class="tt-label">Rate:</span> ${(data.meta.rate * 100).toFixed(2)}%</div>`;
    }
    html += `<div class="tt-row"><span class="tt-label">Amount:</span> ${data.amount < 0 ? '−' : ''}${data.currency || ''}${fmt(Math.abs(data.amount))}</div>`;
    if (data.meta?.appliedTo !== undefined) {
      html += `<div class="tt-row"><span class="tt-label">Applied to:</span> ${data.currency || ''}${fmt(data.meta.appliedTo)}</div>`;
    }
    if (data.meta?.cap !== undefined) {
      html += `<div class="tt-row"><span class="tt-label">Cap:</span> ${data.meta.cap ? data.currency + fmt(data.meta.cap) : 'None'}</div>`;
    }
    if (data.meta?.deductible !== undefined) {
      html += `<div class="tt-row"><span class="tt-label">Deductible:</span> ${data.meta.deductible ? 'Yes' : 'No'}</div>`;
    }

    this.el.html(html)
      .style('opacity', 1);

    this._position(event);
  }

  move(event) {
    this._position(event);
  }

  hide() {
    this.el.style('opacity', 0);
  }

  _position(event) {
    const ttNode = this.el.node();
    const ttW = ttNode.offsetWidth;
    const ttH = ttNode.offsetHeight;
    let x = (event.touches ? event.touches[0].pageX : event.pageX) + 14;
    let y = (event.touches ? event.touches[0].pageY : event.pageY) - ttH - 10;
    if (x + ttW > window.innerWidth + window.scrollX) x -= ttW + 28;
    if (y < window.scrollY) y += ttH + 24;
    this.el.style('left', x + 'px').style('top', y + 'px');
  }

  destroy() {
    this.el.remove();
  }
}
