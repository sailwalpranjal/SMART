export type ProductType = 'clothing' | 'shoes' | 'furniture' | 'jewelry' | 'glasses' | 'electronics' | 'general'|'accessories';

export interface ARTrackingData {
  type: 'pose' | 'face' | 'space' | 'hands';
  landmarks?: any[];
  worldLandmarks?: any[];
  segmentationMask?: any;
  planes?: any[];
  lighting?: {
    intensity: number;
    color: string;
  };
}
