// frontend/src/store/useStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface Product {
  id: string;
  name: string;
  price: number;
  type: string;
  images: string[];
  processedImages: any[];
  measurements?: any;
  dimensions?: any;
  sizeChart?: any;
  description?: string;
  specifications?: any;
}

interface UserMeasurements {
  height?: number;
  shoulderWidth?: number;
  chestCircumference?: number;
  waistCircumference?: number;
  hipCircumference?: number;
  armLength?: number;
  inseam?: number;
  confidence?: number;
  torsoHeight?: number;
}

interface ARState {
  isActive: boolean;
  trackingQuality: number;
  currentMode: 'pose' | 'face' | 'space' | 'hands' | null;
  emotionState: string;
  sizeRecommendation: any;
}

interface AppState {
  // User
  userMeasurements: UserMeasurements;
  userPreferences: {
    fitPreference: 'tight' | 'regular' | 'loose';
    stylePreferences: string[];
  };
  
  // Products
  currentProduct: Product | null;
  productHistory: Product[];
  favorites: Product[];
  
  // AR State
  arState: ARState;
  
  // UI State
  isLoading: boolean;
  error: string | null;
  tutorialCompleted: boolean;
  
  // Actions
  setCurrentProduct: (product: Product) => void;
  addToHistory: (product: Product) => void;
  addToFavorites: (product: Product) => void;
  removeFromFavorites: (productId: string) => void;
  
  updateMeasurements: (measurements: Partial<UserMeasurements>) => void;
  setUserPreferences: (preferences: any) => void;
  
  setARActive: (active: boolean) => void;
  setTrackingQuality: (quality: number) => void;
  updateARState: (state: Partial<ARState>) => void;
  
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  initializeApp: () => void;
  resetApp: () => void;
}

export const useStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        userMeasurements: {},
        userPreferences: {
          fitPreference: 'regular',
          stylePreferences: []
        },
        currentProduct: null,
        productHistory: [],
        favorites: [],
        arState: {
          isActive: false,
          trackingQuality: 0,
          currentMode: null,
          emotionState: 'neutral',
          sizeRecommendation: null
        },
        isLoading: false,
        error: null,
        tutorialCompleted: false,

        // Actions
        setCurrentProduct: (product) => set({ currentProduct: product }),
        
        addToHistory: (product) => 
          set((state) => ({
            productHistory: [
              product,
              ...state.productHistory.filter(p => p.id !== product.id)
            ].slice(0, 10) // Keep last 10
          })),
        
        addToFavorites: (product) =>
          set((state) => ({
            favorites: [...state.favorites, product]
          })),
        
        removeFromFavorites: (productId) =>
          set((state) => ({
            favorites: state.favorites.filter(p => p.id !== productId)
          })),
        
        updateMeasurements: (measurements) =>
          set((state) => ({
            userMeasurements: { ...state.userMeasurements, ...measurements }
          })),
        
        setUserPreferences: (preferences) =>
          set((state) => ({
            userPreferences: { ...state.userPreferences, ...preferences }
          })),
        
        setARActive: (active) =>
          set((state) => ({
            arState: { ...state.arState, isActive: active }
          })),
        
        setTrackingQuality: (quality) =>
          set((state) => ({
            arState: { ...state.arState, trackingQuality: quality }
          })),
        
        updateARState: (newState) =>
          set((state) => ({
            arState: { ...state.arState, ...newState }
          })),
        
        setLoading: (loading) => set({ isLoading: loading }),
        setError: (error) => set({ error }),
        clearError: () => set({ error: null }),
        
        initializeApp: async () => {
          // Initialize app, check permissions, etc.
          const state = get();
          if (!state.tutorialCompleted) {
            // Show tutorial
          }
          
          // Check camera permissions
          try {
            await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (error) {
            set({ error: 'Camera access required for AR features' });
          }
        },
        
        resetApp: () => {
          set({
            userMeasurements: {},
            currentProduct: null,
            productHistory: [],
            favorites: [],
            arState: {
              isActive: false,
              trackingQuality: 0,
              currentMode: null,
              emotionState: 'neutral',
              sizeRecommendation: null
            },
            isLoading: false,
            error: null
          });
        }
      }),
      {
        name: 'smart-ar-storage',
        partialize: (state) => ({
          userMeasurements: state.userMeasurements,
          userPreferences: state.userPreferences,
          favorites: state.favorites,
          tutorialCompleted: state.tutorialCompleted,
          productHistory: state.productHistory.slice(0, 5) // Only persist last 5
        })
      }
    )
  )
);