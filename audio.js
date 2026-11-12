'use strict';
// 효과음과 배경음. 음원 파일 없이 Web Audio로 합성한다.
const AU = { ctx: null, muted: false, master: null, sfx: null, bgm: null, bgmFilter: null, noise: null,
  nextStep: 0, step: 0, key: 'am', lastPing: 0, lastWarn: 0 };

const midi = n => 440 * Math.pow(2, (n - 69) / 12);

function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  const ctx = AU.ctx = new C();
  const comp = ctx.createDynamicsCompressor();
  comp.connect(ctx.destination);
  AU.master = ctx.createGain(); AU.master.gain.value = AU.muted ? 0 : 0.9; AU.master.connect(comp);
  AU.sfx = ctx.createGain(); AU.sfx.gain.value = 0.8; AU.sfx.connect(AU.master);
  AU.bgmFilter = ctx.createBiquadFilter(); AU.bgmFilter.type = 'lowpass'; AU.bgmFilter.frequency.value = 7000;
  AU.bgmFilter.connect(AU.master);
  AU.bgm = ctx.createGain(); AU.bgm.gain.value = 0.55; AU.bgm.connect(AU.bgmFilter);
  // 배경음에만 거는 가벼운 메아리
  const delay = ctx.createDelay(1); delay.delayTime.value = 0.31;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  AU.bgm.connect(delay); delay.connect(fb); fb.connect(delay); fb.connect(AU.bgmFilter);
  // 잡음 버퍼(심벌, 바람 소리용)
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  AU.noise = buf;
  AU.nextStep = ctx.currentTime + 0.15;
}

function setMuted(m) {
  AU.muted = m;
  if (AU.ctx) AU.master.gain.setTargetAtTime(m ? 0 : 0.9, AU.ctx.currentTime, 0.03);
}

// 한 음: dest로 보내는 짧은 소리. slide가 있으면 그 주파수로 미끄러진다
function tone(dest, freq, dur, type, vol, at, slide, attack) {
  const ctx = AU.ctx, t = (at || ctx.currentTime), a = attack || 0.005;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseHit(dest, dur, vol, freq, at, type) {
  const ctx = AU.ctx, t = (at || ctx.currentTime);
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = AU.noise; src.loop = true;
  f.type = type || 'highpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random()); src.stop(t + dur + 0.02);
}

// ---------- 효과음 ----------
const PENTA = [0, 2, 4, 7, 9];
const sfxOn = () => AU.ctx && !AU.muted;

function sfxClick() { if (sfxOn()) tone(AU.sfx, 720, 0.05, 'triangle', 0.10); }
function sfxError() { if (sfxOn()) { tone(AU.sfx, 150, 0.16, 'square', 0.07); tone(AU.sfx, 110, 0.2, 'square', 0.06, AU.ctx.currentTime + 0.07); } }
// 노선에 정류장을 이을 때: 이을수록 음이 올라간다
function sfxConnect(n) {
  if (!sfxOn()) return;
  const note = 64 + PENTA[n % 5] + 12 * Math.floor(n / 5);
  tone(AU.sfx, midi(note), 0.28, 'triangle', 0.16);
  tone(AU.sfx, midi(note + 12), 0.18, 'sine', 0.05);
}
function sfxDeliver(k) {
  if (!sfxOn()) return;
  const t = AU.ctx.currentTime;
  if (t - AU.lastPing < 0.07) return;       // 한꺼번에 내릴 때 소리가 뭉치지 않게
  AU.lastPing = t;
  tone(AU.sfx, midi(84 + PENTA[k % 5]), 0.14, 'sine', 0.06);
}
function sfxNewStop() {
  if (!sfxOn()) return;
  const t = AU.ctx.currentTime;
  [72, 76, 79].forEach((n, i) => tone(AU.sfx, midi(n), 0.3, 'sine', 0.10, t + i * 0.08));
}
function sfxWarn() {
  if (!sfxOn()) return;
  const t = AU.ctx.currentTime;
  if (t - AU.lastWarn < 0.9) return;
  AU.lastWarn = t;
  tone(AU.sfx, 440, 0.12, 'square', 0.05); tone(AU.sfx, 440, 0.12, 'square', 0.05, t + 0.18);
}
function sfxPhase() {
  if (!sfxOn()) return;
  const t = AU.ctx.currentTime;
  tone(AU.sfx, midi(79), 0.9, 'sine', 0.09, t); tone(AU.sfx, midi(86), 1.1, 'sine', 0.05, t + 0.02);
}
function sfxDayEnd() {
  if (!sfxOn()) return;
  const t = AU.ctx.currentTime;
  [67, 72, 76, 79, 84].forEach((n, i) => tone(AU.sfx, midi(n), 0.35, 'triangle', 0.12, t + i * 0.09));
}
function sfxReward() {
  if (!sfxOn()) return;
  const t = AU.ctx.currentTime;
  [84, 88, 91, 96].forEach((n, i) => tone(AU.sfx, midi(n), 0.22, 'sine', 0.09, t + i * 0.05));
  noiseHit(AU.sfx, 0.35, 0.04, 6000, t);
}
function sfxHub() {
  if (!sfxOn()) return;
  const t = AU.ctx.currentTime;
  [60, 67, 72].forEach((n, i) => tone(AU.sfx, midi(n), 0.4, 'triangle', 0.13, t + i * 0.07));
}
function sfxUndo() { if (sfxOn()) tone(AU.sfx, 520, 0.14, 'triangle', 0.09, 0, 300); }
function sfxVehicle() { if (sfxOn()) { tone(AU.sfx, 300, 0.2, 'sawtooth', 0.05, 0, 520); noiseHit(AU.sfx, 0.2, 0.03, 1500); } }
function sfxOver() {
  if (!sfxOn()) return;
  const t = AU.ctx.currentTime;
  [64, 60, 57, 52, 45].forEach((n, i) => tone(AU.sfx, midi(n), 0.5, 'sawtooth', 0.07, t + i * 0.16));
  noiseHit(AU.sfx, 0.9, 0.08, 400, t, 'lowpass');
}

// ---------- 배경음 ----------
// 시간대마다 화음 진행과 빠르기가 다르다. 한 마디 = 16칸, 마디마다 화음 하나
const BGM = {
  am: { bpm: 104, chords: [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]], arp: [0, 3, 6, 8, 11, 14], kick: [0, 8], hat: true },
  mid: { bpm: 88, chords: [[41, 45, 48], [38, 41, 45], [46, 50, 53], [48, 52, 55]], arp: [0, 4, 8, 12], kick: [0], hat: false },
  pm: { bpm: 78, chords: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [40, 43, 47]], arp: [0, 6, 8, 14], kick: [], hat: false },
};

