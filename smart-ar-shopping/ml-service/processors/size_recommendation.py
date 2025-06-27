# ml-service/processors/size_recommendation.py
import numpy as np
import tensorflow as tf
from scipy.spatial import distance
import cv2
from typing import Dict, List, Tuple, Optional
import json

class SizeRecommendationEngine:
    def __init__(self):
        self.body_keypoints = {
            'nose': 0, 'left_eye': 1, 'right_eye': 2,
            'left_ear': 3, 'right_ear': 4,
            'left_shoulder': 5, 'right_shoulder': 6,
            'left_elbow': 7, 'right_elbow': 8,
            'left_wrist': 9, 'right_wrist': 10,
            'left_hip': 11, 'right_hip': 12,
            'left_knee': 13, 'right_knee': 14,
            'left_ankle': 15, 'right_ankle': 16
        }
        
        # Load pre-trained models
        self.load_models()
        
    def load_models(self):
        """Load ML models for size prediction"""
        try:
            self.size_model = tf.keras.models.load_model('models/size_predictor.h5')
            self.fit_model = tf.keras.models.load_model('models/fit_analyzer.h5')
        except:
            print("Models not found, using rule-based system")
            self.size_model = None
            self.fit_model = None
    
    def calculate_body_measurements(self, 
                                  pose_landmarks: List[Dict], 
                                  image_dimensions: Tuple[int, int],
                                  camera_distance: float = 1.5) -> Dict[str, float]:
        """
        Calculate body measurements from pose landmarks
        
        Args:
            pose_landmarks: List of normalized landmarks from pose detection
            image_dimensions: (width, height) of the image
            camera_distance: Estimated distance from camera in meters
        
        Returns:
            Dictionary of body measurements in cm
        """
        
        # Convert normalized landmarks to pixel coordinates
        landmarks_px = []
        for landmark in pose_landmarks:
            x = landmark['x'] * image_dimensions[0]
            y = landmark['y'] * image_dimensions[1]
            z = landmark.get('z', 0) * 100  # Scale Z coordinate
            landmarks_px.append([x, y, z])
        
        landmarks_px = np.array(landmarks_px)
        
        # Calculate key measurements
        measurements = {}
        
        # Shoulder width
        left_shoulder = landmarks_px[self.body_keypoints['left_shoulder']]
        right_shoulder = landmarks_px[self.body_keypoints['right_shoulder']]
        shoulder_width_px = distance.euclidean(left_shoulder[:2], right_shoulder[:2])
        
        # Height estimation (from head to feet)
        nose = landmarks_px[self.body_keypoints['nose']]
        left_ankle = landmarks_px[self.body_keypoints['left_ankle']]
        right_ankle = landmarks_px[self.body_keypoints['right_ankle']]
        ankle_midpoint = (left_ankle + right_ankle) / 2
        height_px = distance.euclidean(nose[:2], ankle_midpoint[:2])
        
        # Torso length
        left_hip = landmarks_px[self.body_keypoints['left_hip']]
        right_hip = landmarks_px[self.body_keypoints['right_hip']]
        hip_midpoint = (left_hip + right_hip) / 2
        shoulder_midpoint = (left_shoulder + right_shoulder) / 2
        torso_length_px = distance.euclidean(shoulder_midpoint[:2], hip_midpoint[:2])
        
        # Arm length
        left_wrist = landmarks_px[self.body_keypoints['left_wrist']]
        arm_length_px = (
            distance.euclidean(left_shoulder[:2], landmarks_px[self.body_keypoints['left_elbow']][:2]) +
            distance.euclidean(landmarks_px[self.body_keypoints['left_elbow']][:2], left_wrist[:2])
        )
        
        # Hip width
        hip_width_px = distance.euclidean(left_hip[:2], right_hip[:2])
        
        # Convert pixels to real-world measurements
        # Assume average human height for calibration
        average_height_cm = 170
        pixel_to_cm_ratio = average_height_cm / height_px
        
        # Apply camera distance correction
        distance_correction = camera_distance / 1.5  # Normalized to 1.5m
        
        measurements['height'] = height_px * pixel_to_cm_ratio
        measurements['shoulder_width'] = shoulder_width_px * pixel_to_cm_ratio * distance_correction
        measurements['chest_circumference'] = measurements['shoulder_width'] * 2.8  # Approximation
        measurements['waist_circumference'] = hip_width_px * pixel_to_cm_ratio * distance_correction * 2.5
        measurements['hip_circumference'] = hip_width_px * pixel_to_cm_ratio * distance_correction * 2.8
        measurements['torso_length'] = torso_length_px * pixel_to_cm_ratio
        measurements['arm_length'] = arm_length_px * pixel_to_cm_ratio
        measurements['inseam'] = (measurements['height'] - measurements['torso_length']) * 0.45
        
        # Add confidence scores based on landmark visibility
        visibility_scores = [landmark.get('visibility', 1.0) for landmark in pose_landmarks]
        measurements['confidence'] = np.mean(visibility_scores)
        
        return measurements
    
    def recommend_size(self, 
                      body_measurements: Dict[str, float],
                      product_measurements: Dict[str, Dict[str, float]],
                      product_type: str) -> Dict:
        """
        Recommend size based on body and product measurements
        
        Args:
            body_measurements: User's body measurements
            product_measurements: Size chart from product
            product_type: Type of clothing (shirt, pants, dress, etc.)
        
        Returns:
            Size recommendation with confidence scores
        """
        
        if self.size_model:
            return self._ml_size_recommendation(body_measurements, product_measurements, product_type)
        else:
            return self._rule_based_size_recommendation(body_measurements, product_measurements, product_type)
    
    def _rule_based_size_recommendation(self, 
                                       body_measurements: Dict[str, float],
                                       product_measurements: Dict[str, Dict[str, float]],
                                       product_type: str) -> Dict:
        """Rule-based size recommendation system"""
        
        recommendations = []
        
        # Define tolerance for different product types
        tolerances = {
            'shirt': {'chest': 5, 'waist': 8, 'length': 3},
            'pants': {'waist': 3, 'hip': 5, 'inseam': 2},
            'dress': {'chest': 4, 'waist': 6, 'hip': 6},
            'jacket': {'chest': 6, 'shoulder': 2, 'length': 4},
            'default': {'chest': 5, 'waist': 5, 'hip': 5}
        }
        
        product_tolerance = tolerances.get(product_type, tolerances['default'])
        
        for size, size_measurements in product_measurements.items():
            fit_scores = {}
            total_score = 0
            total_weight = 0
            
            # Compare chest/bust
            if 'chest' in size_measurements and 'chest_circumference' in body_measurements:
                chest_diff = abs(body_measurements['chest_circumference'] - size_measurements['chest'])
                chest_score = max(0, 100 - (chest_diff / product_tolerance.get('chest', 5)) * 50)
                fit_scores['chest'] = {
                    'score': chest_score,
                    'difference': chest_diff,
                    'fit': self._get_fit_description(chest_diff, product_tolerance.get('chest', 5))
                }
                total_score += chest_score * 0.4
                total_weight += 0.4
            
            # Compare waist
            if 'waist' in size_measurements and 'waist_circumference' in body_measurements:
                waist_diff = abs(body_measurements['waist_circumference'] - size_measurements['waist'])
                waist_score = max(0, 100 - (waist_diff / product_tolerance.get('waist', 5)) * 50)
                fit_scores['waist'] = {
                    'score': waist_score,
                    'difference': waist_diff,
                    'fit': self._get_fit_description(waist_diff, product_tolerance.get('waist', 5))
                }
                total_score += waist_score * 0.3
                total_weight += 0.3
            
            # Compare hip
            if 'hip' in size_measurements and 'hip_circumference' in body_measurements:
                hip_diff = abs(body_measurements['hip_circumference'] - size_measurements['hip'])
                hip_score = max(0, 100 - (hip_diff / product_tolerance.get('hip', 5)) * 50)
                fit_scores['hip'] = {
                    'score': hip_score,
                    'difference': hip_diff,
                    'fit': self._get_fit_description(hip_diff, product_tolerance.get('hip', 5))
                }
                total_score += hip_score * 0.3
                total_weight += 0.3
            
            # Calculate overall fit score
            overall_score = total_score / total_weight if total_weight > 0 else 0
            
            recommendations.append({
                'size': size,
                'overall_score': overall_score,
                'fit_scores': fit_scores,
                'confidence': body_measurements.get('confidence', 0.8) * (overall_score / 100)
            })
        
        # Sort by overall score
        recommendations.sort(key=lambda x: x['overall_score'], reverse=True)
        
        # Prepare final recommendation
        best_size = recommendations[0] if recommendations else None
        alternative_sizes = [r for r in recommendations[1:] if r['overall_score'] > 70]
        
        return {
            'recommended_size': best_size['size'] if best_size else 'M',
            'fit_score': best_size['overall_score'] if best_size else 0,
            'confidence': best_size['confidence'] if best_size else 0,
            'fit_details': best_size['fit_scores'] if best_size else {},
            'alternative_sizes': [{'size': r['size'], 'score': r['overall_score']} 
                                for r in alternative_sizes[:2]],
            'measurement_quality': self._assess_measurement_quality(body_measurements)
        }
    
    def _get_fit_description(self, difference: float, tolerance: float) -> str:
        """Get fit description based on measurement difference"""
        if difference < tolerance * 0.5:
            return "Perfect fit"
        elif difference < tolerance:
            return "Good fit"
        elif difference < tolerance * 1.5:
            return "Slightly loose" if difference > 0 else "Slightly tight"
        else:
            return "Too loose" if difference > 0 else "Too tight"
    
    def _assess_measurement_quality(self, measurements: Dict[str, float]) -> str:
        """Assess the quality of body measurements"""
        confidence = measurements.get('confidence', 0)
        
        if confidence > 0.9:
            return "Excellent"
        elif confidence > 0.8:
            return "Good"
        elif confidence > 0.7:
            return "Fair"
        else:
            return "Poor - Please ensure full body is visible"
    
    def calculate_virtual_fit(self,
                            body_measurements: Dict[str, float],
                            product_data: Dict,
                            selected_size: str) -> Dict:
        """
        Calculate how the garment will fit virtually
        
        Returns:
            Virtual fit data including stretch areas, tight spots, etc.
        """
        
        if selected_size not in product_data.get('measurements', {}):
            return {'error': 'Size not found'}
        
        size_measurements = product_data['measurements'][selected_size]
        material_properties = self._estimate_material_properties(product_data.get('materials', []))
        
        fit_analysis = {
            'overall_fit': 'good',
            'problem_areas': [],
            'stretch_areas': [],
            'comfort_score': 85,
            'movement_restriction': 'minimal',
            'visual_adjustments': {}
        }
        
        # Analyze chest/bust fit
        if 'chest' in size_measurements:
            chest_diff = body_measurements.get('chest_circumference', 0) - size_measurements['chest']
            if chest_diff > 5:
                fit_analysis['problem_areas'].append({
                    'area': 'chest',
                    'issue': 'too_tight',
                    'severity': min(chest_diff / 10, 1.0)
                })
                fit_analysis['visual_adjustments']['chest_stretch'] = chest_diff / 100
            elif chest_diff < -10:
                fit_analysis['problem_areas'].append({
                    'area': 'chest',
                    'issue': 'too_loose',
                    'severity': min(abs(chest_diff) / 15, 1.0)
                })
        
        # Calculate stretch based on material
        if material_properties['stretch_factor'] > 0:
            fit_analysis['stretch_areas'] = self._calculate_stretch_areas(
                body_measurements, size_measurements, material_properties
            )
        
        # Comfort score calculation
        comfort_factors = []
        for area in fit_analysis['problem_areas']:
            comfort_factors.append(1 - area['severity'] * 0.3)
        
        if comfort_factors:
            fit_analysis['comfort_score'] = int(np.mean(comfort_factors) * 100)
        
        return fit_analysis
    
    def _estimate_material_properties(self, materials: List[str]) -> Dict:
        """Estimate material properties from material description"""
        
        properties = {
            'stretch_factor': 0,
            'breathability': 0.5,
            'thickness': 0.5,
            'drape': 0.5
        }
        
        material_text = ' '.join(materials).lower()
        
        # Stretch factor
        if any(word in material_text for word in ['spandex', 'elastane', 'lycra', 'stretch']):
            properties['stretch_factor'] = 0.15
        elif 'cotton' in material_text and 'stretch' in material_text:
            properties['stretch_factor'] = 0.08
        
        # Breathability
        if any(word in material_text for word in ['cotton', 'linen', 'bamboo']):
            properties['breathability'] = 0.8
        elif any(word in material_text for word in ['polyester', 'nylon']):
            properties['breathability'] = 0.4
        
        return properties
    
    def _calculate_stretch_areas(self, 
                               body_measurements: Dict,
                               size_measurements: Dict,
                               material_properties: Dict) -> List[Dict]:
        """Calculate where the garment will stretch"""
        
        stretch_areas = []
        stretch_factor = material_properties['stretch_factor']
        
        # Check each measurement point
        measurement_mapping = {
            'chest_circumference': 'chest',
            'waist_circumference': 'waist',
            'hip_circumference': 'hip'
        }
        
        for body_key, product_key in measurement_mapping.items():
            if body_key in body_measurements and product_key in size_measurements:
                diff = body_measurements[body_key] - size_measurements[product_key]
                
                if diff > 0 and diff <= size_measurements[product_key] * stretch_factor:
                    stretch_areas.append({
                        'area': product_key,
                        'stretch_percentage': (diff / size_measurements[product_key]) * 100,
                        'within_limits': True
                    })
                elif diff > size_measurements[product_key] * stretch_factor:
                    stretch_areas.append({
                        'area': product_key,
                        'stretch_percentage': stretch_factor * 100,
                        'within_limits': False,
                        'excess': diff - (size_measurements[product_key] * stretch_factor)
                    })
        
        return stretch_areas


