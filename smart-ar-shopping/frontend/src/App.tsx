import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import HomePage from './pages/HomePage';
import ScannerPage from './pages/ScannerPage';
import ARExperiencePage from './pages/ARExperiencePage';
import Navbar from './components/common/Navbar';
import { useStore } from './store/useStore';
import './styles/globals.css';

function App() {
  const initializeApp = useStore((state) => state.initializeApp);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  return (
    <Router>
      <div className="min-h-screen bg-black text-white">
        <Navbar />
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/scanner" element={<ScannerPage />} />
            <Route path="/ar-experience" element={<ARExperiencePage />} />
          </Routes>
        </AnimatePresence>
      </div>
    </Router>
  );
}

export default App;