export class LatestRequest {
  #revision = 0;

  invalidate(): void {
    this.#revision += 1;
  }

  async resolve<T>(request: () => Promise<T>): Promise<T | undefined> {
    const revision = ++this.#revision;
    try {
      const value = await request();
      return revision === this.#revision ? value : undefined;
    } catch (error) {
      if (revision !== this.#revision) return undefined;
      throw error;
    }
  }
}
