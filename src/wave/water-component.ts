import { Component, Vector } from "excalibur";

export class WaterComponent extends Component {
  depth: number;
  velocity: Vector;

  constructor(depth = 0, velocity: Vector = new Vector(0, 0)) {
    super();
    this.depth = depth;
    this.velocity = velocity;
  }
}
