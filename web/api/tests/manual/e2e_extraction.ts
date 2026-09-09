import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import path from 'node:path';

// extraction smoke test
// bypasses loopback restrictions

dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

const TEST_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const CHROMIUM_BIN = '/data/data/com.termux/files/usr/bin/chromium-browser';

async function resolveBackendUrl(): Promise<string> {
  if (process.env.EXTERNAL_URL) return process.env.EXTERNAL_URL;

  if (process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN) {
    try {
      const { createClient } = await import('@libsql/client');
      const db = createClient({
        url: process.env.TURSO_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
      const rs = await db.execute(
        "SELECT value FROM configs WHERE key = 'BACKEND_URL' LIMIT 1"
      );
      if (rs.rows.length > 0) return rs.rows[0].value as string;
    } catch (_ERROR) {
      console.warn('[e2e] discovery failed');
    }
  }

  return 'http://localhost:5000';
}

async function smokeTest() {
  const targetHost = await resolveBackendUrl();

  let apiProc = null;

  if (!process.env.EXTERNAL_URL) {
    console.log('starting local origin...');
    apiProc = spawn('node', ['scripts/termux-shim.js'], {
      stdio: 'pipe',
      shell: true,
      detached: true,
      cwd: './backend',
      env: {
        ...process.env,
        PORT: '5000',
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
      },
    });

    let ready = false;
    apiProc.stdout.on('data', (data) => {
      if (data.toString().includes('Routes ready')) ready = true;
    });

    const start = Date.now();
    while (Date.now() - start < 45000) {
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log('origin ready');
  } else {
    console.log(`targeting remote: ${process.env.EXTERNAL_URL}`);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROMIUM_BIN,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--single-process',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    const apiPath = `${targetHost}/info?url=${encodeURIComponent(TEST_URL)}`;
    console.log(`fetching metadata: ${apiPath}`);

    await page.goto(apiPath, { waitUntil: 'networkidle2', timeout: 60000 });
    const body = await page.evaluate(() => document.body.innerText);

    let data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      console.error('❌ invalid json response');
      console.error(body.substring(0, 300));
      throw err;
    }

    if (data.id && data.title) {
      console.log(`🎬 success: ${data.title} (${data.id})`);
      console.log(`👤 uploader: ${data.uploader}`);
    } else {
      throw new Error('missing metadata in response');
    }

    console.log('✔️ test passed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ test failed: ${message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (apiProc?.pid) {
      try {
        process.kill(-apiProc.pid, 'SIGKILL');
      } catch {
        apiProc.kill();
      }
    }
    process.exit(0);
  }
}

smokeTest();
