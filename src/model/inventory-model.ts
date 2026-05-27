export class InventoryModel {
  private _sand = 0;

  get sand(): number {
    return this._sand;
  }

  get hasSand(): boolean {
    return this._sand > 0;
  }

  addSand(amount: number): void {
    this._sand += amount;
  }

  removeSand(amount: number): boolean {
    if (this._sand < amount) {
      return false;
    }
    this._sand -= amount;
    return true;
  }
}
