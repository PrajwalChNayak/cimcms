export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Polls `fn` until it returns a truthy value; throws after `ms`. */
export async function waitFor<R>(
  fn: () => R | Promise<R>,
  ms = 5000,
  label = "condition",
): Promise<NonNullable<R>> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as NonNullable<R>;
    if (Date.now() > end) throw new Error(`waitFor timeout: ${label}`);
    await sleep(25);
  }
}
