import express from 'express';
import path from 'path';
import fs from 'fs';
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

    // Calculate compression statistics for logging
    const originalSizeMB = (compressionResult.originalSize / 1024 / 1024).toFixed(2);
    const compressedSizeMB = (compressionResult.compressedSize / 1024 / 1024).toFixed(2);
    const savings = compressionResult.originalSize - compressionResult.compressedSize;
    const savingsMB = (savings / 1024 / 1024).toFixed(2);

    console.log(`✅ Compression successful using ${compressionResult.strategy}`);
    console.log(`📊 Size: ${originalSizeMB} MB → ${compressedSizeMB} MB`);
    console.log(`💾 Saved: ${savingsMB} MB (${compressionResult.compressionRatio.toFixed(1)}%)`);

    // Clean up input file
    cleanupFiles(path.dirname(inputPath), 0.1); // Clean files older than 6 minutes

    // CRITICAL FIX: Return the actual compressed file as blob instead of JSON
    // Set headers for file download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('X-Compression-Stats', JSON.stringify({
      originalSize: compressionResult.originalSize,
      compressedSize: compressionResult.compressedSize,
      compressionRatio: compressionResult.compressionRatio,
      strategy: compressionResult.strategy
    }));

    // Stream the compressed file
    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);

    // Clean up the compressed file after streaming
    fileStream.on('end', () => {
      setTimeout(() => {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
          console.log(`🗑️ Cleaned up compressed file: ${outputFilename}`);
        }
      }, 1000); // Small delay to ensure file is fully sent
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

    if (outputPath && fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
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