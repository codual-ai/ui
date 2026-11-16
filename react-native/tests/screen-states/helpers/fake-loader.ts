import { act } from "@testing-library/react-native";

interface Call<T> {
  readonly signal: AbortSignal;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

/** A load whose calls wait until the test answers them, in the order they were made. */
export class FakeLoader<T> {
  readonly calls: Call<T>[] = [];
  private answered = 0;

  readonly load = (signal: AbortSignal): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      this.calls.push({ signal, resolve, reject });
    });

  /** Answers the oldest unanswered call with `value`, and lets the screen update. */
  async succeed(value: T): Promise<void> {
    const call = this.nextCall();
    await act(async () => call.resolve(value));
  }

  /** Answers the oldest unanswered call with `error`, and lets the screen update. */
  async fail(error: unknown): Promise<void> {
    const call = this.nextCall();
    await act(async () => call.reject(error));
  }

  private nextCall(): Call<T> {
    const call = this.calls[this.answered];
    if (call === undefined) throw new Error(`the load was called ${this.calls.length} times, all answered`);
    this.answered += 1;
    return call;
  }
}

export class TestError extends Error {}

export const offlineError = new TypeError("Network request failed");

export const abortError = Object.assign(new Error("Aborted"), { name: "AbortError" });
