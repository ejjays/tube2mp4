import { useEffect } from 'react';

const DebugConsole = () => {
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 3) {
        if (window.eruda) {
          if (window.eruda._isInit) {
            window.eruda.show();
          }
        } else {
          const script = document.createElement('script');
          script.src = '//cdn.jsdelivr.net/npm/eruda';
          script.onload = () => {
            if (window.eruda) {
              window.eruda.init();
              window.eruda.show();
              console.log('Eruda initialized via 3-finger tap!');
            }
          };
          document.body.appendChild(script);
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, []);

  return null;
};

export default DebugConsole;
