import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Link2, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  FileVideo, 
  Cpu, 
  Zap 
} from 'lucide-react';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(''); // 'fetching_info', 'downloading', 'merging', 'completed'
  const [videoTitle, setVideoTitle] = useState('');

  const handleDownload = async (e) => {
    e.preventDefault();
    if (!url) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setProgress(0);
    setStatus('initializing');
    setVideoTitle('');

    const clientId = Math.random().toString(36).substring(7);
    const eventSource = new EventSource(`http://localhost:5000/events?id=${clientId}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status === 'error') {
        setError(data.message);
        setLoading(false);
        eventSource.close();
      } else {
        setStatus(data.status);
        if (data.progress !== undefined) setProgress(data.progress);
        if (data.title) setVideoTitle(data.title);
      }
    };

    try {
      const response = await fetch(`http://localhost:5000/convert?url=${encodeURIComponent(url)}&id=${clientId}`);
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Download failed');
      }

      const disposition = response.headers.get('Content-Disposition');
      let filename = 'video.mp4';
      if (disposition && disposition.indexOf('attachment') !== -1) {
        const filenameRegex = /filename[^;=]*=((['"]).*?\2|[^;]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) { 
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      setStatus('completed');
      
    } catch (err) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
      eventSource.close();
    }
  }

  const getStatusText = () => {
    switch(status) {
      case 'fetching_info': return 'Analyzing video metadata...';
      case 'downloading': return `Downloading 4K content... ${progress}%`;
      case 'merging': return 'Merging High-Fidelity Audio & Video...';
      case 'completed': return 'Download Complete!';
      case 'initializing': return 'Establishing connection...';
      default: return 'Processing...';
    }
  };

  return (
    <div className="app-container">
      {/* Dynamic Background Elements */}
      <div className="bg-orb orb-1"></div>
      <div className="bg-orb orb-2"></div>
      <div className="bg-orb orb-3"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="glass-card"
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <motion.h1
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 10 }}
          >
            NexStream
          </motion.h1>
          <p className="subtitle">Ultra-HD YouTube to MP4 Converter</p>
        </div>
        
        <form onSubmit={handleDownload}>
          <div className="input-group">
            <input 
              className="url-input"
              type="text" 
              placeholder="Paste YouTube Link here..." 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Link2 className="input-icon" size={20} />
          </div>
          
          <button className="cta-button" type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Download size={20} />
                <span>Convert to 4K MP4</span>
              </>
            )}
          </button>
        </form>

        <AnimatePresence>
          {loading && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="status-container"
            >
              <div className="status-header">
                <span>{getStatusText()}</span>
                <span>{progress}%</span>
              </div>
              
              <div className="progress-track">
                <div 
                  className="progress-bar" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              {videoTitle && (
                <div className="video-info">
                  <div className="video-icon-box">
                    <FileVideo size={20} />
                  </div>
                  <span className="video-title">{videoTitle}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="error-message"
            >
              <AlertCircle size={20} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {status === 'completed' && !loading && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="success-message"
            style={{ 
              marginTop: '1.5rem', 
              color: '#10b981', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.5rem',
              fontWeight: '500'
            }}
          >
            <CheckCircle2 size={20} />
            <span>Success! File downloaded.</span>
          </motion.div>
        )}
      </motion.div>

      <motion.footer 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ delay: 0.5 }}
        className="footer"
      >
        <span><Cpu size={14} /> Powered by Node.js</span>
        <span><Zap size={14} /> FFmpeg Accelerated</span>
      </motion.footer>
    </div>
  );
}

export default App;