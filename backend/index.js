const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('YouTube to MP4 Backend is running!');
});

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

// Store active SSE connections
const clients = new Map();

app.get('/events', (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.set(id, res);

    req.on('close', () => {
        clients.delete(id);
    });
});

function sendEvent(id, data) {
    const client = clients.get(id);
    if (client) {
        client.write(`data: ${JSON.stringify(data)}
\n`);
    }
}

app.get('/convert', async (req, res) => {
    const videoURL = req.query.url;
    const clientId = req.query.id || Date.now().toString();

    if (!videoURL) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    console.log(`Received request for: ${videoURL} (Client: ${clientId})`);

    try {
        if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: 0 });

        const cookiesPath = path.join(__dirname, 'cookies.txt');
        const cookieArgs = fs.existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [];

        // Step 1: Get Video Metadata
        const infoProcess = spawn('yt-dlp', [
            ...cookieArgs,
            '--dump-json', 
            '--no-playlist', 
            videoURL
        ]);
        
        let infoData = '';
        let infoError = '';

        infoProcess.stdout.on('data', (data) => {
            infoData += data.toString();
        });

        infoProcess.stderr.on('data', (data) => {
            infoError += data.toString();
        });

        infoProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`yt-dlp info error (code ${code}):`, infoError);
                if (clientId) sendEvent(clientId, { status: 'error', message: 'Failed to fetch video info' });
                if (!res.headersSent) return res.status(500).json({ error: 'Failed to fetch video info' });
                return;
            }

            try {
                const info = JSON.parse(infoData);
                const title = info.title.replace(/[^\w\s]/gi, '') || 'video';
                const filename = `${title}.mp4`;
                const tempFilePath = path.join(TEMP_DIR, `${clientId}_${Date.now()}.mp4`);

                if (clientId) sendEvent(clientId, { status: 'downloading', progress: 0, title });

                // Step 2: Download & Merge on Server Side
                const args = [
                    ...cookieArgs,
                    '-f', 'bestvideo+bestaudio/best',
                    '--merge-output-format', 'mp4',
                    '--no-playlist',
                    '-o', tempFilePath,
                    videoURL
                ];
                
                const videoProcess = spawn('yt-dlp', args);
                let videoError = '';

                videoProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    
                    const match = output.match(/download]\s+(\d+\.\d+)%/);
                    if (match && clientId) {
                        const progress = parseFloat(match[1]);
                        sendEvent(clientId, { status: 'downloading', progress });
                    }
                    
                    if (output.includes('[Merger]') && clientId) {
                        sendEvent(clientId, { status: 'merging', progress: 100 });
                    }
                });

                videoProcess.stderr.on('data', (data) => {
                    const output = data.toString();
                    videoError += output;
                    // yt-dlp sometimes writes progress to stderr too
                    const match = output.match(/download]\s+(\d+\.\d+)%/);
                    if (match && clientId) {
                        const progress = parseFloat(match[1]);
                        sendEvent(clientId, { status: 'downloading', progress });
                    }
                });

                videoProcess.on('close', (code) => {
                    if (code === 0) {
                        if (clientId) sendEvent(clientId, { status: 'completed', progress: 100 });
                        
                        console.log(`Download complete. Sending file: ${filename}`);
                        
                        // Send the file to the user
                        res.download(tempFilePath, filename, (err) => {
                            if (err) {
                                console.error('Error sending file:', err);
                            }
                            // Delete temp file after sending (or if error)
                            fs.unlink(tempFilePath, (unlinkErr) => {
                                if (unlinkErr) console.error('Error deleting temp file:', unlinkErr);
                            });
                        });
                    } else {
                        console.error(`yt-dlp download error (code ${code}):`, videoError);
                        if (clientId) sendEvent(clientId, { status: 'error', message: 'Conversion failed' });
                        if (!res.headersSent) res.status(500).json({ error: 'Conversion failed' });
                    }
                });

                req.on('close', () => {
                   // If client disconnects BEFORE download finishes, kill process
                   if (videoProcess.exitCode === null) {
                       console.log('Client disconnected early, killing process');
                       videoProcess.kill();
                       if (fs.existsSync(tempFilePath)) {
                           fs.unlink(tempFilePath, () => {});
                       }
                   }
                });

            } catch (err) {
                console.error('Metadata parse error:', err);
                if (clientId) sendEvent(clientId, { status: 'error', message: 'Metadata error' });
                if (!res.headersSent) res.status(500).json({ error: 'Failed to parse video metadata' });
            }
        });

    } catch (error) {
        console.error('Server error:', error);
        if (clientId) sendEvent(clientId, { status: 'error', message: 'Internal server error' });
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Cleanup old temp files periodically (every hour)
setInterval(() => {
    fs.readdir(TEMP_DIR, (err, files) => {
        if (err) return;
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > 3600000) { // 1 hour
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
}, 3600000);

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
