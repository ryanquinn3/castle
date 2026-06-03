export class LevelSessionLifecycle {
  private token = 0;
  private isActive = true;
  private cleanupCallbacks = new Set<() => void>();
  private timerIds = new Set<ReturnType<typeof setTimeout>>();
  private delayResolvers = new Set<() => void>();
  private resetRequested = false;

  get active(): boolean {
    return this.isActive;
  }

  get currentToken(): number {
    return this.token;
  }

  activate(): void {
    if (this.isActive) {
      return;
    }
    this.isActive = true;
    this.token++;
  }

  deactivate(options?: { resetOnNextActivate?: boolean }): void {
    if (options?.resetOnNextActivate) {
      this.resetRequested = true;
    }
    if (!this.isActive) {
      return;
    }
    this.isActive = false;
    this.token++;
    for (const timerId of this.timerIds) {
      clearTimeout(timerId);
    }
    this.timerIds.clear();
    for (const resolveDelay of this.delayResolvers) {
      resolveDelay();
    }
    this.delayResolvers.clear();
    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks.clear();
  }

  isCurrent(token: number): boolean {
    return this.isActive && token === this.token;
  }

  addCleanup(cleanup: () => void): void {
    this.cleanupCallbacks.add(cleanup);
  }

  consumeResetRequest(): boolean {
    const reset = this.resetRequested;
    this.resetRequested = false;
    return reset;
  }

  delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const complete = (): void => {
        this.delayResolvers.delete(complete);
        resolve();
      };
      this.delayResolvers.add(complete);
      this.setTimeout(complete, ms);
    });
  }

  setTimeout(callback: () => void, ms: number): void {
    const timerId = setTimeout(() => {
      this.timerIds.delete(timerId);
      if (this.isActive) {
        callback();
      }
    }, ms);
    this.timerIds.add(timerId);
  }
}