class FurniturePlacementEngine:
    """Engine for furniture AR placement and room analysis"""
    
    def __init__(self):
        self.min_floor_area = 0.5  # Minimum floor area in sq meters
        
    def analyze_room_space(self, 
                          depth_map: np.ndarray,
                          camera_intrinsics: Dict,
                          detected_planes: List[Dict]) -> Dict:
        """
        Analyze room space for furniture placement
        
        Args:
            depth_map: Depth information from camera/estimation
            camera_intrinsics: Camera parameters
            detected_planes: List of detected planes (floor, walls)
        
        Returns:
            Room analysis with placement suggestions
        """
        
        room_analysis = {
            'floor_area': 0,
            'available_spaces': [],
            'walls': [],
            'obstacles': [],
            'lighting': self._estimate_lighting(depth_map),
            'recommended_positions': []
        }
        
        # Find floor plane
        floor_plane = self._find_floor_plane(detected_planes)
        if floor_plane:
            room_analysis['floor_area'] = self._calculate_floor_area(floor_plane)
            
            # Find available spaces on floor
            room_analysis['available_spaces'] = self._find_available_spaces(
                floor_plane, depth_map, camera_intrinsics
            )
        
        # Detect walls
        room_analysis['walls'] = self._detect_walls(detected_planes, floor_plane)
        
        # Detect obstacles
        room_analysis['obstacles'] = self._detect_obstacles(depth_map, floor_plane)
        
        return room_analysis
    
    def calculate_furniture_placement(self,
                                    room_analysis: Dict,
                                    furniture_dimensions: Dict,
                                    furniture_type: str) -> Dict:
        """
        Calculate optimal furniture placement
        
        Args:
            room_analysis: Room analysis data
            furniture_dimensions: Furniture dimensions (width, height, depth)
            furniture_type: Type of furniture (sofa, table, chair, etc.)
        
        Returns:
            Placement recommendations with positions and orientations
        """
        
        placements = []
        
        # Convert furniture dimensions from inches to meters
        furniture_size = {
            'width': furniture_dimensions.get('width', 36) * 0.0254,
            'height': furniture_dimensions.get('height', 30) * 0.0254,
            'depth': furniture_dimensions.get('depth', 36) * 0.0254
        }
        
        # Find suitable positions
        for space in room_analysis['available_spaces']:
            if self._can_fit_furniture(space, furniture_size):
                placement = {
                    'position': space['center'],
                    'rotation': self._calculate_optimal_rotation(
                        space, furniture_size, furniture_type, room_analysis['walls']
                    ),
                    'scale': 1.0,
                    'confidence': self._calculate_placement_confidence(
                        space, furniture_size, furniture_type
                    ),
                    'clearance': self._calculate_clearance(space, furniture_size),
                    'lighting_quality': self._assess_position_lighting(
                        space['center'], room_analysis['lighting']
                    )
                }
                
                placements.append(placement)
        
        # Sort by confidence
        placements.sort(key=lambda x: x['confidence'], reverse=True)
        
        # Add placement warnings
        warnings = []
        if not placements:
            warnings.append("No suitable space found for this furniture")
        elif placements[0]['clearance'] < 0.5:
            warnings.append("Limited walking space around furniture")
        
        return {
            'recommended_placements': placements[:3],  # Top 3 positions
            'furniture_fits': len(placements) > 0,
            'warnings': warnings,
            'room_compatibility_score': self._calculate_room_compatibility(
                room_analysis, furniture_size, furniture_type
            )
        }
    
    def _find_floor_plane(self, planes: List[Dict]) -> Optional[Dict]:
        """Find the floor plane from detected planes"""
        for plane in planes:
            # Floor plane should have normal pointing up (0, 1, 0)
            normal = plane.get('normal', [0, 0, 0])
            if normal[1] > 0.9:  # Mostly vertical
                return plane
        return None
    
    def _calculate_floor_area(self, floor_plane: Dict) -> float:
        """Calculate available floor area"""
        if 'boundary' in floor_plane:
            # Calculate polygon area
            points = floor_plane['boundary']
            area = 0
            for i in range(len(points)):
                j = (i + 1) % len(points)
                area += points[i][0] * points[j][2]
                area -= points[j][0] * points[i][2]
            return abs(area) / 2
        return 0
    
    def _find_available_spaces(self, 
                              floor_plane: Dict,
                              depth_map: np.ndarray,
                              camera_intrinsics: Dict) -> List[Dict]:
        """Find available spaces on the floor"""
        available_spaces = []
        
        # Grid-based approach to find empty spaces
        grid_size = 0.1  # 10cm grid
        height_threshold = 0.1  # 10cm height threshold for obstacles
        
        # This is a simplified version - in production, you'd use
        # more sophisticated algorithms
        
        # Mock implementation
        available_spaces.append({
            'center': [0, 0, -2],  # 2 meters in front
            'size': [3, 3],  # 3x3 meter space
            'shape': 'rectangle'
        })
        
        return available_spaces
    
    def _can_fit_furniture(self, space: Dict, furniture_size: Dict) -> bool:
        """Check if furniture can fit in the space"""
        space_size = space.get('size', [0, 0])
        
        # Check both orientations
        fits_normal = (furniture_size['width'] <= space_size[0] and 
                      furniture_size['depth'] <= space_size[1])
        fits_rotated = (furniture_size['depth'] <= space_size[0] and 
                       furniture_size['width'] <= space_size[1])
        
        return fits_normal or fits_rotated
    
    def _calculate_optimal_rotation(self,
                                   space: Dict,
                                   furniture_size: Dict,
                                   furniture_type: str,
                                   walls: List[Dict]) -> float:
        """Calculate optimal rotation for furniture"""
        
        # Default orientations for different furniture types
        if furniture_type == 'sofa' and walls:
            # Sofa should face away from nearest wall
            nearest_wall = min(walls, key=lambda w: 
                             self._distance_to_wall(space['center'], w))
            # Calculate angle to face away from wall
            return self._angle_away_from_wall(space['center'], nearest_wall)
        
        elif furniture_type == 'table':
            # Table should align with room
            return 0  # Default alignment
        
        elif furniture_type == 'tv_stand' and walls:
            # TV stand should be against a wall
            return self._angle_along_wall(space['center'], walls[0])
        
        return 0  # Default no rotation
    
    def _calculate_placement_confidence(self,
                                       space: Dict,
                                       furniture_size: Dict,
                                       furniture_type: str) -> float:
        """Calculate confidence score for placement"""
        
        confidence = 1.0
        
        # Size fit factor
        space_size = space.get('size', [0, 0])
        size_ratio = (furniture_size['width'] * furniture_size['depth']) / \
                    (space_size[0] * space_size[1])
        
        if size_ratio > 0.8:
            confidence *= 0.7  # Too tight
        elif size_ratio < 0.2:
            confidence *= 0.8  # Too much empty space
        
        # Furniture type specific factors
        if furniture_type == 'sofa':
            # Sofas need more clearance
            if space_size[0] < furniture_size['width'] + 1.0:
                confidence *= 0.6
        
        return confidence
    
    def _estimate_lighting(self, depth_map: np.ndarray) -> Dict:
        """Estimate room lighting from image"""
        # Simplified lighting estimation
        brightness = np.mean(depth_map)
        
        return {
            'intensity': brightness / 255.0,
            'direction': [0, -1, 0],  # Top-down
            'color_temperature': 5000  # Kelvin
        }
    
    def _detect_walls(self, planes: List[Dict], floor_plane: Optional[Dict]) -> List[Dict]:
        """Detect walls from planes"""
        walls = []
        
        for plane in planes:
            normal = plane.get('normal', [0, 0, 0])
            # Walls have horizontal normals
            if abs(normal[1]) < 0.1:  # Not floor or ceiling
                walls.append(plane)
        
        return walls
    
    def _detect_obstacles(self, depth_map: np.ndarray, floor_plane: Optional[Dict]) -> List[Dict]:
        """Detect obstacles in the room"""
        # Simplified obstacle detection
        # In production, use proper segmentation
        return []
    
    def _calculate_clearance(self, space: Dict, furniture_size: Dict) -> float:
        """Calculate clearance around furniture"""
        space_size = space.get('size', [0, 0])
        
        clearance_x = (space_size[0] - furniture_size['width']) / 2
        clearance_z = (space_size[1] - furniture_size['depth']) / 2
        
        return min(clearance_x, clearance_z)
    
    def _assess_position_lighting(self, position: List[float], lighting: Dict) -> str:
        """Assess lighting quality at position"""
        if lighting['intensity'] > 0.7:
            return "Good"
        elif lighting['intensity'] > 0.4:
            return "Moderate"
        else:
            return "Low"
    
    def _calculate_room_compatibility(self,
                                     room_analysis: Dict,
                                     furniture_size: Dict,
                                     furniture_type: str) -> float:
        """Calculate overall room compatibility score"""
        
        score = 1.0
        
        # Check if furniture fits at all
        if not room_analysis['available_spaces']:
            return 0.0
        
        # Size compatibility
        furniture_area = furniture_size['width'] * furniture_size['depth']
        room_area = room_analysis.get('floor_area', 10)
        
        area_ratio = furniture_area / room_area
        if area_ratio > 0.3:
            score *= 0.7  # Furniture too large for room
        elif area_ratio < 0.05:
            score *= 0.8  # Furniture too small
        
        # Type-specific compatibility
        if furniture_type == 'sofa' and not room_analysis.get('walls'):
            score *= 0.8  # Sofas work better with walls
        
        return score
    
    def _distance_to_wall(self, position: List[float], wall: Dict) -> float:
        """Calculate distance from position to wall"""
        # Simplified distance calculation
        return 1.0
    
    def _angle_away_from_wall(self, position: List[float], wall: Dict) -> float:
        """Calculate angle to face away from wall"""
        # Simplified angle calculation
        return 0.0
    
    def _angle_along_wall(self, position: List[float], wall: Dict) -> float:
        """Calculate angle to align with wall"""
        # Simplified angle calculation
        return 0.0


