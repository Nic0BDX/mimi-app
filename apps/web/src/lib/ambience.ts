// Original pentatonic arrangement: soft bells, warm sustained chords, no downloaded audio.
export class Ambience {
  private context: AudioContext;
  private master: GainNode;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextBeat = 0;
  private beat = 0;
  private lastEffect = 0;
  private music = false;
  private nodes = new Set<OscillatorNode>();

  constructor() {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);
  }

  async resume() {
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('AUDIO_UNAVAILABLE');
  }

  configure(volume: number, music: boolean) {
    this.master.gain.setTargetAtTime(
      Math.max(0, Math.min(1, volume)) * 0.45,
      this.context.currentTime,
      0.1,
    );
    if (music === this.music) return;
    this.music = music;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stopNotes();
    if (music) {
      this.beat = 0;
      this.nextBeat = this.context.currentTime + 0.08;
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 200);
    }
  }

  private note(frequency: number, time: number, length: number, level: number, warm = false) {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = warm ? 'triangle' : 'sine';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + (warm ? 0.45 : 0.018));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + length);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    this.nodes.add(oscillator);
    oscillator.onended = () => {
      this.nodes.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(time);
    oscillator.stop(time + length + 0.02);
  }

  private schedule() {
    if (!this.music || this.context.state !== 'running') return;
    const melody = [72, 76, 79, 76, 74, 69, 67, 69, 72, 79, 81, 79, 76, 74, 72, 67];
    const chords = [
      [48, 55, 64],
      [45, 52, 60],
      [41, 48, 57],
      [43, 50, 62],
    ];
    const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
    if (this.nextBeat < this.context.currentTime) this.nextBeat = this.context.currentTime + 0.05;
    while (this.nextBeat < this.context.currentTime + 0.6) {
      this.note(frequency(melody[this.beat % melody.length]!), this.nextBeat, 2.1, 0.13);
      if (this.beat % 4 === 0) {
        for (const midi of chords[Math.floor(this.beat / 4) % chords.length]!)
          this.note(frequency(midi), this.nextBeat, 3.2, 0.035, true);
      }
      this.beat++;
      this.nextBeat += 60 / 72;
    }
  }

  effect(kind: 'hover' | 'click') {
    const now = this.context.currentTime;
    if (this.context.state !== 'running' || now - this.lastEffect < 0.09) return;
    this.lastEffect = now;
    this.note(kind === 'click' ? 523.25 : 783.99, now, kind === 'click' ? 0.19 : 0.09, 0.1);
    if (kind === 'click') this.note(659.25, now + 0.055, 0.16, 0.07);
  }

  private stopNotes() {
    for (const node of this.nodes) node.stop();
    this.nodes.clear();
  }

  async suspend() {
    await this.context.suspend();
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.stopNotes();
    void this.context.close().catch(() => undefined);
  }
}
