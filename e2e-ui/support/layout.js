/** True when the page itself scrolls sideways (a table scrolling inside its own box does not count). */
export const scrollsSideways = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

/** Elements wider than the screen that are not inside a scroll box: the usual cause of sideways scrolling. */
export const overflowingElements = (page) =>
  page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const insideScroller = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
      }
      return false;
    };
    return [...document.body.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > limit + 1 && getComputedStyle(el).position !== 'fixed' && !insideScroller(el))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
  });

/** Waits until the page has finished loading: no requests in flight and no loading placeholders. */
export async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !document.querySelector('.animate-pulse, [aria-busy="true"]'), null, { timeout: 15_000 });
}
