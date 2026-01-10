import Header from './components/Header.jsx';
import MainContent from './components/MainContent.jsx';
import Footer from './components/Footer.jsx';

const App = () => {
  return (
    <div className="flex flex-col min-h-dvh w-full">
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