// =============================================================================
// Forge — Wiki runtime script
// Loaded as a module by index.html. Initialises mermaid with a dark theme,
// wires the scroll progress bar, scrollspy, and smooth anchor scroll.
// @author Son Nguyen <hoangson091104@gmail.com>
// =============================================================================

import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

/* -----------------------------------------------------------------------------
   1. Mermaid — dark theme tuned to match the site palette
   -------------------------------------------------------------------------- */

mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  fontFamily: '"Inter",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif',
  themeVariables: {
    darkMode: true,
    background: 'transparent',
    primaryColor: '#0f1726',
    primaryTextColor: '#e0f2fe',
    primaryBorderColor: '#38bdf8',
    lineColor: '#3a4560',
    secondaryColor: '#1a1634',
    tertiaryColor: '#0c1a24',
    mainBkg: '#0f1726',
    nodeBorder: '#38bdf8',
    clusterBkg: 'rgba(10,14,20,0.5)',
    clusterBorder: '#26314a',
    titleColor: '#f4f6fa',
    edgeLabelBackground: '#0a0e14',
    textColor: '#e0f2fe',
    noteBkgColor: '#0f1726',
    noteTextColor: '#e0f2fe',
    noteBorderColor: '#38bdf8',
    actorBkg: '#0c1a24',
    actorBorder: '#22d3ee',
    actorTextColor: '#cffafe',
    signalColor: '#2dd4bf',
    signalTextColor: '#f4f6fa',
    labelBoxBkgColor: '#0f1726',
    labelBoxBorderColor: '#2dd4bf',
    labelTextColor: '#e0f2fe',
    loopTextColor: '#e0f2fe',
    altBackground: 'rgba(167,139,250,0.08)',
    sequenceNumberColor: '#001820',
  },
  sequence: {
    useMaxWidth: true,
    wrap: true,
    showSequenceNumbers: false,
    messageAlign: 'center',
    mirrorActors: false,
    boxMargin: 14,
    messageMargin: 48,
    actorFontSize: 16,
    messageFontSize: 15,
    noteFontSize: 14,
  },
  flowchart: {
    useMaxWidth: true,
    curve: 'basis',
    padding: 22,
    nodeSpacing: 60,
    rankSpacing: 80,
    // SVG-native labels: mermaid measures text with getBBox on real glyphs
    // (including emoji width) instead of a detached HTML div where emojis
    // collapse to 0. Fixes "forma" / "typechec" / "docker-buil" clipping.
    htmlLabels: false,
  },
  state: {
    useMaxWidth: true,
  },
});

/* -----------------------------------------------------------------------------
   2. Smooth anchor scrolling
   -------------------------------------------------------------------------- */

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* -----------------------------------------------------------------------------
   3. Scroll progress bar — rAF-throttled for smoothness
   -------------------------------------------------------------------------- */

const bar = document.getElementById('progress-bar');

const updateProgress = () => {
  const h = document.documentElement;
  const total = h.scrollHeight - h.clientHeight;
  const pct = total > 0 ? (h.scrollTop / total) * 100 : 0;
  if (bar) bar.style.width = pct + '%';
};

let progressRaf = 0;
window.addEventListener(
  'scroll',
  () => {
    if (progressRaf) return;
    progressRaf = requestAnimationFrame(() => {
      updateProgress();
      progressRaf = 0;
    });
  },
  { passive: true },
);
updateProgress();

/* -----------------------------------------------------------------------------
   4. Scrollspy — highlight the active nav link for the section in view.
   Uses IntersectionObserver; falls back to no highlight if unsupported.
   -------------------------------------------------------------------------- */

const navLinks = Array.from(document.querySelectorAll('.nav-links a'));
const sections = navLinks
  .map((a) => document.getElementById(a.getAttribute('href').slice(1)))
  .filter(Boolean);
const linkById = new Map(
  navLinks.map((a) => [a.getAttribute('href').slice(1), a]),
);

