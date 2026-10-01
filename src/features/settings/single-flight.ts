export class SingleFlight<T> {
  private active: Promise<T> | null = null;

  get current(): Promise<T> | null {
    return this.active;
  }

  run(operation: () => Promise<T>): Promise<T> {
    if (this.active) return this.active;
    const active = operation();
    this.active = active;
    const clear = () => {
      if (this.active === active) this.active = null;
    };
    void active.then(clear, clear);
    return active;
  }
}
