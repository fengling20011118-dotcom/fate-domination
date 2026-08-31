export class EventBus {
  #listeners = new Map();

  on(eventType, listener) {
    const listeners = this.#listeners.get(eventType) ?? [];
    listeners.push(listener);
    this.#listeners.set(eventType, listeners);
    return () => this.off(eventType, listener);
  }

  off(eventType, listener) {
    const listeners = this.#listeners.get(eventType) ?? [];
    this.#listeners.set(
      eventType,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  emit(event, context) {
    const listeners = [
      ...(this.#listeners.get(event.type) ?? []),
      ...(this.#listeners.get("*") ?? []),
    ];
    return listeners.flatMap((listener) => listener(event, context) ?? []);
  }
}
