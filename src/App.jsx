import Header from './components/Header.jsx';
import MainContent from './components/MainContent.jsx';
import Footer from './components/Footer.jsx';

const App = () => {
  return (
    <div className="flex flex-col min-h-dvh w-full relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="fixed rounded-full blur-[80px] -z-10 opacity-40 animate-float w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-purple-800 -top-12 -left-12 sm:-top-24 sm:-left-24 pointer-events-none"></div>
      <div className="fixed rounded-full blur-[80px] -z-10 opacity-40 animate-float w-[350px] h-[350px] sm:w-[600px] sm:h-[600px] bg-blue-900 -bottom-20 -right-20 sm:-bottom-36 sm:-right-36 pointer-events-none" style={{ animationDelay: '-5s' }}></div>
      <div className="fixed rounded-full blur-[80px] -z-10 opacity-20 animate-float w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] bg-pink-600 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ animationDelay: '-10s' }}></div>

      <Header />
      
      <main className="grow flex items-center justify-center -translate-y-10">
        <MainContent />
      </main>

      <footer className="px-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] shrink-0">
        <Footer />
      </footer>
    </div>
  );
};


export default App;