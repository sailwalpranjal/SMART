// frontend/src/pages/ScannerPage.tsx
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiLink, FiCamera, FiPackage, FiArrowRight, FiLoader } from 'react-icons/fi';
import axios from 'axios';
import { useStore } from '../store/useStore';

const ScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [productPreview, setProductPreview] = useState<any>(null);
  
  const { setCurrentProduct, addToHistory } = useStore();

  const handleScan = useCallback(async () => {
    if (!url) {
      setError('Please enter a valid Walmart URL');
      return;
    }

    // Validate Walmart URL
    if (!url.includes('walmart.com')) {
      setError('Please enter a valid Walmart product URL');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/products/parse', { url });
      const productData = response.data;
      
      setProductPreview(productData);
      setCurrentProduct(productData);
      addToHistory(productData);
      
      // Auto-navigate to AR experience after preview
      setTimeout(() => {
        navigate('/ar-experience');
      }, 2000);
      
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to parse product URL');
    } finally {
      setIsLoading(false);
    }
  }, [url, setCurrentProduct, addToHistory, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl w-full"
      >
        {/* Header */}
        <div className="text-center mb-12">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent mb-4"
          >
            Scan Any Product
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 text-lg"
          >
            Paste a Walmart product URL to experience it in AR
          </motion.p>
        </div>

        {/* Scanner Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 md:p-12 border border-white/10"
        >
          {/* URL Input */}
          <div className="relative mb-8">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <FiLink className="text-gray-400 text-xl" />
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleScan()}
              placeholder="https://www.walmart.com/ip/..."
              className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              disabled={isLoading}
            />
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scan Button */}
          <motion.button
            onClick={handleScan}
            disabled={isLoading || !url}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full py-4 rounded-2xl font-semibold text-white transition-all flex items-center justify-center space-x-3 ${
              isLoading || !url
                ? 'bg-gray-700 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'
            }`}
          >
            {isLoading ? (
              <>
                <FiLoader className="animate-spin text-xl" />
                <span>Analyzing Product...</span>
              </>
            ) : (
              <>
                <FiCamera className="text-xl" />
                <span>Scan Product</span>
              </>
            )}
          </motion.button>

          {/* Quick Examples */}
          <div className="mt-8 pt-8 border-t border-white/10">
            <p className="text-gray-400 text-sm mb-4">Try these examples:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { type: 'Clothing', icon: '👕', url: 'https://www.walmart.com/ip/example-shirt/123456' },
                { type: 'Furniture', icon: '🛋️', url: 'https://www.walmart.com/ip/example-sofa/789012' },
                { type: 'Electronics', icon: '💻', url: 'https://www.walmart.com/ip/example-laptop/345678' }
              ].map((example, index) => (
                <motion.button
                  key={index}
                  onClick={() => setUrl(example.url)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
                >
                  <div className="text-2xl mb-1">{example.icon}</div>
                  <div className="text-sm text-gray-400">{example.type}</div>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Product Preview */}
        <AnimatePresence>
          {productPreview && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="mt-8 bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Product Detected!</h3>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"
                />
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="relative aspect-square rounded-2xl overflow-hidden bg-white/5">
                  {productPreview.processedImages?.[0] ? (
                    <img
                      src={productPreview.processedImages[0].processed}
                      alt={productPreview.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FiPackage className="text-6xl text-gray-600" />
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <h4 className="text-xl font-semibold text-white">{productPreview.name}</h4>
                  <p className="text-3xl font-bold text-green-400">${productPreview.price}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                      {productPreview.type}
                    </span>
                    <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">
                      AR Ready
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm">
                    Preparing AR experience...
                  </p>
                </div>
              </div>
              
              <motion.div
                className="mt-6 flex items-center justify-center space-x-2 text-blue-400"
                animate={{ x: [0, 10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <span>Loading AR Experience</span>
                <FiArrowRight />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default ScannerPage;