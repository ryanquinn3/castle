export class TideWaveCountdown {
  private remainingMs: number;
  private targetTime = 0;
  private completeTimer: ReturnType<typeof setTimeout> | null = null;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private durationMs: number,
    private onUpdate: (seconds: number) => void,
    private onComplete: () => void,
  ) {
    this.remainingMs = durationMs;
  }

  start(): void {
    this.stop();
    this.remainingMs = this.durationMs;
    this.running = true;
    this.targetTime = Date.now() + this.remainingMs;
    this.onUpdate(this.secondsRemaining());
    this.schedule();
  }

  pause(): void {
    if (!this.running) {
      return;
    }
    this.remainingMs = Math.max(0, this.targetTime - Date.now());
    this.clearTimers();
    this.running = false;
  }

  resume(): void {
    if (this.running) {
      return;
    }
    if (this.remainingMs <= 0) {
      this.complete();
      return;
    }
    this.running = true;
    this.targetTime = Date.now() + this.remainingMs;
    this.schedule();
  }

  stop(): void {
    this.clearTimers();
    this.running = false;
  }

  private schedule(): void {
    this.completeTimer = setTimeout(() => this.complete(), this.remainingMs);
    this.scheduleUpdate();
  }

  private complete(): void {
    this.remainingMs = 0;
    this.running = false;
    this.clearTimers();
    this.onUpdate(0);
    this.onComplete();
  }

  private scheduleUpdate(): void {
    const untilNextSecond = this.remainingMs % 1000 || 1000;
    this.updateTimer = setTimeout(() => {
      if (!this.running) {
        return;
      }
      this.remainingMs = Math.max(0, this.targetTime - Date.now());
      if (this.remainingMs > 0) {
        this.onUpdate(this.secondsRemaining());
        this.scheduleUpdate();
      }
    }, untilNextSecond);
  }

  private secondsRemaining(): number {
    return Math.ceil(this.remainingMs / 1000);
  }

  private clearTimers(): void {
    if (this.completeTimer !== null) {
      clearTimeout(this.completeTimer);
      this.completeTimer = null;
    }
    if (this.updateTimer !== null) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
  }
}
