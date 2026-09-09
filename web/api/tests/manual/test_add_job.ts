import { Queue } from 'bullmq';
import Redis from 'ioredis';

async function testAddJob(): Promise<void> {
  const connection = new Redis();
  const queue = new Queue('downloads', { connection });

  console.log('Adding test job to BullMQ...');
  const job = await queue.add('lock', { weight: 1 });
  console.log(`Job added! ID: ${job.id}`);

  await connection.quit();
}

testAddJob().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
});
