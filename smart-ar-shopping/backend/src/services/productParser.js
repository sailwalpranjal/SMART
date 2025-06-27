// backend/src/services/productParser.js
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');
const tf = require('@tensorflow/tfjs-node');
const { removeBackground } = require('@imgly/background-removal-node');

class ProductParser {
  constructor() {
    this.initializeModels();
  }

  async initializeModels() {
    // Load models for image processing
    this.categoryModel = await tf.loadLayersModel('file://./models/category-classifier/model.json');
  }

  async parseWalmartURL(url) {
    try {
      // Extract product ID from URL
      const productId = this.extractProductId(url);
      
      // Fetch product page
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      // Extract product information
      const productData = {
        id: productId,
        name: this.extractProductName($),
        price: this.extractPrice($),
        images: this.extractImages($),
        description: this.extractDescription($),
        specifications: this.extractSpecifications($),
        sizeChart: this.extractSizeChart($),
        dimensions: this.extractDimensions($),
        category: this.extractCategory($),
        materials: this.extractMaterials($),
        colors: this.extractColors($),
        reviews: this.extractReviewSummary($)
      };

      // Determine product type and process accordingly
      productData.type = await this.classifyProductType(productData);
      
      // Process images for AR
      productData.processedImages = await this.processImagesForAR(
        productData.images,
        productData.type
      );

      // Extract measurement data if available
      if (productData.type === 'clothing' || productData.type === 'shoes') {
        productData.measurements = await this.extractMeasurements($, productData);
      }

      return productData;
    } catch (error) {
      console.error('Error parsing Walmart URL:', error);
      throw new Error('Failed to parse product URL');
    }
  }

  extractProductId(url) {
    const match = url.match(/\/ip\/[^\/]+\/(\d+)/);
    return match ? match[1] : null;
  }

  extractProductName($) {
    return $('h1[itemprop="name"]').text().trim() ||
           $('h1.prod-ProductTitle').text().trim() ||
           $('h1').first().text().trim();
  }

  extractPrice($) {
    const priceText = $('span[itemprop="price"]').attr('content') ||
                     $('.price-characteristic').attr('content') ||
                     $('span.price').text();
    
    return this.parsePrice(priceText);
  }

  extractImages($) {
    const images = [];
    
    // Main product images
    $('img[data-testid="hero-image"]').each((i, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src');
      if (src) images.push(this.normalizeImageURL(src));
    });

    // Thumbnail images
    $('.prod-hero-image-carousel-image img').each((i, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src');
      if (src) images.push(this.normalizeImageURL(src));
    });

    // Fallback selectors
    if (images.length === 0) {
      $('img').each((i, elem) => {
        const src = $(elem).attr('src');
        if (src && src.includes('i5.walmartimages.com')) {
          images.push(this.normalizeImageURL(src));
        }
      });
    }

    return [...new Set(images)]; // Remove duplicates
  }

  extractDescription($) {
    return $('.about-desc').text().trim() ||
           $('[data-testid="product-description"]').text().trim() ||
           $('.product-description').text().trim();
  }

  extractSpecifications($) {
    const specs = {};
    
    $('.specification-table tr, .specs-table tr').each((i, elem) => {
      const key = $(elem).find('td').first().text().trim();
      const value = $(elem).find('td').last().text().trim();
      if (key && value) {
        specs[key.toLowerCase().replace(/\s+/g, '_')] = value;
      }
    });

    return specs;
  }

  extractSizeChart($) {
    const sizeChart = {};
    
    // Look for size chart table
    $('.size-chart table tr, .sizing-chart table tr').each((i, elem) => {
      if (i === 0) return; // Skip header row
      
      const cells = $(elem).find('td');
      if (cells.length > 0) {
        const size = $(cells[0]).text().trim();
        const measurements = {};
        
        $(cells).each((j, cell) => {
          if (j === 0) return;
          const header = $('.size-chart th, .sizing-chart th').eq(j).text().trim();
          if (header) {
            measurements[header.toLowerCase()] = $(cell).text().trim();
          }
        });
        
        if (size) {
          sizeChart[size] = measurements;
        }
      }
    });

    return sizeChart;
  }

