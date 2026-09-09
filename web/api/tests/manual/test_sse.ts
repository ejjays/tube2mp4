import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();

app.use(cors());

app.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'none');
  res.flushHeaders();

  console.log('Client connected');

  let progress = 0;
  const interval = setInterval(() => {
    progress += 10;
    const data = { status: 'downloading', progress };
    const padding = ' '.repeat(4096);
    res.write(`data: ${JSON.stringify(data)}\n\n${padding}\n\n`);
    console.log(`Sent: ${progress}%`);

    if (progress >= 100) {
      clearInterval(interval);
      res.end();
    }
  }, 500);

  req.on('close', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
});

app.listen(5001, () => console.log('SSE Test Server on 5001'));
