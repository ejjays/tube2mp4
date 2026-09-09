import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import http from 'node:http';

async function waitForServer(
  url: string,
  serverProcess: import('node:child_process').ChildProcess,
  timeout = 30000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`server exit: ${serverProcess.exitCode}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode === 200) resolve(true);
          else reject(new Error(`status: ${res.statusCode}`));
        });
        req.on('error', (err) => reject(err));
        req.end();
      });
      console.log('\n[e2e] server ready');
      return;
    } catch (_ERROR) {
      process.stdout.write('.');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('server timeout');
}

async function runE2E() {
  console.log('[e2e] building...');
  await new Promise((resolve, reject) => {
    const build = spawn('npm', ['run', 'build'], {
      stdio: 'inherit',
      shell: true,
    });
    build.on('close', (code) =>
      code === 0 ? resolve(true) : reject(new Error('build error'))
    );
  });

  console.log('[e2e] boot server');
  const server = spawn('node', ['./scripts/termux-shim.js'], {
    stdio: 'inherit',
    shell: true,
    detached: true,
  });

  let browser;
  try {
    await waitForServer('http://localhost:5000/ping', server);

    console.log('[e2e] start chromium');
    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/data/data/com.termux/files/usr/bin/chromium-browser',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process'],
    });

    const page = await browser.newPage();
    console.log('[e2e] check /health');

    await page.goto('http://localhost:5000/health', {
      waitUntil: 'networkidle2',
    });
    const content = await page.content();

    if (content.includes('"status":"ok"')) {
      console.log('[e2e] health check ok');
    } else {
      console.error('[e2e] health check fail');
    }
  } catch (_ERROR) {
    const message = _ERROR instanceof Error ? _ERROR.message : String(_ERROR);
    console.error('[e2e] error:', message);
  } finally {
    console.log('[e2e] cleanup');
    if (browser) await browser.close();
    if (server.pid) {
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch (_ERROR) {
        server.kill();
      }
    }
    process.exit(0);
  }
}

runE2E();
