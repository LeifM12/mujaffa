'use strict';
// Lyd: alt syntetiseres med Web Audio – ingen lydfiler.
const Sfx = (() => {
  let ctx = null, master, eng, eng2, engF, engG, skidG, sirenO, sirenG, musicG, noiseBuf;
  let music = true, nextStep = 0, step = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Motor: sagtann + firkant gjennom lavpass
    engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 400;
    engG = ctx.createGain(); engG.gain.value = 0;
    eng = ctx.createOscillator(); eng.type = 'sawtooth';
    eng2 = ctx.createOscillator(); eng2.type = 'square';
    eng.connect(engF); eng2.connect(engF); engF.connect(engG); engG.connect(master);
    eng.start(); eng2.start();
    // Dekkhyl: filtrert støy
    const sk = ctx.createBufferSource(); sk.buffer = noiseBuf; sk.loop = true;
    const skF = ctx.createBiquadFilter(); skF.type = 'bandpass'; skF.frequency.value = 1800; skF.Q.value = 3;
    skidG = ctx.createGain(); skidG.gain.value = 0;
    sk.connect(skF); skF.connect(skidG); skidG.connect(master); sk.start();
    // Sirene
    sirenO = ctx.createOscillator(); sirenO.type = 'triangle';
    sirenG = ctx.createGain(); sirenG.gain.value = 0;
    sirenO.connect(sirenG); sirenG.connect(master); sirenO.start();
    musicG = ctx.createGain(); musicG.gain.value = music ? 0.5 : 0; musicG.connect(master);
    nextStep = ctx.currentTime + 0.1;
    setInterval(schedule, 25);
  }

  function update(speed01, throttle, skid, siren) {
    if (!ctx) return;
    const t = ctx.currentTime, f = 38 + speed01 * 95 + throttle * 12;
    eng.frequency.setTargetAtTime(f, t, 0.05);
    eng2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    engF.frequency.setTargetAtTime(300 + speed01 * 900 + throttle * 500, t, 0.08);
    engG.gain.setTargetAtTime(0.05 + throttle * 0.05 + speed01 * 0.03, t, 0.1);
    skidG.gain.setTargetAtTime(Math.min(0.16, skid * 0.16), t, 0.04);
    sirenG.gain.setTargetAtTime(0.06 * siren, t, 0.1);
    sirenO.frequency.setTargetAtTime(Math.floor(t * 2.2) % 2 ? 610 : 455, t, 0.01);
  }

  function silence() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const g of [engG, skidG, sirenG]) g.gain.setTargetAtTime(0, t, 0.05);
  }

  function tone(freq, dur, type = 'square', vol = 0.12, when = 0, slide = 0, dest) {
    if (!ctx) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq, type = 'lowpass', when = 0, dest) {
    if (!ctx) return;
    const t = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  const horn = () => { tone(370, 0.4, 'square', 0.07); tone(466, 0.4, 'square', 0.07); };
  const chain = () => [880, 1175, 1568].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, i * 0.06));
  const crash = v => { noise(0.35, Math.min(0.5, 0.15 + v), 600); tone(90, 0.25, 'sine', 0.3 * Math.min(1, v + 0.3), 0, 0.5); };
  const flash = () => { noise(0.08, 0.3, 4000, 'highpass'); tone(1800, 0.1, 'sine', 0.06); };
  const good = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.06, i * 0.07));
  const bad = () => tone(300, 0.6, 'sawtooth', 0.1, 0, 0.4);
  const nos = () => noise(0.5, 0.2, 900, 'bandpass');

  // Musikk: enkel hiphop-loop i A-moll, 92 BPM
  const SPB = 60 / 92 / 4;
  const KICK = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];
  const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
  const BASS = [55, 0, 0, 0, 0, 0, 0, 55, 0, 0, 65.4, 0, 49, 0, 0, 0];
  const CHORDS = [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [164.8, 207.7, 246.9]];

  function schedule() {
    if (!ctx || !music || ctx.state !== 'running') { if (ctx) nextStep = ctx.currentTime + 0.05; return; }
    while (nextStep < ctx.currentTime + 0.12) {
      const s = step % 16, w = nextStep - ctx.currentTime;
      if (KICK[s]) tone(120, 0.25, 'sine', 0.5, w, 0.35, musicG);
      if (SNARE[s]) noise(0.16, 0.22, 1800, 'bandpass', w, musicG);
      if (s % 2 === 0) noise(0.04, 0.05, 7000, 'highpass', w, musicG);
      if (BASS[s]) tone(BASS[s] * (Math.floor(step / 32) % 2 ? 0.89 : 1), 0.42, 'triangle', 0.4, w, 1, musicG);
      if (s === 0 || s === 6) for (const f of CHORDS[Math.floor(step / 16) % 4]) tone(f, 0.5, 'triangle', 0.035, w, 1, musicG);
      nextStep += SPB; step++;
    }
  }

  function toggleMusic() {
    music = !music;
    if (musicG) musicG.gain.value = music ? 0.5 : 0;
    return music;
  }

  return { init, update, silence, horn, chain, crash, flash, good, bad, nos, toggleMusic };
})();
