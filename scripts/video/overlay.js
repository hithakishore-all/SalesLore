// Walkthrough overlay for the SalesLore demo video: caption card, highlight box, cursor, title cards.
// Injected by scripts/video/record.py. Everything is prefixed "fw-" so it never collides with app styles.
(() => {
  if (window.top !== window) return;
  const css = `
  #fw-cap{position:fixed;left:24px;bottom:24px;width:480px;background:#0E2A25;color:#fff;border-radius:12px;padding:16px 20px 18px;
    border-left:6px solid var(--fw-c,#FFB627);box-shadow:0 12px 40px rgba(0,0,0,.35);z-index:2147483600;font-family:"Libre Franklin",Helvetica,Arial,sans-serif;
    opacity:0;transform:translateY(10px);transition:opacity .35s,transform .35s;pointer-events:none}
  #fw-cap.fw-on{opacity:1;transform:none}
  #fw-cap .fw-step{font-family:"IBM Plex Mono",Menlo,monospace;font-size:12px;color:#FFB627;letter-spacing:.02em}
  #fw-cap .fw-title{font-size:21px;font-weight:700;margin:5px 0 4px;line-height:1.25}
  #fw-cap .fw-body{font-size:15px;line-height:1.45;color:#D7E5E0}
  #fw-hl{position:fixed;border:3px solid #FFB627;border-radius:10px;box-shadow:0 0 0 6px rgba(255,182,39,.22),0 0 28px rgba(255,182,39,.45);
    z-index:2147483500;pointer-events:none;opacity:0;transition:all .55s cubic-bezier(.2,.8,.2,1)}
  #fw-hl.fw-on{opacity:1}
  #fw-hl .fw-tab{position:absolute;left:-3px;top:-30px;background:#FFB627;color:#14231F;font:600 13px "Libre Franklin",Arial,sans-serif;
    padding:4px 10px;border-radius:7px 7px 7px 0;white-space:nowrap}
  #fw-hl.fw-below .fw-tab{top:auto;bottom:-30px;border-radius:0 7px 7px 7px}
  #fw-cur{position:fixed;left:640px;top:400px;width:26px;height:26px;z-index:2147483646;pointer-events:none;
    transition:left .75s cubic-bezier(.25,.8,.25,1),top .75s cubic-bezier(.25,.8,.25,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
  .fw-rip{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border:3px solid #FFB627;border-radius:50%;z-index:2147483645;pointer-events:none;
    animation:fw-rip .6s ease-out forwards}
  @keyframes fw-rip{to{transform:scale(3.4);opacity:0}}
  #fw-card{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(1200px 700px at 30% 20%,#13755F 0%,#0F5C50 45%,#0A3D35 100%);color:#fff;opacity:0;transition:opacity .5s;pointer-events:none;
    font-family:"Libre Franklin",Helvetica,Arial,sans-serif;text-align:center}
  #fw-card.fw-on{opacity:1}
  #fw-card .fw-in{max-width:820px;padding:0 40px}
  #fw-card svg{width:96px;height:96px}
  #fw-card h1{font-size:64px;letter-spacing:-.02em;margin:18px 0 4px}
  #fw-card .fw-tag{font-size:26px;color:#FFB627;font-weight:600;margin-bottom:22px}
  #fw-card p{font-size:21px;line-height:1.5;color:#E3F1EC;margin:0 0 14px}
  #fw-card .fw-small{font-size:15px;color:#B9D6CD;margin-top:26px}
  #fw-card .fw-links{font-family:"IBM Plex Mono",Menlo,monospace;font-size:17px;color:#fff;line-height:1.9;margin-top:14px}
  body.fw-carding #fw-cur{opacity:0}`;
  const LOGO = `<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#FFFFFF" fill-opacity=".14"/><g stroke="#FFF" stroke-width="3.5" stroke-linecap="round" fill="none"><path d="M32 21 L19 39"/><path d="M32 21 L45 39"/><path d="M19 39 L32 49"/><path d="M45 39 L32 49"/></g><circle cx="32" cy="19" r="7.5" fill="#FFB627"/><circle cx="19" cy="40" r="5.5" fill="#FFF"/><circle cx="45" cy="40" r="5.5" fill="#FFF"/><circle cx="32" cy="49.5" r="4.5" fill="#DCF5E6"/></svg>`;
  const store = { get(k) { try { return JSON.parse(localStorage.getItem('fw-' + k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem('fw-' + k, JSON.stringify(v)); } catch {} } };

  function build() {
    if (document.getElementById('fw-cap')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    document.body.insertAdjacentHTML('beforeend', `<div id="fw-cap"><div class="fw-step"></div><div class="fw-title"></div><div class="fw-body"></div></div>
      <div id="fw-hl"><span class="fw-tab"></span></div>
      <svg id="fw-cur" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.5 16 L12.5 24 L16 22.5 L12 14.8 L19.5 14.8 Z" fill="#fff" stroke="#14231F" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <div id="fw-card"><div class="fw-in"></div></div>`);
    const c = store.get('cap'); if (c) cap(c.step, c.who, c.title, c.body, c.color, true);
    const p = store.get('cur'); if (p) { const el = document.getElementById('fw-cur'); el.style.transition = 'none'; el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px'; requestAnimationFrame(() => (el.style.transition = '')); }
  }
  function cap(step, who, title, body, color, instant) {
    const el = document.getElementById('fw-cap');
    el.style.setProperty('--fw-c', color || '#FFB627');
    el.querySelector('.fw-step').textContent = `${step} · ${who}`;
    el.querySelector('.fw-title').textContent = title;
    el.querySelector('.fw-body').textContent = body;
    if (instant) el.classList.add('fw-on'); else { el.classList.remove('fw-on'); void el.offsetWidth; el.classList.add('fw-on'); }
    store.set('cap', { step, who, title, body, color });
  }
  function nocap() { document.getElementById('fw-cap').classList.remove('fw-on'); store.set('cap', null); }
  function cur(x, y) { const el = document.getElementById('fw-cur'); el.style.left = x + 'px'; el.style.top = y + 'px'; store.set('cur', [x, y]); }
  function ripple(x, y) { const r = document.createElement('div'); r.className = 'fw-rip'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }
  function hl(x, y, w, h, label) {
    const el = document.getElementById('fw-hl'); const pad = 6;
    el.style.left = x - pad + 'px'; el.style.top = y - pad + 'px'; el.style.width = w + pad * 2 + 'px'; el.style.height = h + pad * 2 + 'px';
    el.classList.toggle('fw-below', y < 50);
    el.querySelector('.fw-tab').textContent = label || ''; el.querySelector('.fw-tab').style.display = label ? '' : 'none';
    el.classList.add('fw-on');
  }
  function nohl() { document.getElementById('fw-hl').classList.remove('fw-on'); }
  function card(html) { const el = document.getElementById('fw-card'); el.querySelector('.fw-in').innerHTML = html.replace('{{LOGO}}', LOGO); el.classList.add('fw-on'); document.body.classList.add('fw-carding'); }
  function nocard() { document.getElementById('fw-card').classList.remove('fw-on'); document.body.classList.remove('fw-carding'); }
  window.__fw = { cap, nocap, cur, ripple, hl, nohl, card, nocard };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
