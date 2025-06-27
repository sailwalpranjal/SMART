import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-6xl font-bold mb-8 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
          SMART AR Shopping
        </h1>
        <p className="text-xl mb-8 text-gray-300">
          Experience products in AR before you buy
        </p>
        <Link
          to="/scanner"
          className="inline-block px-8 py-4 bg-blue-600 rounded-full hover:bg-blue-700 transition"
        >
          Start Scanning
        </Link>
      </motion.div>
    </div>
  );
};

export default HomePage;