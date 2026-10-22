// Cinematic layer, loaded by motion.ts (so only when motion is welcome). Smooth wheel scrolling, the cursor,
// rolling button labels, opening images, word-by-word headings and the homepage's scroll effects.
// Every effect starts from the plain, readable page; the CSS hides nothing unless .motion-on is set.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)', EASE_IO = 'cubic-bezier(.625,.05,0,1)';
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const wide = () => innerWidth >= 1024;

// ---------- Smooth wheel scrolling. Touch keeps native scrolling; keyboard, anchors and sticky all still work. ----------
const lenis = new Lenis({ autoRaf: false, anchors: { offset: -90 }, lerp: 0.11 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
addEventListener('dhd:menu', (e) => ((e as CustomEvent<boolean>).detail ? lenis.stop() : lenis.start()));
// Base.astro's back-to-top button uses this when it exists, so it glides with the rest of the page.
(window as unknown as { dhdLenis?: Lenis }).dhdLenis = lenis;

// Positions read once, before any writes (see motion.ts for why).
const vh = innerHeight;
const below = (el: Element) => el.getBoundingClientRect().top > vh * 0.9;

// ---------- Buttons: wrap each label so it can roll up while a copy rolls in. ----------
document.querySelectorAll<HTMLElement>('.btn').forEach((b) => {
  const t = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent!.trim());
  if (!t) return;
  const text = t.textContent!.trim();
  const lbl = Object.assign(document.createElement('span'), { className: 'lbl' });
  const inner = document.createElement('span');
  inner.dataset.t = text; inner.textContent = text;
  lbl.append(inner);
  t.replaceWith(lbl, ' ');
});

// ---------- Cursor: a blue dot with a little lag. Over a picture link it shows a small "Read" tag beside the pointer;
// over cards full of text it stays a dot (they lift on hover), so it never sits on the words being read. ----------
if (fine) {
  const c = document.querySelector<HTMLElement>('.cursor');
  if (c) {
    const label = c.querySelector('span')!;
    const x = gsap.quickTo(c, 'x', { duration: 0.35, ease: 'power3.out' }), y = gsap.quickTo(c, 'y', { duration: 0.35, ease: 'power3.out' });
    addEventListener('pointermove', (e) => { c.classList.add('on'); x(e.clientX); y(e.clientY); }, { passive: true });
    document.addEventListener('pointerleave', () => c.classList.remove('on'));
    addEventListener('pointerdown', () => c.classList.add('press'));
    addEventListener('pointerup', () => c.classList.remove('press'));
    const TARGETS = '.slide .sPic, .card .thumb, .stackCard .pic, .nextChapter, .leadThumb, [data-cursor]';
    document.addEventListener('pointerover', (e) => {
      const t = (e.target as Element).closest<HTMLElement>(TARGETS);
      c.classList.toggle('view', !!t);
      if (t) label.textContent = t.dataset.cursor || 'Read →';
    });
  }
}

// ---------- Images open from a cropped frame while easing out of a zoom. ----------
document.querySelectorAll<HTMLElement>('.leadThumb, .card .thumb, .rthumb, .prose figure, .stackCard .pic, .slide').forEach((el) => {
  if (!below(el)) return;
  el.setAttribute('data-img-reveal', '');
  ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => el.classList.add('opened') });
});

// ---------- Headings rise word by word out of masks. ----------
document.querySelectorAll<HTMLElement>('.secHead h2, .pageHead h1, .stackHead h2, .pinLeft h2, .board h2, .giantLead').forEach((h) => {
  const split = SplitText.create(h, { type: 'words', mask: 'words' });
  const play = () => gsap.from(split.words, { yPercent: 100, opacity: 0.5, duration: 0.8, ease: 'cubic-bezier(.19,1,.22,1)', stagger: 0.07 });
  if (below(h)) ScrollTrigger.create({ trigger: h, start: 'top 88%', once: true, onEnter: play });
  else play();
});

// ---------- Footer columns fade up one by one; dark calls to action wipe open from the top. ----------
document.querySelectorAll<HTMLElement>('[data-footer-cols]').forEach((el) => ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => el.classList.add('in') }));
document.querySelectorAll<HTMLElement>('.wipeOpen').forEach((el) => {
  if (!below(el)) { el.classList.add('opened'); return; }
  ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => el.classList.add('opened') });
});

// ---------- Stat circle: rolls through the Digest's numbers every two seconds. ----------
document.querySelectorAll<HTMLElement>('[data-statroll]').forEach((el) => {
  const lists = el.querySelectorAll<HTMLElement>('ul');
  const n = lists[0]?.children.length || 0;
  if (n < 2) return;
  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    i = (i + 1) % n;
    lists.forEach((ul) => { ul.style.transform = `translateY(-${(i * 100) / n}%)`; });
  }, 2200);
});

