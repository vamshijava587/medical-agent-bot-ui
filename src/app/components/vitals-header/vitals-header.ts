import { ChangeDetectionStrategy, Component, input, signal, effect, computed, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-vitals-header',
  imports: [],
  templateUrl: './vitals-header.html',
  styleUrl: './vitals-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VitalsHeader implements OnDestroy {
  readonly active = input<boolean>(false);
  readonly connected = input<boolean>(true);
  readonly sessionTitle = input<string>('New consultation');

  readonly heartbeatPath = signal<string>('M0,24 L320,24');
  readonly flatPath = signal<string>('M0,24 L320,24');
  // heart rate display and sliding ECG data
  readonly heartRate = signal<number>(72);
  private dataPoints = signal<number[]>(Array(160).fill(24));
  readonly svgPath = computed(() => {
    const points = this.dataPoints();
    const viewWidth = 320;
    const step = viewWidth / Math.max(1, points.length - 1);
    return points.reduce((path, y, i) => path + `${i === 0 ? 'M' : 'L'}${Math.round(i * step)},${Math.round(y)}`, '');
  });

  private timerId: any;
  private tickCount = 0;

  private resizeHandler = () => this.generate();

  constructor() {
    this.generate();
    window.addEventListener('resize', this.resizeHandler);

    // regenerate when active toggles so spikes animate on thinking
    effect(() => {
      if (this.active()) this.generate();
    });

    // start ECG streaming simulation
    this.timerId = setInterval(() => this.generateLiveTick(), 90);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    if (this.timerId) clearInterval(this.timerId);
  }

  private generateLiveTick() {
    this.tickCount++;
    const mid = 24;

    // Determine phase based on a heartbeat cadence influenced by heartRate
    // Convert BPM to ticks per beat (approx): tickInterval ~90ms so ticksPerBeat = (60_000 / bpm) / 90
    const bpm = this.heartRate();
    const ticksPerBeat = Math.max(4, Math.round((60000 / Math.max(30, bpm)) / 90));
    const phase = this.tickCount % Math.max(1, ticksPerBeat);

    let nextY = mid;

    // Create a narrow QRS-like complex at a specific phase window
    if (phase === 1) nextY = mid - 6; // small P bump
    else if (phase === 2) nextY = mid; // return
    else if (phase === 3) nextY = mid - 28; // sharp R spike
    else if (phase === 4) nextY = mid + 22; // S drop
    else if (phase === 5) nextY = mid; // return
    else if (phase === Math.max(6, Math.floor(ticksPerBeat * 0.6))) nextY = mid - 8; // T wave

    // small baseline jitter when idle
    if (nextY === mid) nextY += Math.round((Math.random() - 0.5) * 4);

    // Occasionally vary displayed heart rate slightly
    if (this.tickCount % 30 === 0) {
      this.heartRate.set(Math.max(48, Math.min(140, Math.round(this.heartRate() + (Math.random() - 0.5) * 4))));
    }

    // Slide window: drop first, push new
    this.dataPoints.update(points => {
      const copy = points.slice(1);
      copy.push(nextY);
      return copy;
    });
  }

  private generate(): void {
    const viewWidth = 320; // must match svg viewBox width
    const mid = 24;
    const segments = 80; // denser sampling for fine-grained spikes

    let d = `M0,${mid}`;

    let i = 1;
    while (i <= segments) {
      const x = Math.round((i * viewWidth) / segments);

      // Decide whether to emit a sharp ECG spike here
      if (Math.random() < 0.08) {
        // spike geometry in pixels
        const spikeHalfPx = 6 + Math.floor(Math.random() * 10); // half-width of the spike
        const spikeAmp = 12 + Math.floor(Math.random() * 18); // vertical amplitude
        const directionUp = Math.random() < 0.7; // more likely to be an upward sharp spike

        const leftX = Math.max(1, x - spikeHalfPx);
        const upX = Math.max(1, x - Math.floor(spikeHalfPx / 2));
        const peakX = Math.min(viewWidth - 1, x);
        const downX = Math.min(viewWidth - 1, x + Math.floor(spikeHalfPx / 2));
        const rightX = Math.min(viewWidth, x + spikeHalfPx);

        // baseline to left
        d += ` L${leftX},${mid}`;

        // sharp quick rise
        d += ` L${upX},${directionUp ? mid - Math.floor(spikeAmp * 0.6) : mid + Math.floor(spikeAmp * 0.6)}`;

        // peak (very narrow)
        d += ` L${peakX},${directionUp ? mid - spikeAmp : mid + spikeAmp}`;

        // fall back toward baseline
        d += ` L${downX},${directionUp ? mid - Math.floor(spikeAmp * 0.6) : mid + Math.floor(spikeAmp * 0.6)}`;
        d += ` L${rightX},${mid}`;

        // advance index to skip overlap with the spike width
        const skip = Math.max(1, Math.ceil((spikeHalfPx * 2) / (viewWidth / segments)));
        i += skip;
        continue;
      }

      // otherwise a small baseline jitter
      const jitter = Math.round((Math.random() - 0.5) * 6);
      const y = mid + jitter;
      d += ` L${x},${y}`;
      i += 1;
    }

    d += ` L${viewWidth},${mid}`;

    this.heartbeatPath.set(d);
    this.flatPath.set(`M0,${mid} L${viewWidth},${mid}`);
  }
}
