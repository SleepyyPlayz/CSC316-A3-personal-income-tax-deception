// scroll-controller.js — IntersectionObserver entrance animations + progress bar

export class ScrollController {
  constructor() {
    this.observers = [];
    this._initProgressBar();
    this._initSectionAnimations();
  }

  _initProgressBar() {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    document.body.prepend(bar);
    this.progressBar = bar;

    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      this.progressBar.style.width = pct + '%';
    }, { passive: true });
  }

  _initSectionAnimations() {
    const sections = document.querySelectorAll('.section');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });

    sections.forEach(s => observer.observe(s));
    this.observers.push(observer);
  }

  onEnterView(selector, callback, opts = {}) {
    const threshold = opts.threshold || 0.3;
    const once = opts.once !== false;
    const el = document.querySelector(selector);
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          callback(entry.target);
          if (once) observer.unobserve(entry.target);
        }
      });
    }, { threshold });

    observer.observe(el);
    this.observers.push(observer);
  }

  destroy() {
    this.observers.forEach(o => o.disconnect());
    if (this.progressBar) this.progressBar.remove();
  }
}
