import { Component } from 'excalibur';
import { HEALTH_BAR_THRESHOLD } from '../../config.ts';

export class HealthComponent extends Component {
  current: number;
  readonly max: number;

  constructor(max: number) {
    super();
    this.max = max;
    this.current = max;
  }

  get fraction(): number {
    return Math.min(1, Math.max(0, this.current / this.max));
  }

  get isDamaged(): boolean {
    return this.fraction < HEALTH_BAR_THRESHOLD;
  }
}
