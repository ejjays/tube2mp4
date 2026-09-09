import { Queue } from 'bullmq';
import { createRedisClient } from './redis.util.js';

// bullmq connections
export const connection = createRedisClient('Queue');

export const downloadQueue = new Queue('downloads', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
