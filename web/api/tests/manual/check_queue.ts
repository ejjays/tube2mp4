import { Queue } from 'bullmq';
import Redis from 'ioredis';

async function checkQueue(): Promise<void> {
  const connection = new Redis();
  const queue = new Queue('downloads', { connection });

  console.log('--- Queue Health Check ---');
  const counts = await queue.getJobCounts();
  console.log('Job Counts:', JSON.stringify(counts, null, 2));

  const active = await queue.getActive();
  console.log('Active Jobs:', active.length);

  const waiting = await queue.getWaiting();
  console.log('Waiting Jobs:', waiting.length);

  await connection.quit();
  process.exit(0);
}

checkQueue().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
