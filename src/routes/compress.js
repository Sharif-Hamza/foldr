import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import upload from '../utils/multerConfig.js';
import { compressPDF, cleanupFiles, ensureDirectoryExists } from '../utils/compress.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure compressed directory exists
const compressedDir = path.join(__dirname, '../../compressed');
ensureDirectoryExists(compressedDir);

// Compress PDF endpoint
router.post('/compress', upload.single('file'), async (req, res) => {
  let inputPath = null;
  let outputPath = null;

  try {
    // Validate file upload
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file type
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    console.log(`🚀 QPDF COMPRESSION REQUEST: ${req.file.originalname}`);
    console.log(`📁 File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // Set up file paths
    inputPath = req.file.path;
    const fileId = uuidv4();
    const outputFilename = `compressed_${fileId}.pdf`;
    outputPath = path.join(compressedDir, outputFilename);

    // Compress the PDF using qpdf
    const compressionResult = await compressPDF(inputPath, outputPath);

    if (!compressionResult.success) {
      throw new Error('Compression failed');
    }

    // Send the compressed file back to client
    res.download(outputPath, `compressed_${req.file.originalname}`, (downloadError) => {
      // Clean up both input and output files after download
      const filesToCleanup = [inputPath, outputPath];
      
      if (downloadError) {
        console.error('❌ Download error:', downloadError);
        cleanupFiles(filesToCleanup);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to send compressed file' });
        }
      } else {
        console.log(`✅ Compression completed successfully!`);
        console.log(`📊 Original: ${(compressionResult.originalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`📊 Compressed: ${(compressionResult.compressedSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`🎯 Space saved: ${compressionResult.compressionRatio}%`);
        
        // Clean up files after successful download
        setTimeout(() => {
          cleanupFiles(filesToCleanup);
        }, 1000); // Small delay to ensure download completes
      }
    });

  } catch (error) {
    console.error('❌ Compression route error:', error);
    
    // Clean up files on error
    const filesToCleanup = [inputPath, outputPath].filter(Boolean);
    cleanupFiles(filesToCleanup);
    
    // Send error response
    if (!res.headersSent) {
      if (error.message.includes('qpdf')) {
        res.status(500).json({ 
          error: 'PDF compression failed. The file might be corrupted or password-protected.',
          details: 'qpdf compression error'
        });
      } else {
        res.status(500).json({ 
          error: 'Compression failed', 
          details: error.message 
        });
      }
    }
  }
});

export default router; 