if ('IntersectionObserver' in window && sections.length) {
  const visible = new Set();

  const setActive = (id) => {
    navLinks.forEach((a) => a.classList.remove('active'));
    const a = linkById.get(id);
    if (!a) return;
    a.classList.add('active');

    // Keep the active link visible in the horizontal nav strip on mobile.
    const nav = a.parentElement;
    const ar = a.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    if (ar.left < nr.left + 20 || ar.right > nr.right - 20) {
      nav.scrollTo({
        left: a.offsetLeft - nav.clientWidth / 2 + a.clientWidth / 2,
        behavior: 'smooth',
      });
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      // Active = the first (topmost) visible section in document order.
      for (const section of sections) {
        if (visible.has(section.id)) {
          setActive(section.id);
          return;
        }
      }
    },
    { rootMargin: '-128px 0px -60% 0px', threshold: 0 },
  );

  sections.forEach((section) => io.observe(section));
}

/* -----------------------------------------------------------------------------
   5. Count-up animations for hero stats (and any `.cu` on the page).
   Respects reduced-motion — those users just see the final value.
   -------------------------------------------------------------------------- */

const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const animateCount = (el) => {
  const target = parseFloat(el.dataset.to);
  const decimals = parseInt(el.dataset.decimals || '0', 10);

  if (prefersReducedMotion || Number.isNaN(target)) {
    el.textContent = target.toFixed(decimals);
    return;
  }

  const duration = 1400;
  const start = performance.now();
  let frame = 0;

  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const value = target * easeOutCubic(t);
    el.textContent = value.toFixed(decimals);
    if (t < 1) {
      frame = requestAnimationFrame(tick);
    } else {
      el.textContent = target.toFixed(decimals);
      cancelAnimationFrame(frame);
    }
  };

  frame = requestAnimationFrame(tick);
};

const counters = document.querySelectorAll('.cu');
if ('IntersectionObserver' in window && counters.length) {
  const counterIO = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        animateCount(entry.target);
        counterIO.unobserve(entry.target);
      }
    },
    { threshold: 0.25 },
  );
  counters.forEach((c) => counterIO.observe(c));
} else {
  counters.forEach(animateCount);
}

/* -----------------------------------------------------------------------------
   6. Scroll-reveal — fade + slide on containers as they enter the viewport.
   Grids get a per-item stagger via a CSS custom property.
   -------------------------------------------------------------------------- */

const REVEAL_SELECTOR = [
  '.section-head',
  '.card',
  '.chart',
  '.kpi',
  '.table-wrap',
  '.code-win',
  '.mermaid-wrap',
  '.cta-block',
  '.toc',
  '.bar-row',
  '.hero-inner',
  '.hero-stat',
].join(',');

const revealTargets = document.querySelectorAll(REVEAL_SELECTOR);

revealTargets.forEach((el) => {
  el.setAttribute('data-reveal', '');
});

/* Stagger grid children so they reveal in a cascade, not a slab.
   Delays deliberately shallow and capped at item #5 so large grids don't
   take a full second before the last card appears — the user was
   previously waiting ~880ms for an 8-card grid to finish. */
document.querySelectorAll('.grid').forEach((grid) => {
  Array.from(grid.children).forEach((child, i) => {
    if (child.hasAttribute('data-reveal')) {
      child.style.setProperty('--reveal-delay', `${Math.min(i, 5) * 40}ms`);
    }
  });
});
document.querySelectorAll('.bars').forEach((bars) => {
  Array.from(bars.children).forEach((row, i) => {
    if (row.hasAttribute('data-reveal')) {
      row.style.setProperty('--reveal-delay', `${Math.min(i, 5) * 30}ms`);
    }
  });
});
/* Hero stats always cascade even though they're above the fold. */
document.querySelectorAll('.hero-stats').forEach((row) => {
  Array.from(row.children).forEach((stat, i) => {
    if (stat.hasAttribute('data-reveal')) {
      stat.style.setProperty('--reveal-delay', `${i * 50}ms`);
    }
  });
});

if ('IntersectionObserver' in window && revealTargets.length) {
  const revealIO = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealIO.unobserve(entry.target);
      }
    },
    // Trigger earlier: fire as soon as any pixel enters the viewport,
    // and pre-reveal a band above the fold (240px) so elements finish
    // animating right as the user scrolls them into view instead of
    // starting the animation only once they're already on screen.
    { threshold: 0, rootMargin: '0px 0px 240px 0px' },
  );
  revealTargets.forEach((el) => revealIO.observe(el));
} else {
  // No IO support — show everything up-front.
  revealTargets.forEach((el) => el.classList.add('is-visible'));
}
