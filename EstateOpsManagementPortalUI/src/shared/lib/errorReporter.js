/** Sentry-ready adapter. No-op by default (and always in mock mode). */
let reporter = () => {};

export function setErrorReporter(fn) {
  reporter = fn;
}

export function reportError(error, context = {}) {
  reporter(error, context);
}
