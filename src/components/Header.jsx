import { Plus } from 'lucide-react';

const Header = () => {
  return (
    <header className="flex gap-2 items-center justify-center p-4">
      <div className="bg-gray-800 p-1 rounded-full">
        <Plus size={14}/>
      </div>
      <h1 className="text-sm">supported services</h1>
    </header>
  );
};

export default Header;