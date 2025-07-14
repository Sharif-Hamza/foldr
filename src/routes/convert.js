import express from 'express';
import fs from 'fs';
import upload from '../utils/multerConfig.js';

const router = express.Router();

// Convert images to PDF endpoint (temporarily disabled)
router.post('/convert', upload.array('files', 20), async (req, res) => {
  try {
    // Temporarily disable image conversion for deployment
    // Image conversion requires Sharp which has native compilation dependencies
    // This will be re-enabled once deployment issues are resolved
    
    return res.status(503).json({ 
      error: 'Image conversion is temporarily disabled during deployment.',
      message: 'This feature requires additional system dependencies that are being configured. Please try again later or use PDF merge/compress features instead.',
      availableFeatures: ['PDF Merge', 'PDF Compression']
    });
    
  } catch (error) {
    console.error('Convert endpoint error:', error);
    
    // Clean up uploaded files
    if (req.files) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      });
    }
    
    res.status(500).json({
      error: 'Service temporarily unavailable',
      message: 'Image conversion feature is being updated. Please try other features.'
    });
  }
});

export default router; 