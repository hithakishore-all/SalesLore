#!/usr/bin/env python3
"""Record the SalesLore captioned walkthrough video from the REAL app (offline mode, fictional data).

Usage (from the repo root):
  python3 scripts/video/record.py            # records frames + chapters into build/video/
  python3 scripts/video/encode.py            # encodes docs/video/saleslore-walkthrough.mp4
Needs: Python Playwright with Chromium (pip install playwright && playwright install chromium), ffmpeg.
Set CHROME=/path/to/chrome to use an installed Chrome instead.
"""
import asyncio, base64, json, os, shutil, socket, subprocess, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'build' / 'video'
FRAMES = OUT / 'frames'
OVERLAY = (Path(__file__).parent / 'overlay.js').read_text()

PEOPLE = {
    'Dana': ('Dana Whitfield · sales manager', '#3FCB97'),
    'Maya': ('Maya Okafor · departing AE', '#FFB627'),
    'Leo':  ('Leo Brandt · successor AE', '#7DB4FF'),
}
TOTAL = 16  # numbered steps (title and closing cards are not numbered)

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

class Rec:
    def __init__(self, page, cdp):
        self.page, self.cdp = page, cdp
        self.t0 = None; self.frames = []; self.chapters = []; self.n = 0; self.step = 0

    async def start(self):
        FRAMES.mkdir(parents=True, exist_ok=True)
        self.cdp.on('Page.screencastFrame', self._frame)
        await self.cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 92, 'maxWidth': 1280, 'maxHeight': 800})
        self.t0 = time.monotonic()

    def _frame(self, ev):
        self.n += 1
        name = f'{self.n:06d}.jpg'
        (FRAMES / name).write_bytes(base64.b64decode(ev['data']))
        self.frames.append([name, time.monotonic() - self.t0])
        asyncio.ensure_future(self.cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']}))

    async def stop(self):
        await self.cdp.send('Page.stopScreencast')
        self.end = time.monotonic() - self.t0

    def now(self): return time.monotonic() - self.t0

    # ---- overlay helpers ----
    async def js(self, expr, *args): return await self.page.evaluate(expr, list(args))
    async def cap(self, who, title, body):
        self.step += 1
        label, color = PEOPLE[who]
        self.chapters.append({'t': round(self.now(), 2), 'step': self.step, 'who': who, 'color': color, 'title': title})
        await self.js('a => window.__fw.cap(a[0], a[1], a[2], a[3], a[4])', f'{self.step:02d} / {TOTAL}', label, title, body, color)
        await asyncio.sleep(0.6)
    async def card(self, html, chapter=None):
        if chapter: self.chapters.append({'t': round(self.now(), 2), 'step': 0, 'who': '', 'color': '#FFB627', 'title': chapter})
        await self.js('a => { window.__fw.nohl(); window.__fw.nocap(); window.__fw.card(a[0]); }', html)
    async def nocard(self): await self.js('() => window.__fw.nocard()'); await asyncio.sleep(0.6)
    async def nohl(self): await self.js('() => window.__fw.nohl()')

    async def _center(self, loc, inset=False):
        await loc.scroll_into_view_if_needed()
        b = await loc.bounding_box()
        x = b['x'] + (min(60, b['width'] / 2) if inset or b['width'] > 300 else b['width'] / 2)
        return x, b['y'] + b['height'] / 2

    async def to(self, loc):
        x, y = await self._center(loc)
        await self.js('a => window.__fw.cur(a[0], a[1])', x, y)
        await asyncio.sleep(0.85)
        return x, y

    async def click(self, loc):
        x, y = await self.to(loc)
        await self.js('a => window.__fw.ripple(a[0], a[1])', x, y)
        await asyncio.sleep(0.25)
        await loc.click()
        await asyncio.sleep(0.9)

    async def show(self, loc, label, secs=3.5, top=96):
        await loc.evaluate('(el, top) => { const r = el.getBoundingClientRect(); window.scrollBy({top: r.top - top, behavior: "smooth"}); }', top)
        await asyncio.sleep(0.7)
        b = await loc.bounding_box()
        await self.js('a => window.__fw.hl(a[0], a[1], a[2], a[3], a[4])', b['x'], b['y'], b['width'], min(b['height'], 800 - b['y'] - 20), label)
        await asyncio.sleep(secs)

    async def as_user(self, seller_id):
        sel = self.page.locator('#who')
        await self.to(sel)
        await self.js('a => window.__fw.ripple(a[0], a[1])', *(await self._center(sel)))
        await sel.select_option(seller_id)
        await asyncio.sleep(0.9)

    async def go(self, hash_):
        await self.click(self.page.locator(f'#nav a[href="#{hash_}"]'))
        await self.page.evaluate('() => window.scrollTo(0, 0)')
        await asyncio.sleep(0.4)


async def story(r: Rec, p):
    L = p.locator
    await p.wait_for_selector('.stats')
    # Title
    await r.card("""{{LOGO}}<h1>SalesLore</h1><div class="fw-tag">Your best sellers' knowledge. Never lost.</div>
      <p>When a top AE leaves, SalesLore keeps what they knew about each account and how they worked, as cited briefs a manager approves for the next seller.</p>
      <div class="fw-small">A 3-minute walkthrough of the working app · no sound · all companies, people and numbers are fictional</div>""", 'Title')
    await asyncio.sleep(5.5)
    await r.nocard()

    # Dana: overview
    await r.cap('Dana', "Maya's book moves to Leo", 'Maya, a top AE, leaves on Nov 27. Leo inherits 10 accounts worth $1.99M. Dana owns the handoff.')
    await r.show(L('.stats'), 'Inherited pipeline · readiness', 4)
    await r.cap('Dana', 'Readiness for every account', 'Each account shows whether its knowledge is ready, at risk, unknown, or stopped.')
    await r.show(L('table'), 'Ready · At risk · Stop · Unknown', 4.5)
    await r.nohl()

    # Maya: Seller DNA
    await r.as_user('maya')
    await r.go('sellers')
    await r.cap('Maya', 'Maya approved how she works', 'Patterns distilled from her calls and emails. She reviewed each one before anything was kept.')
    await r.show(L('.pattern').nth(0), 'PS-01 · cited, approved by Maya', 4)
    await r.cap('Maya', 'Her rejected step is never coached', '"Discount 10% at quarter end" happened, but Maya rejected it as a practice. SalesLore will never teach it.')
    await r.show(L('.pattern.rejected'), 'Rejected by Maya', 4)
    await r.nohl()

    # Dana: run agents on Brightwater
    await r.as_user('dana')
    await r.go('transfers')
    await r.click(L('[data-pick="brightwater"]'))
    await r.cap('Dana', 'Agents draft a cited brief', 'Discover, Research, Compose, Validate. Every claim must point to a call, an email or a CRM field.')
    await r.click(L('#run'))
    await r.show(L('.stages'), 'Discover → Research → Compose → Validate', 1.5, top=110)
    await p.wait_for_selector('#approve', timeout=20000)
    await r.cap('Dana', 'It rejects an uncited claim', '"Champion has approved budget" came from notes with no evidence. Validate rejects it, Compose retries, the brief passes.')
    await r.show(L('#runlog .bad').first, 'Rejected: no evidence', 4.5, top=200)
    await r.cap('Dana', 'Only the owner approves', 'Dana approves the brief for Leo. Approving publishes it to him. It sends nothing to the customer.')
    await r.click(L('#approve'))
    await r.show(L('#approve-box'), 'Approved by Dana · nothing sent', 3.5, top=200)
    await r.nohl()

    # Leo: tries to approve
    await r.as_user('leo')
    await r.click(L('[data-pick="halcyon"]'))
    await r.click(L('#run'))
    await p.wait_for_selector('#approve', timeout=20000)
    await r.cap('Leo', "Leo can't approve his own brief", 'Approval is owner-only. When Leo tries, SalesLore refuses and records the attempt.')
    await r.click(L('#approve'))
    await r.show(L('#approve-box'), 'Refused: not the owner', 3.5, top=200)
    await r.nohl()

    # Dana: Pinecrest stop
    await r.as_user('dana')
    await r.click(L('[data-pick="pinecrest"]'))
    await r.cap('Dana', 'It stops when the customer says stop', 'Pinecrest asked for no contact until their audit closes. Every outreach step is removed and it escalates to Dana.')
    await r.click(L('#run'))
    await p.wait_for_function("() => document.querySelector('#approve-box h2')?.textContent.startsWith('Escalated')", timeout=20000)
    await r.show(L('#approve-box'), 'Stop rule · escalated', 4, top=200)
    await r.nohl()

    # Leo: the brief
    await r.as_user('leo')
    await r.go('accounts')
    await r.click(L('[data-pick="halcyon"]'))
    await r.cap('Leo', 'Leo inherits a dossier, not a CRM dump', 'Who really decides, what Maya promised, the open risk, and next steps the way she worked.')
    await r.show(L('.dossier ul').first, 'The CFO decides, not the VP of IT', 4)
    await r.cap('Leo', 'Every claim has a receipt', 'Click any yellow evidence ID to see the exact source, who said it and when.')
    await r.click(L('.dossier .rc').first)
    await r.show(L('.dossier .receipt').first, 'Call · Priya Nair, CFO · Sep 18', 4, top=220)
    await r.show(L('.dossier ol').first, "Next steps · tagged with Maya's patterns", 3.5, top=160)
    await r.nohl()

    # Leo: graph
    await r.go('graph')
    await r.cap('Leo', 'The context graph behind it', 'People, deals, promises, risks and pattern steps, linked in Postgres. Each edge carries its evidence.')
    await r.click(L('[data-node="person:C-001"]'))
    await r.show(L('svg.graph'), 'Halcyon Freight · context graph', 3.5, top=90)
    await r.show(L('#node-detail'), 'Priya Nair · evidence', 3, top=240)
    await r.click(L('[data-pick="tidewater"]'))
    await r.cap('Leo', 'Unknown stays unknown', 'Tidewater has no calls and thin notes. SalesLore shows the decision maker, budget and timeline as unknown.')
    await r.show(L('svg.graph'), 'Dashed = unknown, never guessed', 4, top=90)
    await r.nohl()

    # Leo: Companion in Slack
    await r.go('companion')
    await r.cap('Leo', 'Ask in Slack, get receipts', 'The Companion lives in Slack. Every answer comes from approved knowledge, with evidence IDs.')
    await r.click(L('[data-ask="Who really decides at Halcyon?"]'))
    await r.show(L('#msgs .msg').last, 'Answer with receipts', 4, top=260)
    await r.cap('Leo', 'The stop rule holds in Slack too', 'Asked for next steps at Pinecrest, the Companion says no outreach and points to the owner.')
    await r.click(L('[data-ask="/saleslore next Pinecrest Bank"]'))
    await r.show(L('#msgs .msg').last, 'Stop · no outreach', 4, top=300)
    await r.nohl()

    # Dana: ledger
    await r.as_user('dana')
    await r.go('governance')
    await r.cap('Dana', 'Every step is on the record', "Agent steps, approvals and Leo's refused approval are all in the Evidence Ledger.")
    await r.show(L('table'), 'Evidence Ledger', 5, top=110)
    await r.nohl()

    # Closing
    await r.card("""{{LOGO}}<h1>SalesLore</h1><div class="fw-tag">Most sales AI learns from what your organization does.<br>SalesLore preserves what your best people know.</div>
      <div class="fw-links">github.com/hithakishore-all/SalesLore</div>
      <div class="fw-small">Postgres context graph · cited agent briefs · owner-only approval · Slack Companion · fictional data</div>""", 'Try it yourself')
    await asyncio.sleep(6)


async def main():
    if OUT.exists(): shutil.rmtree(OUT)
    FRAMES.mkdir(parents=True)
    port = free_port()
    env = {**os.environ, 'PORT': str(port), 'SALESLORE_HOST': '127.0.0.1', 'MODEL': 'scripted', 'SLACK_BOT_TOKEN': '', 'SLACK_APP_TOKEN': ''}
    server = subprocess.Popen(['node', 'src/index.js', '--offline', '--no-slack'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    try:
        for _ in range(100):
            try:
                socket.create_connection(('127.0.0.1', port), 0.2).close(); break
            except OSError: time.sleep(0.1)
        async with async_playwright() as pw:
            kw = {'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}
            browser = await pw.chromium.launch(**kw)
            ctx = await browser.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
            await ctx.add_init_script(OVERLAY)
            await ctx.add_init_script("try{localStorage.setItem('saleslore-user','dana');localStorage.removeItem('fw-cap')}catch(e){}")
            page = await ctx.new_page()
            await page.goto(f'http://127.0.0.1:{port}/#overview')
            await page.wait_for_selector('.stats')
            await page.wait_for_timeout(1500)  # fonts
            cdp = await ctx.new_cdp_session(page)
            r = Rec(page, cdp)
            await r.start()
            await story(r, page)
            await r.stop()
            await browser.close()
        (OUT / 'timeline.json').write_text(json.dumps({'frames': r.frames, 'end': r.end}, indent=1))
        (OUT / 'chapters.json').write_text(json.dumps(r.chapters, indent=1))
        print(f'recorded {len(r.frames)} frames, {r.end:.1f}s, {len(r.chapters)} chapters -> {OUT}')
    finally:
        server.terminate()

if __name__ == '__main__':
    asyncio.run(main())
