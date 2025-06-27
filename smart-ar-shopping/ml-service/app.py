from flask import Flask, request, jsonify
from flask_cors import CORS
from processors.size_recommendation import process_size_recommendation, process_furniture_placement

app = Flask(__name__)
CORS(app)

@app.route('/api/size-recommendation', methods=['POST'])
def size_recommendation():
    data = request.json
    result = process_size_recommendation(
        data['bodyLandmarks'],
        data['imageDimensions'],
        data['productData']
    )
    return jsonify(result)

@app.route('/api/furniture-placement', methods=['POST'])
def furniture_placement():
    data = request.json
    result = process_furniture_placement(
        data['roomData'],
        data['furnitureData']
    )
    return jsonify(result)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
