// frontend/src/components/ar/ARViewer.tsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import { Pose } from '@mediapipe/pose';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { Canvas } from '@react-three/fiber';
import { motion } from 'framer-motion';
import AROverlay from './AROverlay';
import { useStore } from '../../store/useStore';
import type { ProductType, ARTrackingData } from '../../types';

interface ARViewerProps {
  product: any;
  productType: ProductType;
}

const ARViewer: React.FC<ARViewerProps> = ({ product, productType }) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [trackingData, setTrackingData] = useState<ARTrackingData | null>(null);
  const [confidence, setConfidence] = useState(0);
  
  const { 
    setARActive, 
    setTrackingQuality,
    updateMeasurements 
  } = useStore();

  const initializeTracking = useCallback(async () => {
    if (!webcamRef.current?.video) return;

    setIsLoading(true);
    
    try {
      // Initialize appropriate tracking based on product type
      switch (productType) {
        case 'clothing':
        case 'shoes':
          await initializePoseTracking();
          break;
        case 'accessories':
        case 'jewelry':
        case 'glasses':
          await initializeFaceTracking();
          break;
        case 'furniture':
        case 'electronics':
          await initializeSpaceTracking();
          break;
        default:
          await initializeGeneralTracking();
      }
      
      setARActive(true);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to initialize tracking:', error);
      setIsLoading(false);
    }
  }, [productType, setARActive]);

  const initializePoseTracking = async () => {
    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    pose.setOptions({
      modelComplexity: 2,
      smoothLandmarks: true,
      enableSegmentation: true,
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults((results) => {
      if (results.poseLandmarks) {
        processBodyMeasurements(results.poseLandmarks);
        setTrackingData({
          type: 'pose',
          landmarks: results.poseLandmarks,
          worldLandmarks: results.poseWorldLandmarks,
          segmentationMask: results.segmentationMask
        });
        setConfidence(calculateConfidence(results.poseLandmarks));
      }
    });

    if (!webcamRef.current || !webcamRef.current.video) return;
    const camera = new Camera(webcamRef.current.video, {
      onFrame: async () => {
        await pose.send({ image: webcamRef.current!.video! });
      }
    });
    
    camera.start();
  };

  const initializeFaceTracking = async () => {
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        setTrackingData({
          type: 'face',
          landmarks: results.multiFaceLandmarks[0]
        });
        setConfidence(0.9);
      }
    });
    if (!webcamRef.current || !webcamRef.current.video) return;
    const camera = new Camera(webcamRef.current.video, {
      onFrame: async () => {
        await faceMesh.send({ image: webcamRef.current!.video! });
      }
    });
    
    camera.start();
  };

  const initializeSpaceTracking = async () => {
    // Initialize SLAM or depth-based tracking for furniture
    // This would integrate with WebXR or custom computer vision
    console.log('Initializing space tracking...');
    
    // Placeholder for room scanning
    setTrackingData({
      type: 'space',
      planes: [],
      lighting: { intensity: 1, color: '#ffffff' }
    });
    setConfidence(0.8);
  };

  const initializeGeneralTracking = async () => {
    // Basic object tracking for general products
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setTrackingData({
          type: 'hands',
          landmarks: results.multiHandLandmarks
        });
        setConfidence(0.85);
      }
    });

    if (!webcamRef.current || !webcamRef.current.video) return;
    const camera = new Camera(webcamRef.current.video, {
      onFrame: async () => {
        await hands.send({ image: webcamRef.current!.video! });
      }
    });
    
    camera.start();
  };

  const processBodyMeasurements = (landmarks: any[]) => {
    // Calculate body measurements from pose landmarks
    const shoulderWidth = calculateDistance(landmarks[11], landmarks[12]);
    const torsoHeight = calculateDistance(landmarks[11], landmarks[23]);
    const armLength = calculateDistance(landmarks[11], landmarks[15]);
    
    updateMeasurements({
      shoulderWidth: shoulderWidth * 100, // Convert to cm
      torsoHeight: torsoHeight * 100,
      armLength: armLength * 100,
      // Add more measurements as needed
    });
  };

  const calculateDistance = (point1: any, point2: any) => {
    return Math.sqrt(
      Math.pow(point2.x - point1.x, 2) + 
      Math.pow(point2.y - point1.y, 2) + 
      Math.pow(point2.z - point1.z, 2)
    );
  };

  const calculateConfidence = (landmarks: any[]) => {
    // Calculate tracking confidence based on landmark visibility
    const visibilitySum = landmarks.reduce((sum, landmark) => 
      sum + (landmark.visibility || 0), 0
    );
    return (visibilitySum / landmarks.length) * 100;
  };

  useEffect(() => {
    if (webcamRef.current?.video) {
      initializeTracking();
    }
  }, [initializeTracking]);

  return (
    <div className="relative w-full h-full">
      {/* Webcam Feed */}
      <Webcam
        ref={webcamRef}
        className="absolute inset-0 w-full h-full object-cover"
        mirrored={true}
        audio={false}
        videoConstraints={{
          width: 1920,
          height: 1080,
          facingMode: "user"
        }}
      />

      {/* AR Overlay Canvas */}
      <div className="absolute inset-0 pointer-events-none">
        <Canvas
          camera={{ position: [0, 0, 5], fov: 50 }}
          gl={{ alpha: true, antialias: true }}
        >
          {trackingData && (
            <AROverlay
              product={product}
              productType={productType}
              trackingData={trackingData}
            />
          )}
        </Canvas>
      </div>

      {/* UI Overlay */}
      <motion.div 
        className="absolute top-4 left-4 right-4 flex justify-between items-start"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Tracking Status */}
        <div className="bg-black/50 backdrop-blur-md rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              confidence > 80 ? 'bg-green-500' : 
              confidence > 50 ? 'bg-yellow-500' : 'bg-red-500'
            } animate-pulse`} />
            <span className="text-sm">
              Tracking: {confidence.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex space-x-2">
          <button className="bg-white/10 backdrop-blur-md rounded-full p-3 hover:bg-white/20 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button className="bg-white/10 backdrop-blur-md rounded-full p-3 hover:bg-white/20 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </motion.div>

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg">Initializing AR Experience...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ARViewer;