/**
 * Fails a test when the screen breaks its contract with the API: the portals log "[contract]" when
 * a response does not match the shape they were written for, and show an error state.
 */
export function watchContract(page) {
  const problems = [];
  page.on('console', async (m) => {
    if (m.type() !== 'error' || !/\[contract\]/.test(m.text())) return;
    // the issues are logged as objects: read them so the failure says which field broke
    const values = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => '?')));
    problems.push(JSON.stringify(values).slice(0, 600));
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`.slice(0, 400)));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) problems.push(`server error ${r.status()} ${r.url()}`);
  });
  return {
    problems,
    assertClean(label) {
      if (problems.length) throw new Error(`${label}: ${problems.join(' | ')}`);
    },
  };
}
