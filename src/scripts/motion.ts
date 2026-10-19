// The motion layer. Loaded by Base.astro only when motion is welcome
// (not for prefers-reduced-motion, data-saver or 2G), once the browser is idle after the page has drawn.
// Every effect starts from content that is already visible and correct, so if this file never arrives, nothing is lost.
// Scroll effects are all "once, on entering view", so the browser's IntersectionObserver drives them (no scroll plugin).
import { gsap } from 'gsap';

const root = document.documentElement;
root.classList.add('motion-on');
const ease = 'power3.out';
const once = (key: string) => {
  try { if (sessionStorage.getItem(key)) return false; sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
  return true;
};
const onScreenNow = (el: Element) => el.getBoundingClientRect().top < innerHeight;

/** Runs cb the first time any part of el scrolls into view. (A negative margin here would strand content at the very bottom of a page.) */
const enter = (() => {
  // One element can carry several effects (a topic tile reveals and draws its sparkline), so keep a list per element.
  const cbs = new Map<Element, (() => void)[]>();
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    cbs.get(e.target)?.forEach((cb) => cb());
    cbs.delete(e.target);
  }));
  return (el: Element, cb: () => void) => {
    const list = cbs.get(el);
    if (list) list.push(cb); else { cbs.set(el, [cb]); io.observe(el); }
  };
})();

// ---------- Logo: the heartbeat draws, the line runs on, the name rises. Once per visit. ----------
document.querySelectorAll<SVGSVGElement>('.logo-animate').forEach((svg) => {
  if (!once('dhd-logo')) return;
  const beat = svg.querySelector('.logo-beat'), run = svg.querySelector('.logo-run'), words = svg.querySelectorAll('.logo-words text');
  gsap.timeline({ defaults: { ease: 'power2.inOut' } })
    .fromTo(beat, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9 })
    .fromTo(run, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7 }, '-=0.15')
    .from(words, { opacity: 0, y: 40, duration: 0.6, stagger: 0.12, ease }, '-=0.6');
});

// ---------- Reveals: content rises into place as it scrolls into view, staggered within each group. ----------
// (The hero headline and intro rise in pure CSS, so they paint at once with no flash.)
document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
  const siblings = el.parentElement ? [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal')) : [el];
  el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 6) * 0.07}s`);
  if (onScreenNow(el)) requestAnimationFrame(() => el.classList.add('in'));
  else enter(el, () => el.classList.add('in'));
});

// ---------- Lines that keep a constant stroke width (vector-effect) reveal left to right with a clip. ----------
const sweepIn = (el: Element, duration: number, onComplete?: () => void) =>
  gsap.fromTo(el, { clipPath: 'inset(-20% 100% -20% 0)' }, { clipPath: 'inset(-20% 0% -20% 0)', duration, ease: 'power2.inOut', onComplete });
const sweepOnEnter = (el: Element, trigger: Element, duration: number, onComplete?: () => void) => {
  gsap.set(el, { clipPath: 'inset(-20% 100% -20% 0)' });
  enter(trigger, () => sweepIn(el, duration, onComplete));
};

// ---------- Heartbeat rules, the footer beat and topic sparklines sweep in on scroll. ----------
document.querySelectorAll<SVGPathElement>('[data-draw]').forEach((p) => sweepOnEnter(p.ownerSVGElement!, p.ownerSVGElement!, 1.6));
document.querySelectorAll<SVGPathElement>('[data-spark]').forEach((p) => sweepOnEnter(p.ownerSVGElement!, p.closest('a') || p.ownerSVGElement!, 1.3));

// ---------- Numbers further down the page count up as they arrive. (Ones already in view stay put.) ----------
document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
  const to = Number(el.dataset.count);
  if (!Number.isFinite(to) || to <= 0 || onScreenNow(el)) return;
  const obj = { v: 0 };
  const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
  el.textContent = fmt(0);
  enter(el, () => gsap.to(obj, { v: to, duration: 1.8, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(obj.v); } }));
});

// ---------- Countdown rings fill to the days left. ----------
document.querySelectorAll<SVGCircleElement>('[data-ring]').forEach((c) => {
  const li = c.closest('.oppCard') || c;
  if (onScreenNow(li)) return;
  gsap.set(c, { strokeDashoffset: Number(c.dataset.c) });
  enter(li, () => gsap.to(c, { strokeDashoffset: Number(c.dataset.ring), duration: 1.4, ease }));
});

// ---------- The hero's graph paper glows under the pointer. ----------
document.querySelectorAll<HTMLElement>('[data-glow]').forEach((el) => {
  if (!matchMedia('(hover: hover)').matches) return;
  const setX = gsap.quickTo(el, '--mx', { duration: 0.6, ease }), setY = gsap.quickTo(el, '--my', { duration: 0.6, ease });
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    setX(((e.clientX - r.left) / r.width) * 100); setY(((e.clientY - r.top) / r.height) * 100);
  });
});

// ---------- Magnetic primary buttons: they lean toward the pointer a little. ----------
document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
  if (!matchMedia('(hover: hover)').matches) return;
  const x = gsap.quickTo(el, 'x', { duration: 0.4, ease }), y = gsap.quickTo(el, 'y', { duration: 0.4, ease });
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    x((e.clientX - r.left - r.width / 2) * 0.25); y((e.clientY - r.top - r.height / 2) * 0.35);
  });
  el.addEventListener('pointerleave', () => { x(0); y(0); });
});