// ---------- Image reel: the pill-shaped frame grows to fill the screen as you scroll through it. ----------
document.querySelectorAll<HTMLElement>('[data-reel]').forEach((reel) => {
  const frame = reel.querySelector<HTMLElement>('.reelFrame');
  const cap = reel.querySelector<HTMLElement>('.reelCap');
  const label = reel.querySelector<HTMLElement>('.reelLabel');
  const imgs = [...reel.querySelectorAll<HTMLImageElement>('.reelFrame img')];
  if (!frame || innerWidth < 760) return;
  gsap.timeline({ scrollTrigger: { trigger: reel, start: 'top top', end: 'bottom bottom', scrub: 0.6 } })
    .to(frame, { width: '100vw', height: '100vh', maxHeight: '100vh', borderRadius: 0, ease: 'none', duration: 1 }, 0)
    .to(label, { opacity: 0, y: -30, duration: 0.25 }, 0)
    // The caption arrives once the frame is nearly full, so it never spills past the frame's edge.
    .fromTo(cap, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.22 }, 0.78);
  // Pictures cross-fade while the reel is on screen.
  let k = 0, timer = 0;
  imgs[0]?.classList.add('on');
  ScrollTrigger.create({
    trigger: reel, start: 'top bottom', end: 'bottom top',
    onToggle: (st) => {
      clearInterval(timer);
      if (st.isActive && imgs.length > 1) timer = window.setInterval(() => { imgs[k].classList.remove('on'); k = (k + 1) % imgs.length; imgs[k].classList.add('on'); }, 2400);
    },
  });
});

// ---------- Stacked chapters: as the next card covers one, it shrinks back and darkens. ----------
document.querySelectorAll<HTMLElement>('[data-stack]').forEach((stack) => {
  const cards = [...stack.querySelectorAll<HTMLElement>('.stackCard')];
  if (innerWidth < 760) return;
  cards.forEach((card, i) => {
    const nextCard = cards[i + 1];
    if (!nextCard) return;
    gsap.timeline({ scrollTrigger: { trigger: nextCard, start: 'top bottom', end: 'top 30%', scrub: true } })
      .to(card, { scale: 0.92, ease: 'none' }, 0)
      .to(card.querySelector('.shade'), { opacity: 0.35, ease: 'none' }, 0);
  });
  stack.querySelectorAll<SVGPathElement>('.draw path').forEach((p) => {
    gsap.fromTo(p, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, ease: EASE_OUT, scrollTrigger: { trigger: p.closest('.stackCard'), start: 'top 75%', once: true } });
  });
});

// ---------- Marquee: speed and direction follow how fast, and which way, you scroll. ----------
document.querySelectorAll<HTMLElement>('.marquee .track').forEach((track) => {
  track.style.animation = 'none';
  const loop = gsap.to(track, { xPercent: -50, duration: 50, ease: 'none', repeat: -1 });
  let dir = 1;
  ScrollTrigger.create({
    trigger: track, start: 'top bottom', end: 'bottom top',
    onUpdate: (st) => {
      dir = st.direction;
      const boost = 1 + Math.min(6, Math.abs(st.getVelocity()) / 400);
      gsap.to(loop, { timeScale: dir * boost, duration: 0.25, overwrite: true, onComplete: () => { gsap.to(loop, { timeScale: dir, duration: 1.2 }); } });
    },
    onToggle: (st) => loop.paused(!st.isActive),
  });
});

// ---------- Giant word: each letter settles from blurred and scattered into place as you scroll. ----------
document.querySelectorAll<HTMLElement>('[data-giant]').forEach((h) => {
  const split = SplitText.create(h, { type: 'chars', charsClass: 'ch' });
  gsap.fromTo(split.chars,
    { yPercent: () => gsap.utils.random(-60, 60), rotation: () => gsap.utils.random(-18, 18), opacity: 0.15, filter: 'blur(10px)' },
    { yPercent: 0, rotation: 0, opacity: 1, filter: 'blur(0px)', ease: 'none', stagger: 0.04, scrollTrigger: { trigger: h, start: 'top 95%', end: 'center 55%', scrub: 0.8 } });
});

// ---------- Carousel cards slide in once when the row first comes into view (no pinning: the page keeps scrolling). ----------
document.querySelectorAll<HTMLElement>('[data-track]').forEach((track) => {
  const section = track.closest<HTMLElement>('.carousel');
  if (!section || !below(section)) return;
  gsap.from(track.querySelectorAll('.slide'), { y: 30, opacity: 0, duration: 0.8, ease: EASE_OUT, stagger: 0.08, scrollTrigger: { trigger: section, start: 'top 80%', once: true } });
});

// ---------- Timeline board: phase bars fill and a playhead sweeps across as the section scrolls. ----------
document.querySelectorAll<HTMLElement>('[data-board]').forEach((board) => {
  const phases = [...board.querySelectorAll<HTMLElement>('.phase')];
  const head = board.querySelector<HTMLElement>('.playhead');
  const grid = board.querySelector<HTMLElement>('.boardGrid');
  if (innerWidth < 760 || !phases.length) { board.classList.add('static'); phases.forEach((p) => p.querySelector<HTMLElement>('.bar i')?.style.setProperty('--fill', '1')); return; }
  const total = 6;
  ScrollTrigger.create({
    trigger: board, start: 'top top', end: 'bottom bottom', scrub: true,
    onUpdate: (st) => {
      const week = st.progress * total;
      phases.forEach((p) => {
        const s = Number(p.dataset.s), w = Number(p.dataset.w);
        const f = gsap.utils.clamp(0, 1, (week - s) / w);
        p.querySelector<HTMLElement>('.bar i')!.style.setProperty('--fill', String(f));
        p.classList.toggle('active', week >= s && week < s + w);
      });
      if (head && grid) head.style.setProperty('--ph', `${st.progress * (grid.clientWidth - 232)}px`);
      board.style.setProperty('--gx', `${20 + st.progress * 60}%`);
    },
  });
});

// Fonts and images can shift layout after load; keep the pinned chapters measured correctly.
addEventListener('load', () => ScrollTrigger.refresh());
document.fonts?.ready.then(() => ScrollTrigger.refresh());
export { lenis, EASE_IO };
