import { useState } from 'react';
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
import mobileLogo from './assets/mobile-logo.png';
import desktopLogo from './assets/desktop-logo.png';

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
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
    <div className="relative w-full max-w-7xl mx-auto p-4 sm:p-8 flex flex-col items-center justify-center min-h-screen z-10 font-sans">
      {/* Dynamic Background Elements */}
      <div className="fixed rounded-full blur-[80px] -z-10 opacity-40 animate-float w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-purple-800 -top-12 -left-12 sm:-top-24 sm:-left-24 pointer-events-none"></div>
      <div className="fixed rounded-full blur-[80px] -z-10 opacity-40 animate-float w-[350px] h-[350px] sm:w-[600px] sm:h-[600px] bg-blue-900 -bottom-20 -right-20 sm:-bottom-36 sm:-right-36 pointer-events-none" style={{ animationDelay: '-5s' }}></div>
      <div className="fixed rounded-full blur-[80px] -z-10 opacity-20 animate-float w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] bg-pink-600 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ animationDelay: '-10s' }}></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative w-full max-w-2xl p-6 sm:p-12 rounded-[24px] bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden group"
      >
        {/* Shine effect */}
        <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-all duration-500 group-hover:left-full group-hover:duration-700 pointer-events-none"></div>

        <div className="text-center mb-8 relative z-10">
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 10 }}
            className="flex justify-center mb-6"
          >
             {/* Logo Section */}
            <img src={mobileLogo} alt="Logo" className="block md:hidden h-16 object-contain" />
            <img src={desktopLogo} alt="Logo" className="hidden md:block h-24 object-contain" />
          </motion.div>
          <motion.h1
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 10 }}
            className="font-extrabold text-4xl mb-2 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent tracking-tight md:hidden"
          >
            Tube(2)mp4
          </motion.h1>
        </div>
        
        <form onSubmit={handleDownload} className="relative z-10">
          <div className="relative mb-6">
            <input 
              className="peer w-full bg-black/20 border border-white/10 rounded-2xl py-4 sm:py-5 px-5 pl-14 text-base text-white transition-all duration-300 focus:outline-none focus:border-violet-500 focus:bg-black/40 focus:ring-4 focus:ring-violet-500/10 placeholder:text-slate-500"
              type="text" 
              placeholder="Paste YouTube Link here..." 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Link2 className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors duration-300 peer-focus:text-violet-500" size={20} />
          </div>
          
          <button 
            className="w-full py-4 sm:py-5 rounded-2xl border-none bg-gradient-to-br from-purple-500 to-blue-500 text-white text-lg font-semibold cursor-pointer transition-all duration-300 relative overflow-hidden flex items-center justify-center gap-3 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/50 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none disabled:bg-slate-700" 
            type="submit" 
            disabled={loading}
          >
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
              className="mt-8 bg-black/20 rounded-2xl p-6 border border-white/10 relative z-10"
            >
              <div className="flex justify-between mb-3 text-sm text-slate-400">
                <span>{getStatusText()}</span>
                <span>{progress}%</span>
              </div>
              
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden relative">
                <div 
                  className="h-full bg-gradient-to-br from-pink-500 to-violet-500 rounded-full relative transition-all duration-300"
                  style={{ width: `${progress}%` }}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer"></div>
                </div>
              </div>

              {videoTitle && (
                <div className="mt-4 flex items-center gap-3 pt-4 border-t border-white/10">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center text-white shrink-0">
                    <FileVideo size={20} />
                  </div>
                  <span className="font-medium truncate text-sm sm:text-base">{videoTitle}</span>
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
              className="mt-4 bg-red-500/10 text-red-300 p-4 rounded-xl border border-red-500/20 flex items-center gap-3 text-sm relative z-10"
            >
              <AlertCircle size={20} className="shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {status === 'completed' && !loading && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 text-emerald-500 flex items-center justify-center gap-2 font-medium relative z-10"
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
        className="mt-12 text-slate-400 text-xs sm:text-sm flex gap-6 opacity-60"
      >
        <span className="flex items-center gap-2"><Cpu size={14} /> Powered by Node.js</span>
        <span className="flex items-center gap-2"><Zap size={14} /> FFmpeg Accelerated</span>
      </motion.footer>
    </div>
  );
}

export default App;