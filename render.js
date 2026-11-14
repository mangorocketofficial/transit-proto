'use strict';
// 화면 그리기와 시각 효과. 게임 상태(stops, lines 등)는 index.html의 전역을 그대로 읽는다.

// ---------- 스프라이트 (Blender로 렌더링한 PNG) ----------
const SPR = {};
const SPR_NAMES = ['house0', 'house1', 'house2', 'house3', 'office0', 'office1', 'office2', 'office3',
  'shop0', 'shop1', 'shop2', 'shop3', 'tree0', 'tree1', 'bus', 'train', 'ferry'];
let sprReady = false, bgDirty = true, bgCanvas = null, cityLights = [];
(function loadSprites() {
  let left = SPR_NAMES.length;
  for (const n of SPR_NAMES) {
    const im = new Image();
    im.onload = () => { im.ok = true; if (--left === 0) sprReady = true; };
    im.onerror = () => { if (--left === 0) sprReady = true; };
    im.src = 'sprites/' + n + '.png';
    SPR[n] = im;
  }
})();

function hexRgb(hex) { const v = parseInt(hex.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
function hexA(hex, a) { const [r, g, b] = hexRgb(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
// 흰색 쪽으로 t만큼 섞는다
function lighten(hex, t) { const [r, g, b] = hexRgb(hex).map(v => Math.round(v + (255 - v) * t)); return 'rgb(' + r + ',' + g + ',' + b + ')'; }

// 회색조 스프라이트를 색으로 물들인다(그림자와 투명도는 그대로)
function tintSprite(img, color) {
  const cvs = document.createElement('canvas');
  cvs.width = img.width; cvs.height = img.height;
  const g = cvs.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, cvs.width, cvs.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0);
  return cvs;
}
const vehicleCache = {};
function vehicleSprite(name, color) {
  const key = name + color;
  if (!vehicleCache[key] && SPR[name].ok) vehicleCache[key] = tintSprite(SPR[name], lighten(color, 0.18));
  return vehicleCache[key];
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------- 배경 지도: 판이 바뀔 때 한 번만 그려 둔다 ----------
const BG_S = 2, UNIT = 15;   // UNIT: Blender 1단위가 화면에서 차지하는 크기
function buildBg() {
  bgCanvas = document.createElement('canvas');
  bgCanvas.width = W * BG_S; bgCanvas.height = H * BG_S;
  const g = bgCanvas.getContext('2d');
  g.scale(BG_S, BG_S);
  const land = g.createLinearGradient(0, 0, W, H);
  land.addColorStop(0, '#e8e3d0'); land.addColorStop(1, '#dbe3cc');
  g.fillStyle = land; g.fillRect(0, 0, W, H);
  // 들판 얼룩과 잔 무늬
  for (let i = 0; i < 26; i++) {
    g.fillStyle = 'rgba(150,185,120,' + (0.10 + Math.random() * 0.12) + ')';
    g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 25 + Math.random() * 60, 18 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(90,100,60,0.07)';
    g.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
  }

  // 강
  const riverPath = () => { g.beginPath(); river.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  const half = city.half;        // 물의 반폭: 강은 좁고 만은 넓다
  riverPath(); g.strokeStyle = '#cdc6a4'; g.lineWidth = half * 2 + 7; g.stroke();
  riverPath(); g.strokeStyle = '#74b3e3'; g.lineWidth = half * 2; g.stroke();
  riverPath(); g.strokeStyle = '#93c8ef'; g.lineWidth = half * 0.9; g.stroke();

  // 산: 등고선처럼 겹친 타원과 눈 덮인 봉우리
  if (mountain) {
    const m = mountain, layers = [[1, '#b9b08a'], [0.82, '#a59a72'], [0.62, '#93875f'], [0.42, '#857a58'], [0.22, '#e9eef0']];
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(m.x + 7, m.y + 9, m.rx, m.ry, 0, 0, Math.PI * 2); g.fill();
    for (const [k, col] of layers) {
      g.fillStyle = col; g.beginPath(); g.ellipse(m.x - (1 - k) * 12, m.y - (1 - k) * 10, m.rx * k, m.ry * k, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(70,60,35,0.25)'; g.lineWidth = 1; g.stroke();
    }
  }

  const items = [];
  cityLights = [];
  const kinds = { R: 'house', O: 'office', C: 'shop', V: 'office' };
  for (const d of districts) {
    if (d.built === false) continue;      // 신도시의 예정지는 아직 빈 땅
    // 바닥과 길
    g.save();
    g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.clip();
    g.fillStyle = lighten(d.color, 0.72); g.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    const cell = 22, offX = Math.random() * cell, offY = Math.random() * cell;
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3.5;
    for (let x = d.x - d.r - cell + offX; x < d.x + d.r + cell; x += cell) { g.beginPath(); g.moveTo(x, d.y - d.r); g.lineTo(x, d.y + d.r); g.stroke(); }
    for (let y = d.y - d.r - cell + offY; y < d.y + d.r + cell; y += cell) { g.beginPath(); g.moveTo(d.x - d.r, y); g.lineTo(d.x + d.r, y); g.stroke(); }
    g.restore();
    g.strokeStyle = hexA(d.color, 0.55); g.lineWidth = 2.5;
    g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.stroke();
    // 건물: 길 사이 칸마다 하나씩
    const tinted = [0, 1, 2, 3].map(i => SPR[kinds[d.type] + i].ok ? tintSprite(SPR[kinds[d.type] + i], lighten(d.color, 0.6)) : null);
    for (let x = d.x - d.r - cell + offX + cell / 2; x < d.x + d.r; x += cell) {
      for (let y = d.y - d.r - cell + offY + cell / 2; y < d.y + d.r; y += cell) {
        if (Math.hypot(x - d.x, y - d.y) > d.r - 11) continue;
        const roll = Math.random();
        if (roll < 0.10) continue;
        const treeChance = d.type === 'R' ? 0.24 : d.type === 'C' ? 0.14 : 0.06;
        if (roll < 0.10 + treeChance) items.push({ img: SPR['tree' + (Math.random() < 0.5 ? 0 : 1)], x, y, size: 2.4 * UNIT });
        else {
          items.push({ img: tinted[Math.floor(Math.random() * 4)], x, y, size: 6 * UNIT, building: true });
          if (Math.random() < 0.7) cityLights.push({ x: x + Math.random() * 6 - 3, y: y + Math.random() * 6 - 3 });
        }
      }
    }
  }
  // 구역 밖 나무
  for (let i = 0; i < 70; i++) {
    const p = { x: Math.random() * W, y: Math.random() * H };
    if (districts.some(d => dist(d, p) < d.r + 12)) continue;
    if (river.length && Math.abs(p.x - river[5].x) < city.half + 18) continue;
    if (mountain && Math.hypot((p.x - mountain.x) / (mountain.rx + 14), (p.y - mountain.y) / (mountain.ry + 14)) < 1) continue;
    items.push({ img: SPR['tree' + (i % 2)], x: p.x, y: p.y, size: 2.4 * UNIT * (0.8 + Math.random() * 0.5) });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (!it.img || !(it.img.ok || it.img.getContext)) continue;
    g.globalAlpha = it.building ? 0.62 : 0.85;     // 건물은 배경으로 물러나게: 승객과 노선이 먼저 보여야 한다
    g.drawImage(it.img, it.x - it.size / 2, it.y - it.size / 2, it.size, it.size);
  }
  g.globalAlpha = 1;

  // 구역 이름표
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 12px sans-serif';
  for (const d of districts) {
    if (d.built === false) continue;
    const y = Math.min(H - 12, d.y + d.r - 2), tw = d.type === 'V' ? 46 : 38;
    g.fillStyle = 'rgba(255,255,255,0.92)'; roundRect(g, d.x - tw / 2, y - 9, tw, 18, 9); g.fill();
    g.strokeStyle = d.color; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = d.color; g.fillText(TYPE_NAME[d.type], d.x, y + 0.5);
  }
}

// ---------- 시각 효과 ----------
const FX = { parts: [], rings: [], floats: [], shake: 0, flash: 0 };
function fxBurst(x, y, color, n, spd) {
  if (FX.parts.length > 500) return;
  for (let i = 0; i < (n || 8); i++) {
    const a = Math.random() * Math.PI * 2, v = (spd || 70) * (0.4 + Math.random() * 0.8);
    FX.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0, max: 0.45 + Math.random() * 0.35, color, size: 1.6 + Math.random() * 2 });
  }
}
function fxRing(x, y, color, maxR, life, width) {
  if (FX.rings.length > 120) return;
  FX.rings.push({ x, y, color, maxR: maxR || 30, life: 0, max: life || 0.6, width: width || 3 });
}
function fxFloat(x, y, text, color) {
  if (FX.floats.length > 80) return;
  FX.floats.push({ x, y, text, color, life: 0, max: 0.8 });
}
function fxUpdate(dt) {
  for (const p of FX.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.vx *= 0.97; }
  FX.parts = FX.parts.filter(p => p.life < p.max);
  for (const r of FX.rings) r.life += dt;
  FX.rings = FX.rings.filter(r => r.life < r.max);
  for (const f of FX.floats) f.life += dt;
  FX.floats = FX.floats.filter(f => f.life < f.max);
  FX.shake = Math.max(0, FX.shake - dt * 1.6);
  FX.flash = Math.max(0, FX.flash - dt * 1.2);
}

const PIER_STYLE = { color: '#1f4e79' };   // 선착장은 어느 구역에도 속하지 않는다

// ---------- 그리기 ----------
function lineOffset(l) {
  const k = (lines.indexOf(l) % 7) - 3;
  return { x: k * 2.5, y: k * 2.5 };
}

// 구간 a-b가 강과 만나는 점들
function riverHits(a, b) {
  const out = [];
  for (let i = 1; i < river.length; i++) {
    const c = river[i - 1], d = river[i];
    if (!segCross(a, b, c, d)) continue;
    const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

// 해질녘 정도: 0(낮) ~ 1(하루 끝)
function duskLevel() {
  const f = clock / DAY;
  return f < 0.65 ? 0 : Math.min(1, (f - 0.65) / 0.3);
}

function draw(t) {
  const dt = Math.min(0.05, Math.max(0, t - (draw.last || t)));
  draw.last = t;
  fxUpdate(dt);
  if (bgDirty) { if (sprReady) { buildBg(); bgDirty = false; } else bgCanvas = null; }

  const c = ctx, s = scale * dpr;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#d5d9c2'; c.fillRect(0, 0, cv.width, cv.height);
  const sx = FX.shake ? (Math.random() - 0.5) * 12 * FX.shake : 0, sy = FX.shake ? (Math.random() - 0.5) * 12 * FX.shake : 0;
  c.setTransform(s, 0, 0, s, (ox + sx) * dpr, (oy + sy) * dpr);
  c.save();
  c.beginPath(); c.rect(0, 0, W, H); c.clip();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineCap = 'round';

  if (bgCanvas) c.drawImage(bgCanvas, 0, 0, W, H);
  else { c.fillStyle = '#e4e0cf'; c.fillRect(0, 0, W, H); }

  // 강물 반짝임
  c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.6; c.setLineDash([9, 30]);
  const half = city.half, lanes = half > 20 ? [-0.7, -0.35, 0.05, 0.4, 0.75] : [-0.33, 0.45];
  lanes.forEach((k, n) => {
    c.lineDashOffset = -t * (11 + n * 3) + n * 17;
    c.beginPath(); river.forEach((p, i) => i ? c.lineTo(p.x + k * half, p.y) : c.moveTo(p.x + k * half, p.y)); c.stroke();
  });
  c.setLineDash([]); c.lineDashOffset = 0;

  // 시간대 빛: 아침은 따뜻하게, 저녁은 어둑하게. 노선과 차량은 이 위에 그려서 또렷하게 남는다
  const f = clock / DAY, dusk = duskLevel();
  if (f < 0.3) { c.fillStyle = 'rgba(255,186,110,' + (0.17 * (1 - f / 0.3)) + ')'; c.fillRect(0, 0, W, H); }
  if (dusk > 0) {
    c.fillStyle = 'rgba(34,30,92,' + (0.42 * dusk) + ')'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,214,120,' + Math.min(1, dusk * 1.4) + ')';
    for (const p of cityLights) c.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
  }

  // 다리(버스 노선이 강을 건너는 자리)
  for (const l of lines) {
    if (l.mode !== 'bus') continue;
    const o = lineOffset(l);
    for (let i = 1; i < l.stops.length; i++) {
      const a = l.stops[i - 1], b = l.stops[i], ang = Math.atan2(b.y - a.y, b.x - a.x);
      for (const p of riverHits(a, b)) {
        c.save(); c.translate(p.x + o.x, p.y + o.y); c.rotate(ang);
        c.fillStyle = 'rgba(0,0,0,0.22)'; roundRect(c, -17, -4, 36, 13, 3); c.fill();
        c.fillStyle = '#9a7b55'; roundRect(c, -18, -6.5, 36, 13, 3); c.fill();
        c.strokeStyle = '#6f5637'; c.lineWidth = 1.5; c.stroke();
        c.restore();
      }
    }
  }

  // 노선
  for (const l of lines) {
    if (l.stops.length < 1) continue;
    c.globalAlpha = focusOn && l !== sel ? 0.13 : 1;     // 한 노선만 보기: 나머지는 흐리게
    const o = lineOffset(l), m = MODES[l.mode], pts = l.stops.map(p => ({ x: p.x + o.x, y: p.y + o.y }));
    const live = drawing && l === sel && pointer;
    const path = extra => { c.beginPath(); if (extra && drawHead) c.moveTo(pointer.x, pointer.y); pts.forEach((p, i) => i || (extra && drawHead) ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); if (extra && !drawHead) c.lineTo(pointer.x, pointer.y); };
    if (l === sel) { path(live); c.strokeStyle = 'rgba(255,205,40,' + (0.45 + 0.2 * Math.sin(t * 5)) + ')'; c.lineWidth = m.w + 9; c.stroke(); }
    path(); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = m.w + 3; c.stroke();
    path(); c.strokeStyle = l.color; c.lineWidth = m.w; c.stroke();
    if (l.mode === 'sub') { path(); c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.5; c.setLineDash([6, 7]); c.stroke(); c.setLineDash([]); }
    if (l.mode === 'ferry') { path(); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; c.setLineDash([1, 7]); c.stroke(); c.setLineDash([]); }
    if (l.mode === 'exp') { path(); c.strokeStyle = '#fff3c4'; c.lineWidth = 2; c.stroke(); }
    if (live) {
      const end = drawHead ? pts[0] : pts[pts.length - 1];
      c.beginPath(); c.moveTo(end.x, end.y); c.lineTo(pointer.x, pointer.y);
      c.strokeStyle = l.color; c.lineWidth = m.w; c.setLineDash([7, 7]); c.lineDashOffset = -t * 30; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
    }
    // 구간 끌기: 잡은 구간을 점선으로 손가락까지 휘어 보인다
    if (dragSeg && dragSeg.l === l && pointer && pts[dragSeg.k + 1]) {
      const a = pts[dragSeg.k], b = pts[dragSeg.k + 1];
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = m.w + 4; c.stroke();
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(pointer.x, pointer.y); c.lineTo(b.x, b.y);
      c.strokeStyle = l.color; c.lineWidth = m.w; c.setLineDash([7, 7]); c.lineDashOffset = -t * 30; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
      c.fillStyle = l.color; c.beginPath(); c.arc(pointer.x, pointer.y, 6, 0, Math.PI * 2); c.fill();
    }
    // 지하철이 강 밑으로 지나는 자리: 물에 잠긴 것처럼 덮는다
    if (l.mode === 'sub') {
      for (let i = 1; i < l.stops.length; i++) {
        const a = l.stops[i - 1], b = l.stops[i], ang = Math.atan2(b.y - a.y, b.x - a.x);
        for (const p of riverHits(a, b)) {
          c.save(); c.translate(p.x + o.x, p.y + o.y); c.rotate(ang);
          const tl = half + 2;   // 물 폭만큼 잠긴 것처럼 덮는다
          c.fillStyle = 'rgba(116,179,227,0.78)'; c.fillRect(-tl, -m.w / 2 - 2.5, tl * 2, m.w + 5);
          c.restore();
        }
      }
    }
  }
  c.globalAlpha = 1;

  // 구역별 만족도: 이름표 옆에 색 알약으로
  c.font = 'bold 10px sans-serif';
  for (const d of districts) {
    if (!stops.some(s => s.d === d.id)) continue;
    const v = Math.round(d.sat), y = Math.min(H - 12, d.y + d.r - 2), x = d.x + 36;
    c.fillStyle = v >= 70 ? '#2f8f5b' : v >= 45 ? '#d98a00' : '#d64545';
    roundRect(c, x - 14, y - 8, 30, 16, 8); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#fff'; c.fillText(v + '%', x + 1, y + 0.5);
  }

  // 신도시: 예정지는 점선으로, 지금 고를 수 있는 곳은 강조해서
  for (const d of districts) {
    if (d.built !== false) continue;
    const pickable = siteChoice && siteChoice.includes(d.id);
    c.setLineDash([7, 6]); c.lineDashOffset = pickable ? -t * 14 : 0;
    c.strokeStyle = hexA(d.color, pickable ? 1 : 0.5); c.lineWidth = pickable ? 4 : 2;
    c.fillStyle = hexA(d.color, pickable ? 0.22 + 0.08 * Math.sin(t * 5) : 0.06);
    c.beginPath(); c.arc(d.x, d.y, d.r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.setLineDash([]); c.lineDashOffset = 0;
    c.font = 'bold 13px sans-serif'; c.lineWidth = 3; c.strokeStyle = '#fff'; c.fillStyle = d.color;
    const label = TYPE_NAME[d.type] + ' 예정지';
    c.strokeText(label, d.x, d.y - 8); c.fillText(label, d.x, d.y - 8);
    if (pickable) { c.font = 'bold 12px sans-serif'; c.strokeText('눌러서 착공', d.x, d.y + 10); c.fillText('눌러서 착공', d.x, d.y + 10); }
  }
  if (siteChoice) {
    c.font = 'bold 14px sans-serif';
    const text = '다음에 개발할 예정지를 고르세요', tw = c.measureText(text).width + 26;
    c.fillStyle = 'rgba(24,28,36,0.92)'; roundRect(c, W / 2 - tw / 2, 10, tw, 28, 14); c.fill();
    c.fillStyle = '#fff'; c.fillText(text, W / 2, 24.5);
  }
  // 축제 도시: 행사 중인 경기장 위에 남은 시간을 띄운다
  if (city.eventEnd && clock < city.eventEnd * DAY) {
    const d = districts.find(x => x.type === 'V');
    if (d) {
      const text = (clock >= city.eventStart * DAY ? '행사 중 · ' : '행사 예정 · ') + Math.ceil(city.eventEnd * DAY - clock) + '초 뒤 종료';
      c.font = 'bold 11px sans-serif';
      const tw = c.measureText(text).width + 14, y = Math.max(12, d.y - d.r - 4);
      c.fillStyle = '#d6336c'; roundRect(c, d.x - tw / 2, y - 9, tw, 18, 9); c.fill();
      c.fillStyle = '#fff'; c.fillText(text, d.x, y + 0.5);
    }
  }

  // 곧 생길 정류장 예고
  if (pendingStop) {
    const pulse = 11 + Math.sin(t * 6) * 1.5;
    c.strokeStyle = pendingStop.d.color; c.lineWidth = 2.5; c.setLineDash([4, 4]); c.lineDashOffset = -t * 12;
    c.beginPath(); c.arc(pendingStop.x, pendingStop.y, pulse, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(pendingStop.x, pendingStop.y, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#333'; c.font = 'bold 10px sans-serif';
    c.fillText(Math.ceil(Math.max(0, stopTimer)), pendingStop.x, pendingStop.y + 0.5);
  }

  // 정류장과 기다리는 승객
  for (const st of stops) {
    const d = districts[st.d] || PIER_STYLE, cap = capOf(st);
    if (st.pier) {   // 물 쪽으로 뻗은 나무 부두
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(Math.min(st.x, st.x - st.side * 22) + 1, st.y - 3, 22, 9);
      c.fillStyle = '#a5855c'; c.fillRect(Math.min(st.x, st.x - st.side * 22), st.y - 5, 22, 9);
      c.strokeStyle = '#7a5f3c'; c.lineWidth = 1; c.strokeRect(Math.min(st.x, st.x - st.side * 22), st.y - 5, 22, 9);
    }
    // 같은 프레임 안에서 생긴 정류장은 born이 t보다 살짝 클 수 있다
    const age = Math.max(0.001, t - (st.born || 0)), grow = age < 0.45 ? 1 + 0.5 * Math.sin(Math.min(1, age / 0.45) * Math.PI) * (1 - age / 0.45) : 1;
    const k = Math.min(1, age / 0.25) * grow;
    let x = st.x, y = st.y;
    if (st.over > 0.6) { x += Math.sin(t * 40) * 1.2; }
    if (dusk > 0) {   // 가로등 빛
      const glow = c.createRadialGradient(x, y, 2, x, y, 26);
      glow.addColorStop(0, 'rgba(255,225,150,' + 0.5 * dusk + ')'); glow.addColorStop(1, 'rgba(255,225,150,0)');
      c.fillStyle = glow; c.beginPath(); c.arc(x, y, 26, 0, Math.PI * 2); c.fill();
    }
    if (st.wait.length > cap) {
      const pr = 14 + ((t * 1.4) % 1) * 16;
      c.strokeStyle = 'rgba(224,32,32,' + (1 - (t * 1.4) % 1) * 0.7 + ')'; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, pr, 0, Math.PI * 2); c.stroke();
    }
    const R = (st.hub ? 14 : 10) * k;
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.arc(x + 1.5, y + 2.5, R + 2, 0, Math.PI * 2); c.fill();
    if (st.hub) {
      c.fillStyle = '#fff'; c.strokeStyle = '#1d2330'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(x, y, R + 2, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.fillStyle = '#fff'; c.strokeStyle = d.color; c.lineWidth = 4;
    c.beginPath(); c.arc(x, y, (st.hub ? 9 : 10) * k, 0, Math.PI * 2); c.fill(); c.stroke();
    if (st.hub) { c.fillStyle = '#1d2330'; c.font = 'bold 10px sans-serif'; c.fillText('⇄', x, y + 0.5); }
    else if (st.pier) { c.fillStyle = PIER_STYLE.color; c.font = 'bold 11px sans-serif'; c.fillText('⚓', x, y + 0.5); }
    if (st.over > 0) {
      const blink = st.over > 0.6 && Math.floor(t * 6) % 2 === 0;
      c.strokeStyle = blink ? '#fff' : '#e02020'; c.lineWidth = 5;
      c.beginPath(); c.arc(x, y, st.hub ? 21 : 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, st.over)); c.stroke();
    }
    const ox2 = st.hub ? 24 : 20, shown = Math.min(st.wait.length, 20);
    if (shown) {
      // 흰 판 위에 올려서 건물 위에서도 또렷하게
      const cols = Math.min(shown, 5), rows = Math.ceil(shown / 5), more = st.wait.length > 20;
      const pw = cols * 8.5 + 6 + (more ? 16 : 0), ph = rows * 8.5 + 6;
      c.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(c, x + ox2 - 6.5, y - 11.5, pw, ph, 5); c.fill();
      c.fillStyle = '#fff'; roundRect(c, x + ox2 - 8, y - 13.5, pw, ph, 5); c.fill();
      c.strokeStyle = st.wait.length > cap ? '#e02020' : 'rgba(40,46,58,0.55)'; c.lineWidth = 1.2; c.stroke();
      for (let i = 0; i < shown; i++) {
        const px = x + ox2 - 0.5 + (i % 5) * 8.5, py = y - 6 + Math.floor(i / 5) * 8.5;
        c.fillStyle = districts[st.wait[i].dest].color;
        c.beginPath(); c.arc(px, py, 3.5, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(20,24,30,0.75)'; c.lineWidth = 0.9; c.stroke();
      }
      if (more) { c.fillStyle = '#c01818'; c.font = 'bold 9px sans-serif'; c.fillText('+' + (st.wait.length - 20), x + ox2 + cols * 8.5 + 4, y - 13.5 + ph / 2); }
    }
    if (st.wait.length > cap) {
      c.font = 'bold 11px sans-serif'; c.lineWidth = 3; c.strokeStyle = '#fff'; c.fillStyle = '#c01818';
      c.strokeText(st.wait.length + '명', x, y - (st.hub ? 24 : 20)); c.fillText(st.wait.length + '명', x, y - (st.hub ? 24 : 20));
    }
  }

  // 차량
  for (const l of lines) {
    const o = lineOffset(l), m = MODES[l.mode], isSub = l.mode === 'sub', isFerry = l.mode === 'ferry', isExp = l.mode === 'exp', isCable = l.mode === 'cable';
    const spr = isCable ? null : vehicleSprite(isSub || isExp ? 'train' : isFerry ? 'ferry' : 'bus', l.color);
    const dim = focusOn && l !== sel, cap = modeCap(l.mode);
    for (const v of l.vehicles) {
      c.globalAlpha = dim ? 0.15 : 1;
      const a = l.stops[v.i], b = l.stops[v.j == null ? v.i : v.j];
      if (!a || !b) continue;
      const te = v.t * v.t * (3 - 2 * v.t);     // 출발과 도착을 부드럽게
      const x = a.x + (b.x - a.x) * te + o.x, y = a.y + (b.y - a.y) * te + o.y;
      const ang = a !== b ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
      const len = isExp ? 68 : isSub ? 44 : isFerry ? 34 : isCable ? 16 : 26, wid = isSub || isExp ? 13 : isFerry ? 13.5 : 12;
      if (isFerry && v.t > 0.02 && v.t < 0.98 && Math.random() < 0.35) {   // 배 뒤로 남는 물거품
        fxBurst(x - Math.cos(ang) * len / 2, y - Math.sin(ang) * len / 2, 'rgba(255,255,255,0.85)', 1, 14);
      }
      c.save(); c.translate(x, y); c.rotate(ang);
      c.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(c, -len / 2 + 1.5, -wid / 2 + 3, len, wid, 3); c.fill();
      if (dusk > 0.2 && v.t > 0 && v.t < 1) {   // 전조등
        const beam = c.createLinearGradient(len / 2, 0, len / 2 + 26, 0);
        beam.addColorStop(0, 'rgba(255,240,170,' + 0.6 * dusk + ')'); beam.addColorStop(1, 'rgba(255,240,170,0)');
        c.fillStyle = beam; c.beginPath(); c.moveTo(len / 2, -3); c.lineTo(len / 2 + 26, -10); c.lineTo(len / 2 + 26, 10); c.lineTo(len / 2, 3); c.fill();
      }
      if (spr) {
        if (isExp) { for (const x0 of [-34.5, -12, 10.5]) c.drawImage(spr, x0, -8.5, 24, 17); }   // 세 칸
        else if (isSub) {   // 두 칸
          c.drawImage(spr, -23.5, -8.5, 24, 17);
          c.drawImage(spr, -0.5, -8.5, 24, 17);
        } else if (isFerry) c.drawImage(spr, -18.9, -9.45, 37.8, 18.9);
        else c.drawImage(spr, -len * 0.6, -len * 0.3, len * 1.2, len * 0.6);
      } else { c.fillStyle = isCable ? '#f4f1e6' : l.color; roundRect(c, -len / 2, -wid / 2, len, wid, 3); c.fill(); if (isCable) { c.fillStyle = l.color; c.fillRect(-len / 2, -1.5, len, 3); } }
      c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 1.4; roundRect(c, -len / 2, -wid / 2, len, wid, 3); c.stroke();
      c.restore();
      // 탑승 인원(항상 똑바로)
      const full = v.load.length >= cap;
      const label = v.load.length + '/' + cap;
      c.font = 'bold 10px sans-serif';
      const lw = c.measureText(label).width + 8, ly = y - 15;
      c.fillStyle = full ? '#d63030' : 'rgba(24,28,36,0.9)'; roundRect(c, x - lw / 2, ly - 7, lw, 14, 7); c.fill();
      c.fillStyle = '#fff'; c.fillText(label, x, ly + 0.5);
    }
  }
  c.globalAlpha = 1;

  // 효과
  for (const r of FX.rings) {
    const k = r.life / r.max;
    c.strokeStyle = r.color; c.globalAlpha = 1 - k; c.lineWidth = r.width * (1 - k * 0.6);
    c.beginPath(); c.arc(r.x, r.y, 6 + (r.maxR - 6) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2); c.stroke();
  }
  for (const p of FX.parts) {
    c.globalAlpha = 1 - p.life / p.max; c.fillStyle = p.color;
    c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
  }
  c.font = 'bold 13px sans-serif';
  for (const fl of FX.floats) {
    const k = fl.life / fl.max;
    c.globalAlpha = 1 - k * k; c.lineWidth = 3; c.strokeStyle = '#fff'; c.fillStyle = fl.color;
    c.strokeText(fl.text, fl.x, fl.y - 16 - k * 26); c.fillText(fl.text, fl.x, fl.y - 16 - k * 26);
  }
  c.globalAlpha = 1;

  if (FX.flash > 0) { c.fillStyle = 'rgba(210,30,30,' + 0.45 * FX.flash + ')'; c.fillRect(0, 0, W, H); }

  // 안내 문구
  if (msg && performance.now() < msgUntil) {
    c.font = 'bold 14px sans-serif';
    const tw = c.measureText(msg).width + 26;
    c.fillStyle = 'rgba(24,28,36,0.92)'; roundRect(c, W / 2 - tw / 2, H - 44, tw, 28, 14); c.fill();
    c.fillStyle = '#fff'; c.fillText(msg, W / 2, H - 29.5);
  }
  c.restore();
}
