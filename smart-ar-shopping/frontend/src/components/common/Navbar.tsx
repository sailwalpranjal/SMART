import React from 'react';
import { Link } from 'react-router-dom';

const Navbar: React.FC = () => {
  return (
    <nav className="fixed top-0 w-full bg-black/80 backdrop-blur-md z-50 p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-white">SMART</Link>
        <div className="flex gap-4">
          <Link to="/scanner" className="text-white hover:text-blue-400 transition">Scanner</Link>
          <Link to="/ar-experience" className="text-white hover:text-blue-400 transition">AR</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
