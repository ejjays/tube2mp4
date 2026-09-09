import React from 'react';

const PurpleBackground = () => {
  return (
    <>
      <style>{`
        .purple-bg-wrapper {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
          background: radial-gradient(
              65.28% 65.28% at 50% 100%,
              rgba(223, 113, 255, 0.8) 0%,
              rgba(223, 113, 255, 0) 100%
            ),
            linear-gradient(0deg, #7a5af8, #7a5af8);
        }

        .points_wrapper {
          width: 100%;
          height: 100%;
          position: absolute;
        }

        .point {
          bottom: -10px;
          position: absolute;
          animation: floating-points infinite ease-in-out;
          width: 2px;
          height: 2px;
          background-color: #fff;
          border-radius: 9999px;
        }

        @keyframes floating-points {
          0% { transform: translateY(0); opacity: 1; }
          85% { opacity: 0; }
          100% { transform: translateY(-55px); opacity: 0; }
        }

        .point:nth-child(1) { left: 10%; animation-duration: 2.35s; animation-delay: 0.2s; }
        .point:nth-child(2) { left: 30%; animation-duration: 2.5s; animation-delay: 0.5s; }
        .point:nth-child(3) { left: 25%; animation-duration: 2.2s; animation-delay: 0.1s; }
        .point:nth-child(4) { left: 44%; animation-duration: 2.05s; }
        .point:nth-child(5) { left: 50%; animation-duration: 1.9s; }
        .point:nth-child(6) { left: 75%; animation-duration: 1.5s; animation-delay: 1.5s; }
        .point:nth-child(7) { left: 88%; animation-duration: 2.2s; animation-delay: 0.2s; }
        .point:nth-child(8) { left: 58%; animation-duration: 2.25s; animation-delay: 0.2s; }
        .point:nth-child(9) { left: 98%; animation-duration: 2.6s; animation-delay: 0.1s; }
        .point:nth-child(10) { left: 65%; animation-duration: 2.5s; animation-delay: 0.2s; }
      `}</style>

      <div className="purple-bg-wrapper">
        <div className="points_wrapper">
          {[...Array(10)].map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <i key={i} className="point"></i>
          ))}
        </div>
      </div>
    </>
  );
};

export default PurpleBackground;
