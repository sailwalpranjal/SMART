const express = require('express');
const router = express.Router();
const productParser = require('../services/productParser');

router.post('/parse', async (req, res) => {
  try {
    const { url } = req.body;
    const productData = await productParser.parseWalmartURL(url);
    res.json(productData);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
