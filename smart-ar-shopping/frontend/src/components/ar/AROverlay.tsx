// frontend/src/components/ar/AROverlay.tsx
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture, Float, Environment } from '@react-three/drei';
import * as THREE from 'three';
import type { ARTrackingData, ProductType } from '../../types';

interface AROverlayProps {
  product: any;
  productType: ProductType;
  trackingData: ARTrackingData;
}

const AROverlay: React.FC<AROverlayProps> = ({ product, productType, trackingData }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, size } = useThree();

  // Load product textures
  const productTexture = useTexture(product.processedImage || product.image) as THREE.Texture;

  // Position and scale product based on tracking data
  useFrame(() => {
    if (!meshRef.current || !trackingData) return;

    switch (trackingData.type) {
      case 'pose':
        renderClothing();
        break;
      case 'face':
        renderAccessory();
        break;
      case 'space':
        renderFurniture();
        break;
      case 'hands':
        renderHandheld();
        break;
    }
  });

  const renderClothing = () => {
    if (!meshRef.current || trackingData.type !== 'pose') return;

    const landmarks = trackingData.landmarks;
    if (!landmarks) return;
    // Calculate body center and dimensions
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    const centerX = (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4;
    const centerY = (leftShoulder.y + rightShoulder.y + leftHip.y + rightHip.y) / 4;
    
    // Convert normalized coords to 3D space
    const worldX = (centerX - 0.5) * 10;
    const worldY = -(centerY - 0.5) * 10;
    
    meshRef.current.position.set(worldX, worldY, 0);

    // Scale based on shoulder width
    const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
    const scale = shoulderWidth * 15;
    meshRef.current.scale.set(scale, scale * 1.5, 1);

    // Rotate based on body orientation
    const shoulderAngle = Math.atan2(
      rightShoulder.y - leftShoulder.y,
      rightShoulder.x - leftShoulder.x
    );
    meshRef.current.rotation.z = shoulderAngle;
  };

  const renderAccessory = () => {
    if (!meshRef.current || trackingData.type !== 'face') return;

    const landmarks = trackingData.landmarks;
    if (!landmarks) return;
    // Position based on face landmarks
    if (productType === 'glasses') {
      // Position between eyes
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const noseBridge = landmarks[6];
      
      const centerX = (leftEye.x + rightEye.x) / 2;
      const centerY = noseBridge.y;
      
      const worldX = (centerX - 0.5) * 10;
      const worldY = -(centerY - 0.5) * 10;
      
      meshRef.current.position.set(worldX, worldY, 0.5);
      
      // Scale based on eye distance
      const eyeDistance = Math.abs(rightEye.x - leftEye.x);
      const scale = eyeDistance * 8;
      meshRef.current.scale.set(scale, scale * 0.4, 1);
    } else if (productType === 'jewelry') {
      // Position for earrings, necklaces, etc.
      const chin = landmarks[152];
      const worldX = (chin.x - 0.5) * 10;
      const worldY = -(chin.y - 0.5) * 10 - 1;
      
      meshRef.current.position.set(worldX, worldY, 0.3);
      meshRef.current.scale.set(2, 2, 1);
    }
  };

  const renderFurniture = () => {
    if (!meshRef.current || trackingData.type !== 'space') return;
    
    // Position furniture on detected plane
    meshRef.current.position.set(0, -2, -5);
    meshRef.current.scale.set(
      product.dimensions?.width || 2,
      product.dimensions?.height || 2,
      product.dimensions?.depth || 2
    );
  };

  const renderHandheld = () => {
    if (!meshRef.current || trackingData.type !== 'hands') return;
    
    const hands = trackingData.landmarks;
    if (!hands) return;
    if (hands[0]) {
      const palmCenter = hands[0][9]; // Middle finger base
      const worldX = (palmCenter.x - 0.5) * 10;
      const worldY = -(palmCenter.y - 0.5) * 10;
      
      meshRef.current.position.set(worldX, worldY, 0);
      meshRef.current.scale.set(1.5, 1.5, 1.5);
    }
  };

  // Create appropriate geometry based on product type
  const geometry = useMemo(() => {
    switch (productType) {
      case 'clothing':
        return new THREE.PlaneGeometry(1, 1.5, 32, 32);
      case 'glasses':
        return new THREE.PlaneGeometry(1, 0.4);
      case 'jewelry':
        return new THREE.CircleGeometry(0.5, 32);
      case 'furniture':
        return new THREE.BoxGeometry(1, 1, 1);
      default:
        return new THREE.BoxGeometry(1, 1, 1);
    }
  }, [productType]);

  // Create material with product texture
  
  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      map: productTexture,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      roughness: 0.4,
      metalness: productType === 'jewelry' ? 0.8 : 0.1,
      clearcoat: productType === 'jewelry' ? 1 : 0,
      clearcoatRoughness: 0.1,
    });

    // Apply displacement for clothing
    if (productType === 'clothing' && trackingData.type === 'pose') {
      mat.displacementScale = 0.1;
    }

    return mat;
  }, [productTexture, productType, trackingData]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      
      {productType === 'furniture' && (
        <Environment preset="apartment" />
      )}
      
      <Float
        speed={productType === 'jewelry' ? 2 : 0}
        rotationIntensity={productType === 'jewelry' ? 0.5 : 0}
        floatIntensity={productType === 'jewelry' ? 0.5 : 0}
      >
        <mesh
          ref={meshRef}
          geometry={geometry}
          material={material}
          castShadow
          receiveShadow
        />
      </Float>

      {/* Add shadow plane for furniture */}
      {productType === 'furniture' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.01, -5]} receiveShadow>
          <planeGeometry args={[10, 10]} />
          <shadowMaterial opacity={0.3} />
        </mesh>
      )}
    </>
  );
};

export default AROverlay;