/**
 * Purpose: Adds a maximum waiting period to an asynchronous operation.
 * How it works: 1) starts a rejection timer. 2) mirrors the source promise. 3) clears the timer on settlement.
 * Technologies Used: JavaScript promises and timers, TypeScript generics.
 * Why this implementation: Network-dependent screens receive bounded, contextual failure feedback.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
