/** `{ items, nextCursor }` from a use case -> the API's `{ data, next_cursor }`. */
export const pageResponse = (page, map = (x) => x) => ({
  data: page.items.map(map),
  next_cursor: page.nextCursor ?? null,
});