# Export main functions
def process_size_recommendation(body_landmarks, image_dimensions, product_data):
    """Main entry point for size recommendation"""
    engine = SizeRecommendationEngine()
    
    # Calculate body measurements
    measurements = engine.calculate_body_measurements(
        body_landmarks, 
        image_dimensions,
        camera_distance=1.5  # Default distance
    )
    
    # Get size recommendation
    recommendation = engine.recommend_size(
        measurements,
        product_data.get('measurements', {}),
        product_data.get('type', 'clothing')
    )
    
    # Calculate virtual fit
    if 'recommended_size' in recommendation:
        virtual_fit = engine.calculate_virtual_fit(
            measurements,
            product_data,
            recommendation['recommended_size']
        )
        recommendation['virtual_fit'] = virtual_fit
    
    return recommendation


def process_furniture_placement(room_data, furniture_data):
    """Main entry point for furniture placement"""
    engine = FurniturePlacementEngine()
    
    # Analyze room
    room_analysis = engine.analyze_room_space(
        room_data.get('depth_map', np.zeros((480, 640))),
        room_data.get('camera_intrinsics', {}),
        room_data.get('detected_planes', [])
    )
    
    # Calculate placement
    placement = engine.calculate_furniture_placement(
        room_analysis,
        furniture_data.get('dimensions', {}),
        furniture_data.get('type', 'furniture')
    )
    
    return placement