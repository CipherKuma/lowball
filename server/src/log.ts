// Tiny logger: silent unless DEBUG is set. Never log secrets.
let enabled = false;

export function setDebug(v: unknown): void {
  enabled = v === '1' || v === 'true' || v === true;
}

export function debug(scope: string, ...args: unknown[]): void {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.debug(`[${scope}]`, ...args);
}
