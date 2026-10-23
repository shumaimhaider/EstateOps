import { afterAll, afterEach, beforeAll } from 'vitest';
import { startStack } from './stack.js';
import { createWorld } from './world.js';

/** One full stack per test file. Returns accessors that are filled in once `beforeAll` has run. */
export function useStack(options) {
  const ctx = {};
  beforeAll(async () => {
    ctx.stack = await startStack(options);
    ctx.w = createWorld(ctx.stack);
  }, 180_000);
  // a failed journey prints what the services logged as errors while it ran
  afterEach((test) => {
    if (test.task.result?.state !== 'fail' || !ctx.stack) return;
    const errors = ctx.stack.logs.filter((l) => /"level":(50|60)/.test(l)).slice(-8);
    if (errors.length)
      process.stderr.write(
        `\n--- service errors during "${test.task.name}" ---\n${errors.join('\n')}\n`,
      );
  });
  afterAll(async () => {
    await ctx.stack?.stop();
  });
  return ctx;
}
