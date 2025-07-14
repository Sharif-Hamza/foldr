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

    console.log(`🚀 COMPRESSION REQUEST: ${req.file.originalname}`);
    console.log(`📁 File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // Set up file paths
    inputPath = req.file.path;
    const fileId = uuidv4();
    const outputFilename = `compressed_${fileId}.pdf`;
    outputPath = path.join(compressedDir, outputFilename);

    // Compress the PDF using the new professional compression system
    const compressionResult = await compressPDF(inputPath, outputPath);

    if (!compressionResult.success) {
      throw new Error(compressionResult.error || 'Compression failed');
    }

    // Calculate compression statistics
    const originalSizeMB = (compressionResult.originalSize / 1024 / 1024).toFixed(2);
    const compressedSizeMB = (compressionResult.compressedSize / 1024 / 1024).toFixed(2);
    const savings = compressionResult.originalSize - compressionResult.compressedSize;
    const savingsMB = (savings / 1024 / 1024).toFixed(2);

    console.log(`✅ Compression successful using ${compressionResult.strategy}`);
    console.log(`📊 Size: ${originalSizeMB} MB → ${compressedSizeMB} MB`);
    console.log(`💾 Saved: ${savingsMB} MB (${compressionResult.compressionRatio.toFixed(1)}%)`);

    // Clean up input file
    cleanupFiles(path.dirname(inputPath), 0.1); // Clean files older than 6 minutes

    // Return success response
    res.json({
      success: true,
      message: 'PDF compressed successfully',
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      compressionRatio: compressionResult.compressionRatio,
      strategy: compressionResult.strategy,
      downloadUrl: `/api/download/${outputFilename}`,
      filename: outputFilename,
      stats: {
        originalSizeMB: originalSizeMB,
        compressedSizeMB: compressedSizeMB,
        savingsMB: savingsMB,
        reductionPercentage: `${compressionResult.compressionRatio.toFixed(1)}%`
      }
    });

  } catch (error) {
    console.error('❌ Compression error:', error);

    // Clean up files on error
    if (inputPath) {
      try {
        cleanupFiles(path.dirname(inputPath), 0);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

    if (outputPath) {
      try {
        cleanupFiles(path.dirname(outputPath), 0);
      } catch (cleanupError) {
        console.error('Output cleanup error:', cleanupError);
      }
    }

    // Return error response
    res.status(500).json({
      error: 'PDF compression failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router; 