import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import meowCool from '../assets/meow.png';
import { Link, Loader2, FileVideo, AlertCircle, CheckCircle2 } from 'lucide-react';
import YouTubeIcon from '../assets/icons/YouTubeIcon.jsx';
import MusicIcon from '../assets/icons/MusicIcon.jsx';
import PasteIcon from '../assets/icons/PasteIcon.jsx';
import GlowButton from './ui/GlowButton.jsx';


const MainContent = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [videoTitle, setVideoTitle] = useState('');

  const handleDownload = async (e) => {
    if (e) e.preventDefault();
    if (!url) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setProgress(0);
    setStatus('initializing');
    setVideoTitle('');

    const clientId = Date.now().toString();
    const BACKEND_URL = 'https://ej-nexstream.onrender.com';
    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);
    
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
      const response = await fetch(`${BACKEND_URL}/convert?url=${encodeURIComponent(url)}&id=${clientId}`);
      
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
  };

  const getStatusText = () => {
    switch(status) {
      case 'fetching_info': return 'Analyzing video...';
      case 'downloading': return `Downloading... ${progress}%`;
      case 'merging': return 'Merging...';
      case 'completed': return 'Complete!';
      case 'initializing': return 'Connecting...';
      default: return 'Processing...';
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  };

  return (
    <div className="flex flex-col justify-center items-center w-full gap-3 px-4">
      <img className="w-56" src={meowCool} alt="cool cat" />
      <div className="w-full max-w-md flex items-center relative">
        <div className="absolute inset-y-0 left-2 flex items-center pl-1">
          <div className="relative flex items-center justify-center">
            <span className="animate-ping absolute inline-flex h-2/3 w-2/3 rounded-full bg-cyan-500 opacity-50"></span>
            <span className="relative p-1 rounded-full flex items-center justify-center">
              <Link className="w-5 h-5 text-cyan-500" />
            </span>
          </div>
        </div>
        <input 
          className="border-cyan-400 border-2 p-2 w-full rounded-xl placeholder-gray-500 pl-10 focus:outline-none bg-transparent text-white"
          type="text" 
          placeholder="paste your link here"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="w-full max-w-md mt-1"> 
        <div className="flex bg-cyan-500 w-full rounded-2xl divide-x divide-white/40 overflow-hidden shadow-lg">
          <button className="btns" onClick={() => window.open('https://youtube.com', '_blank')}>
            <YouTubeIcon size={24} />
            <span className="truncate">YouTube</span>
          </button>
          <button className="btns" onClick={() => alert('Audio only conversion coming soon!')}>
            <MusicIcon color="#fff" size={24} />
            <span className="truncate">Audio</span>
          </button>
          <button className="btns" onClick={handlePaste}>
            <PasteIcon size={24} />
            <span className="truncate">Paste</span>
          </button>
        </div>
      </div>
      <div className="pt-2">
        <GlowButton 
          text={loading ? 'Processing...' : 'Convert & Download'} 
          onClick={handleDownload}
          disabled={loading}
        />
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full max-w-md mt-4 bg-black/20 rounded-2xl p-4 border border-cyan-500/30"
          >
            <div className="flex justify-between mb-2 text-xs text-cyan-400">
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                {getStatusText()}
              </span>
              <span>{progress}%</span>
            </div>
            
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden relative">
              <motion.div 
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full relative"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
              </motion.div>
            </div>

            {videoTitle && (
              <div className="mt-3 flex items-center gap-2 pt-3 border-t border-white/10 text-white">
                <FileVideo size={16} className="text-cyan-500 shrink-0" />
                <span className="text-xs truncate font-medium">{videoTitle}</span>
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
            className="w-full max-w-md mt-4 bg-red-500/10 text-red-300 p-3 rounded-xl border border-red-500/20 flex items-center gap-2 text-xs"
          >
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {status === 'completed' && !loading && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-emerald-400 flex items-center justify-center gap-2 text-sm font-medium"
        >
          <CheckCircle2 size={16} />
          <span>Success! File downloaded.</span>
        </motion.div>
      )}
    </div>
  );
};

export default MainContent;