function bgmStep(step, t, tension) {
  const P = BGM[AU.key], bar = Math.floor(step / 16), s = step % 16;
  const ch = P.chords[bar % P.chords.length], sd = 60 / P.bpm / 4;
  if (s === 0) {
    // 깔리는 화음
    for (const n of ch) tone(AU.bgm, midi(n + 12), sd * 16, 'triangle', 0.035, t, 0, 0.5);
  }
  if (s === 0 || s === 8 || (AU.key === 'am' && s === 6)) tone(AU.bgm, midi(ch[0] - 12), sd * 3.2, 'sine', 0.16, t);
  const ai = P.arp.indexOf(s);
  if (ai >= 0) tone(AU.bgm, midi(ch[(ai + bar) % 3] + 24 + (ai % 2 ? 12 : 0)), sd * 2.4, 'triangle', 0.07, t);
  // 붐빌수록 잔음이 늘어난다
  if (tension > 0.3 && s % 2 === 1) tone(AU.bgm, midi(ch[(s + bar) % 3] + 36), sd * 1.2, 'sine', 0.03 + tension * 0.03, t);
  if (P.kick.includes(s)) tone(AU.bgm, 110, 0.16, 'sine', 0.2, t, 45);
  if ((P.hat || tension > 0.5) && s % 2 === 0) noiseHit(AU.bgm, 0.04, 0.02, 7000, t);
}

// 매 프레임 호출: 조금 앞의 박자까지 미리 예약한다
function bgmTick(key, tension, paused) {
  const ctx = AU.ctx;
  if (!ctx || ctx.state !== 'running') return;
  AU.bgmFilter.frequency.setTargetAtTime(paused ? 520 : 7000, ctx.currentTime, 0.15);
  if (AU.nextStep < ctx.currentTime) AU.nextStep = ctx.currentTime + 0.05;   // 탭이 쉬다 돌아왔을 때
  while (AU.nextStep < ctx.currentTime + 0.25) {
    if (AU.step % 16 === 0) AU.key = key;      // 화음 진행은 마디 경계에서만 바뀐다
    if (!AU.muted) bgmStep(AU.step, AU.nextStep, tension);
    AU.nextStep += 60 / BGM[AU.key].bpm / 4;
    AU.step++;
  }
}
