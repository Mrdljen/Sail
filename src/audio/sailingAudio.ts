export class SailingAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private waveFilter: BiquadFilterNode | null = null;
  private waveGain: GainNode | null = null;
  private muted = false;
  private started = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.45, this.ctx.currentTime, 0.08);
    }
  }

  public ensureStarted(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.45;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Create pink/brownish noise buffer for wind & hull wash
      const bufferSize = ctx.sampleRate * 3;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.03 * white) / 1.03;
        lastOut = output[i];
        output[i] *= 2.8;
      }

      // Wind channel
      const windSource = ctx.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 340;
      windFilter.Q.value = 1.6;

      const windGain = ctx.createGain();
      windGain.gain.value = 0.08;

      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();

      // Hull / Ocean wave wash channel
      const waveSource = ctx.createBufferSource();
      waveSource.buffer = noiseBuffer;
      waveSource.loop = true;

      const waveFilter = ctx.createBiquadFilter();
      waveFilter.type = 'lowpass';
      waveFilter.frequency.value = 260;

      const waveGain = ctx.createGain();
      waveGain.gain.value = 0.1;

      waveSource.connect(waveFilter);
      waveFilter.connect(waveGain);
      waveGain.connect(master);
      waveSource.start();

      this.windFilter = windFilter;
      this.windGain = windGain;
      this.waveFilter = waveFilter;
      this.waveGain = waveGain;
      this.started = true;
    } catch {
      // AudioContext unavailable in headless/sandbox environments
    }
  }

  public updateAtmosphere(windKts: number, boatSpeedKts: number, rainIntensity: number, paused: boolean): void {
    if (!this.ctx || !this.windFilter || !this.windGain || !this.waveFilter || !this.waveGain) return;
    const now = this.ctx.currentTime;

    if (paused || this.muted) {
      this.windGain.gain.setTargetAtTime(0, now, 0.1);
      this.waveGain.gain.setTargetAtTime(0, now, 0.1);
      return;
    }

    const windNorm = Math.min(1.5, windKts / 28);
    this.windFilter.frequency.setTargetAtTime(240 + windNorm * 580 + rainIntensity * 300, now, 0.2);
    this.windGain.gain.setTargetAtTime(0.03 + windNorm * 0.16 + rainIntensity * 0.08, now, 0.2);

    const speedNorm = Math.min(1.4, boatSpeedKts / 7.5);
    this.waveFilter.frequency.setTargetAtTime(180 + speedNorm * 420, now, 0.2);
    this.waveGain.gain.setTargetAtTime(0.04 + speedNorm * 0.18, now, 0.2);
  }

  public playSwitchClick(): void {
    this.ensureStarted();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(920, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(340, this.ctx.currentTime + 0.045);
    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.055);
  }

  public playWinchRatchet(): void {
    this.ensureStarted();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const base = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(620 + i * 95, base + i * 0.035);
      gain.gain.setValueAtTime(0.08, base + i * 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, base + i * 0.035 + 0.025);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(base + i * 0.035);
      osc.stop(base + i * 0.035 + 0.03);
    }
  }

  public playVhfChime(): void {
    this.ensureStarted();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, now);
    osc.frequency.setValueAtTime(1318.5, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playAnchorDrop(): void {
    this.ensureStarted();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180 - i * 16, now + i * 0.06);
      gain.gain.setValueAtTime(0.09, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.05);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.055);
    }
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
