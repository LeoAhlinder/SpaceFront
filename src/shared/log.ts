/* eslint-disable no-console -- this module is the one place allowed to use the console. */

/** Project logger. Debug output is dropped in production builds. */
export const log = {
  debug: (...args: unknown[]): void => {
    if (import.meta.env.DEV) console.debug(...args);
  },
  info: (...args: unknown[]): void => console.info(...args),
  warn: (...args: unknown[]): void => console.warn(...args),
  error: (...args: unknown[]): void => console.error(...args),
};
