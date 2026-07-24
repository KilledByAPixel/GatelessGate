// Run `jobs` (thunks returning promises) at most `limit` at a time. Shared by every
// TTS provider adapter, none of which should each reinvent this.
export async function pool(jobs, limit = 4) {
  const out = new Array(jobs.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await jobs[i]();
    }
  });
  await Promise.all(workers);
  return out;
}
