#!/usr/bin/env python3
"""Encode build/video/frames into docs/video/saleslore-walkthrough.mp4 (+ poster and chapters).
Also writes build/video/contact-*.jpg sheets (4 frames each, ~3 s into each chapter) for a quick visual check."""
import json, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'build' / 'video'
DEST = ROOT / 'docs' / 'video'
tl = json.loads((OUT / 'timeline.json').read_text())
chapters = json.loads((OUT / 'chapters.json').read_text())
frames, end = tl['frames'], tl['end']

lines = ['ffconcat version 1.0']
for i, (name, t) in enumerate(frames):
    nxt = frames[i + 1][1] if i + 1 < len(frames) else end
    lines += [f"file 'frames/{name}'", f'duration {max(nxt - t, 0.001):.4f}']
lines.append(f"file 'frames/{frames[-1][0]}'")
(OUT / 'frames.ffconcat').write_text('\n'.join(lines) + '\n')

def frame_at(t):
    best = frames[0][0]
    for name, ft in frames:
        if ft <= t: best = name
        else: break
    return OUT / 'frames' / best

# Contact sheets for checking
picks = [frame_at(c['t'] + 3) for c in chapters]
for n in range(0, len(picks), 4):
    group = picks[n:n + 4]
    while len(group) < 4: group.append(group[-1])
    args = sum([['-i', str(g)] for g in group], [])
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args, '-filter_complex',
                    '[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack,scale=1280:-1', str(OUT / f'contact-{n // 4 + 1}.jpg')], check=True)

DEST.mkdir(parents=True, exist_ok=True)
part = DEST / 'saleslore-walkthrough.part.mp4'
res = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(OUT / 'frames.ffconcat'),
                      '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', '-an', str(part)])
if res.returncode != 0:
    sys.exit('ffmpeg failed; the previous video (if any) was left in place.')
part.replace(DEST / 'saleslore-walkthrough.mp4')

poster_ch = next((c for c in chapters if c['title'].startswith('Every claim has a receipt')), chapters[len(chapters) // 2])
shutil.copy(frame_at(poster_ch['t'] + 6), DEST / 'saleslore-walkthrough-poster.jpg')
(DEST / 'chapters.json').write_text(json.dumps(chapters, indent=1) + '\n')
size = (DEST / 'saleslore-walkthrough.mp4').stat().st_size / 1e6
print(f'wrote docs/video/saleslore-walkthrough.mp4 ({size:.1f} MB, {end:.0f}s), poster and chapters.json')
