import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if qpdf is available on the system
 * @returns {Promise<boolean>}
 */
async function isQpdfAvailable() {
  try {
    await execAsync('qpdf --version');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Fallback compression using file copy (for development without qpdf)
 * @param {string} inputPath 
 * @param {string} outputPath 
 */
async function fallbackCompress(inputPath, outputPath) {
  console.log('⚠️ qpdf not available, using fallback compression (file copy)');
  console.log('📝 To get real compression, install qpdf or deploy to Railway');
  
  // Copy file as fallback
  fs.copyFileSync(inputPath, outputPath);
  
  const stats = fs.statSync(inputPath);
  return {
    success: true,
    originalSize: stats.size,
    compressedSize: stats.size,
    compressionRatio: 0
  };
}

/**
 * Compress a PDF file using qpdf CLI tool
 * @param {string} inputPath - Path to the input PDF file
 * @param {string} outputPath - Path where the compressed PDF will be saved
 * @returns {Promise<{success: boolean, originalSize: number, compressedSize: number, compressionRatio: number}>}
 */
export async function compressPDF(inputPath, outputPath) {
  try {
    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error('Input file does not exist');
    }

    // Get original file size
    const originalStats = fs.statSync(inputPath);
    const originalSize = originalStats.size;

    console.log(`🔧 Starting PDF compression: ${path.basename(inputPath)}`);
    console.log(`📋 Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);

    // Check if qpdf is available
    const qpdfAvailable = await isQpdfAvailable();
    
    if (!qpdfAvailable) {
      console.log('⚠️ qpdf not found - using fallback for development');
      console.log('💡 Install qpdf for real compression or deploy to Railway');
      return await fallbackCompress(inputPath, outputPath);
    }

    // Use qpdf to compress the PDF with multiple optimization flags
    const qpdfCommand = `qpdf --linearize --compress-streams=y --decode-level=generalized --optimize-images --object-streams=generate "${inputPath}" "${outputPath}"`;
    
    console.log(`⚡ Executing: ${qpdfCommand}`);
    
    // Execute qpdf command
    const { stdout, stderr } = await execAsync(qpdfCommand);
    
    if (stderr && !stderr.includes('warning')) {
      console.error('qpdf stderr:', stderr);
    }
    
    if (stdout) {
      console.log('qpdf stdout:', stdout);
    }

    // Check if output file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('Compression failed - output file not created');
    }

    // Get compressed file size
    const compressedStats = fs.statSync(outputPath);
    const compressedSize = compressedStats.size;
    
    // Calculate compression ratio
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100);
    
    console.log(`📊 Compressed size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🎯 Compression ratio: ${compressionRatio.toFixed(1)}%`);

    return {
      success: true,
      originalSize,
      compressedSize,
      compressionRatio: Math.round(compressionRatio * 10) / 10
    };

  } catch (error) {
    console.error('❌ Compression error:', error.message);
    
    // Clean up output file if it exists but compression failed
    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError.message);
      }
    }
    
    throw new Error(`PDF compression failed: ${error.message}`);
  }
}

/**
 * Clean up temporary files
 * @param {string[]} filePaths - Array of file paths to delete
 */
export function cleanupFiles(filePaths) {
  filePaths.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Cleaned up: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.error(`❌ Failed to cleanup ${filePath}:`, error.message);
    }
  });
}

/**
 * Ensure directory exists, create if it doesn't
 * @param {string} dirPath - Directory path to check/create
 */
export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
} 