  extractDimensions($) {
    const dimensions = {};
    const dimensionText = $('div:contains("Dimensions")').next().text() ||
                         $('div:contains("Product dimensions")').next().text();
    
    if (dimensionText) {
      // Parse dimensions like "24" W x 36" H x 18" D"
      const matches = dimensionText.match(/(\d+\.?\d*)\s*"?\s*([WwHhDdLl])/g);
      if (matches) {
        matches.forEach(match => {
          const [, value, dimension] = match.match(/(\d+\.?\d*)\s*"?\s*([WwHhDdLl])/);
          switch (dimension.toLowerCase()) {
            case 'w':
              dimensions.width = parseFloat(value);
              break;
            case 'h':
              dimensions.height = parseFloat(value);
              break;
            case 'd':
            case 'l':
              dimensions.depth = parseFloat(value);
              break;
          }
        });
      }
    }

    return dimensions;
  }

  extractCategory($) {
    const breadcrumbs = [];
    $('.breadcrumb a, nav[aria-label="breadcrumb"] a').each((i, elem) => {
      breadcrumbs.push($(elem).text().trim());
    });
    
    return breadcrumbs.join(' > ') || 'General';
  }

  extractMaterials($) {
    const materials = [];
    
    $('div:contains("Material"), div:contains("Fabric")').each((i, elem) => {
      const text = $(elem).next().text() || $(elem).parent().text();
      if (text && !text.includes('Material')) {
        materials.push(text.trim());
      }
    });

    return materials;
  }

  extractColors($) {
    const colors = [];
    
    $('.variant-category[data-variant-category="actual_color"] button').each((i, elem) => {
      const color = $(elem).attr('aria-label') || $(elem).text().trim();
      if (color) colors.push(color);
    });

    return colors;
  }

  extractReviewSummary($) {
    return {
      rating: parseFloat($('[itemprop="ratingValue"]').attr('content') || '0'),
      count: parseInt($('[itemprop="reviewCount"]').text() || '0'),
    };
  }

  async extractMeasurements($, productData) {
    const measurements = {};
    
    // Extract from size chart
    if (productData.sizeChart) {
      Object.entries(productData.sizeChart).forEach(([size, data]) => {
        measurements[size] = {
          chest: this.parseMeasurement(data.chest || data.bust),
          waist: this.parseMeasurement(data.waist),
          hips: this.parseMeasurement(data.hips),
          length: this.parseMeasurement(data.length),
          sleeve: this.parseMeasurement(data.sleeve),
          inseam: this.parseMeasurement(data.inseam),
        };
      });
    }

    return measurements;
  }

  parseMeasurement(value) {
    if (!value) return null;
    
    // Extract numeric value from strings like "32-34 in" or "86 cm"
    const match = value.match(/(\d+\.?\d*)(?:-(\d+\.?\d*))?/);
    if (match) {
      if (match[2]) {
        // Range, return average
        return (parseFloat(match[1]) + parseFloat(match[2])) / 2;
      }
      return parseFloat(match[1]);
    }
    
    return null;
  }

  parsePrice(priceText) {
    if (!priceText) return null;
    
    const match = priceText.match(/\$?([\d,]+\.?\d*)/);
    return match ? parseFloat(match[1].replace(/,/g, '')) : null;
  }

  normalizeImageURL(url) {
    if (!url) return null;
    
    // Ensure high quality image
    if (url.includes('walmartimages.com')) {
      // Replace thumbnail indicators with full size
      url = url.replace(/\?.*$/, '');
      url = url.replace(/_\d+x\d+/, '');
    }
    
    // Ensure HTTPS
    if (url.startsWith('//')) {
      url = 'https:' + url;
    }
    
    return url;
  }

  async classifyProductType(productData) {
    // Use category and keywords to classify
    const category = productData.category.toLowerCase();
    const name = productData.name.toLowerCase();
    
    if (category.includes('clothing') || category.includes('apparel') ||
        name.includes('shirt') || name.includes('dress') || name.includes('pants') ||
        name.includes('jacket') || name.includes('coat')) {
      return 'clothing';
    }
    
    if (category.includes('shoes') || category.includes('footwear') ||
        name.includes('shoe') || name.includes('sneaker') || name.includes('boot')) {
      return 'shoes';
    }
    
    if (category.includes('furniture') || category.includes('home') ||
        name.includes('table') || name.includes('chair') || name.includes('sofa') ||
        name.includes('desk') || name.includes('bed')) {
      return 'furniture';
    }
    
    if (category.includes('jewelry') || category.includes('accessories') ||
        name.includes('ring') || name.includes('necklace') || name.includes('bracelet')) {
      return 'jewelry';
    }
    
    if (name.includes('glasses') || name.includes('sunglasses')) {
      return 'glasses';
    }
    
    if (category.includes('electronics') || category.includes('computers') ||
        name.includes('laptop') || name.includes('phone') || name.includes('tablet')) {
      return 'electronics';
    }
    
    return 'general';
  }

  async processImagesForAR(images, productType) {
    const processedImages = [];
    
    for (const imageUrl of images.slice(0, 5)) { // Process up to 5 images
      try {
        const processed = await this.processImage(imageUrl, productType);
        processedImages.push(processed);
      } catch (error) {
        console.error('Error processing image:', error);
      }
    }
    
    return processedImages;
  }

  async processImage(imageUrl, productType) {
    try {
      // Download image
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      
      let processedBuffer = buffer;
      
      // Remove background for clothing and accessories
      if (['clothing', 'shoes', 'jewelry', 'glasses'].includes(productType)) {
        try {
          processedBuffer = await removeBackground(buffer);
        } catch (error) {
          console.error('Background removal failed:', error);
        }
      }
      
      // Resize and optimize
      const image = sharp(processedBuffer);
      const metadata = await image.metadata();
      
      // Resize to max 2048px maintaining aspect ratio
      if (metadata.width > 2048 || metadata.height > 2048) {
        image.resize(2048, 2048, { fit: 'inside' });
      }
      
      // Convert to WebP for better compression
      const optimized = await image
        .webp({ quality: 90 })
        .toBuffer();
      
      // Convert to base64 for easy transmission
      return {
        original: imageUrl,
        processed: `data:image/webp;base64,${optimized.toString('base64')}`,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          hasAlpha: metadata.channels === 4
        }
      };
    } catch (error) {
      console.error('Image processing error:', error);
      return {
        original: imageUrl,
        processed: imageUrl,
        error: error.message
      };
    }
  }
}

module.exports = new ProductParser();