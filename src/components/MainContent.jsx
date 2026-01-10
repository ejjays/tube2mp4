import meowCool from '../assets/meow.png';
import { Link } from 'lucide-react';
import YouTubeIcon from '../assets/icons/YouTubeIcon.jsx';
import MusicIcon from '../assets/icons/MusicIcon.jsx';
import PasteIcon from '../assets/icons/PasteIcon.jsx';
import GlowButton from './ui/GlowButton.jsx';


const MainContent = () => {
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
        <input className="border-cyan-400 border-2 p-2 w-full rounded-xl placeholder-gray-500 pl-10 focus:outline-none bg-transparent text-white"
          type="text" 
          placeholder="paste your link here"
        />
      </div>
      <div className="w-full max-w-md mt-1"> 
        <div className="flex bg-cyan-500 w-full rounded-2xl divide-x divide-white/40 overflow-hidden shadow-lg">
          <button className="btns">
            <YouTubeIcon size={24} />
            <span className="truncate">YouTube</span>
          </button>
          <button className="btns">
            <MusicIcon color="#fff" size={24} />
            <span className="truncate">Audio</span>
          </button>
          <button className="btns">
            <PasteIcon size={24} />
            <span className="truncate">Paste</span>
          </button>
        </div>
      </div>
      <div className="pt-2">
        <GlowButton text='Convert & Download' />
      </div>
    </div>
  );
};

export default MainContent;