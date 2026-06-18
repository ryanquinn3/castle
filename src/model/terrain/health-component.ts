import { Component } from 'excalibur';

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
}
