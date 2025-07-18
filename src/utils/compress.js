import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if a command is available on the system
 * @returns {Promise<boolean>}
 */
async function isCommandAvailable(command) {
  try {
    // Use cross-platform command detection
    const checkCommand = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
    await execAsync(checkCommand);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(2);
}

/**
 * Comprehensive PDF compression using multiple tools and strategies
 * @param {string} inputPath - Path to input PDF
 * @param {string} outputPath - Path for output PDF
 * @returns {Promise<Object>} Compression result
 */
export async function compressPDF(inputPath, outputPath) {
  const originalSize = getFileSize(inputPath);
  const originalSizeMB = formatFileSize(originalSize);
  
  console.log(`🔥 PROFESSIONAL PDF COMPRESSION: ${path.basename(inputPath)}`);
  console.log(`📋 Original: ${originalSizeMB} MB`);

  const strategies = [
    { name: 'ghostscript_aggressive', tool: 'ghostscript' },
    { name: 'qpdf_aggressive', tool: 'qpdf' },
    { name: 'ghostscript_ebook', tool: 'ghostscript' },
    { name: 'ghostscript_printer', tool: 'ghostscript' },
    { name: 'ghostscript_prepress', tool: 'ghostscript' },
    { name: 'qpdf_linearize', tool: 'qpdf' }
  ];

  let bestResult = {
    success: false,
    outputPath: inputPath,
    originalSize,
    compressedSize: originalSize,
    compressionRatio: 0,
    strategy: 'None',
    error: null
  };

  // Check tool availability with detailed logging
  const qpdfAvailable = await isCommandAvailable('qpdf');
  const gsAvailable = await isCommandAvailable('gs');

  console.log(`🔍 Tool detection: qpdf=${qpdfAvailable}, gs=${gsAvailable}`);

  if (!qpdfAvailable && !gsAvailable) {
    console.log('⚠️ No compression tools available - this should NOT happen on Railway!');
    console.log('⚠️ Railway should have qpdf and ghostscript installed via Dockerfile');
    // Still try to proceed, but log the issue
  } else {
    console.log(`🔧 Available tools: ${qpdfAvailable ? 'qpdf' : ''}${qpdfAvailable && gsAvailable ? ' + ' : ''}${gsAvailable ? 'ghostscript' : ''}`);
  }

  // Try each compression strategy
  for (const strategy of strategies) {
    if ((strategy.tool === 'qpdf' && !qpdfAvailable) || 
        (strategy.tool === 'ghostscript' && !gsAvailable)) {
      continue;
    }

    try {
      const tempOutput = `${outputPath}.${strategy.name}.tmp`;
      let command = '';

      switch (strategy.name) {
        case 'ghostscript_aggressive':
          command = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dBATCH -dDetectDuplicateImages=true -dCompressFonts=true -r72 -dDownsampleColorImages=true -dColorImageResolution=72 -dDownsampleGrayImages=true -dGrayImageResolution=72 -dDownsampleMonoImages=true -dMonoImageResolution=300 -dColorImageDownsampleType=/Bicubic -dGrayImageDownsampleType=/Bicubic -dMonoImageDownsampleType=/Bicubic -sOutputFile="${tempOutput}" "${inputPath}"`;
          break;

        case 'qpdf_aggressive':
          command = `qpdf --linearize --compress-streams=y --decode-level=generalized --optimize-images --object-streams=generate --remove-unreferenced-resources=yes --filtered-stream-data "${inputPath}" "${tempOutput}"`;
          break;

        case 'qpdf_linearize':
          command = `qpdf --linearize --optimize-images --object-streams=generate --filtered-stream-data "${inputPath}" "${tempOutput}"`;
          break;

        case 'ghostscript_ebook':
          command = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dBATCH -dDetectDuplicateImages=true -dCompressFonts=true -r150 -dDownsampleColorImages=true -dColorImageResolution=150 -dDownsampleGrayImages=true -dGrayImageResolution=150 -dDownsampleMonoImages=true -dMonoImageResolution=150 -sOutputFile="${tempOutput}" "${inputPath}"`;
          break;

        case 'ghostscript_printer':
          command = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/printer -dNOPAUSE -dBATCH -dDetectDuplicateImages=true -dCompressFonts=true -r300 -dDownsampleColorImages=true -dColorImageResolution=300 -sOutputFile="${tempOutput}" "${inputPath}"`;
          break;

        case 'ghostscript_prepress':
          command = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dBATCH -dDetectDuplicateImages=true -dCompressFonts=true -r72 -dDownsampleColorImages=true -dColorImageResolution=72 -dDownsampleGrayImages=true -dGrayImageResolution=72 -sOutputFile="${tempOutput}" "${inputPath}"`;
          break;
      }

      console.log(`🚀 Trying strategy: ${strategy.name}`);
      console.log(`📝 Command: ${command}`);
      
      const result = await execAsync(command, { timeout: 60000 });
      console.log(`✅ Command executed successfully for ${strategy.name}`);

      const compressedSize = getFileSize(tempOutput);
      
      console.log(`📊 ${strategy.name} result: ${formatFileSize(originalSize)} MB → ${formatFileSize(compressedSize)} MB`);
      
      if (compressedSize > 0) {
        const reduction = ((originalSize - compressedSize) / originalSize) * 100;
        console.log(`📈 Reduction: ${reduction.toFixed(1)}%`);
        
        if (compressedSize < bestResult.compressedSize) {
          // Clean up previous best result
          if (bestResult.outputPath !== inputPath && fs.existsSync(bestResult.outputPath)) {
            fs.unlinkSync(bestResult.outputPath);
          }

          bestResult = {
            success: true,
            outputPath: tempOutput,
            originalSize,
            compressedSize,
            compressionRatio: reduction,
            strategy: strategy.name,
            error: null
          };

          console.log(`✅ NEW BEST: ${formatFileSize(compressedSize)} MB (${reduction.toFixed(1)}% reduction)`);
        } else {
          // Clean up unsuccessful attempt
          if (fs.existsSync(tempOutput)) {
            fs.unlinkSync(tempOutput);
          }
          console.log(`❌ Strategy ${strategy.name} didn't improve on current best (${formatFileSize(bestResult.compressedSize)} MB)`);
        }
      } else {
        console.log(`❌ Strategy ${strategy.name} produced no output file`);
        if (fs.existsSync(tempOutput)) {
          fs.unlinkSync(tempOutput);
        }
      }

    } catch (error) {
      console.log(`❌ Strategy ${strategy.name} failed: ${error.message}`);
      console.log(`🔍 Error details:`, error);
      if (error.stderr) {
        console.log(`📋 stderr:`, error.stderr);
      }
      if (error.stdout) {
        console.log(`📋 stdout:`, error.stdout);
      }
    }
  }

  // Move best result to final output path
  if (bestResult.success && bestResult.outputPath !== outputPath) {
    fs.renameSync(bestResult.outputPath, outputPath);
    bestResult.outputPath = outputPath;
    console.log(`🔄 Moved best result to final path: ${outputPath}`);
  } else if (!bestResult.success) {
    console.log('⚠️ NO COMPRESSION WORKED - This should not happen on Railway!');
    console.log('⚠️ Copying original file as fallback');
    
    // Copy original file if no compression worked
    fs.copyFileSync(inputPath, outputPath);
    
    // Update result to indicate successful preservation of original file
    bestResult = {
      success: true,
      outputPath: outputPath,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0,
      strategy: 'None (Fallback)',
      error: null
    };
  }

  console.log(`🎉 COMPRESSION COMPLETE!`);
  console.log(`📊 Final size: ${formatFileSize(bestResult.compressedSize)} MB`);
  console.log(`🎯 Reduction: ${bestResult.compressionRatio.toFixed(1)}%`);
  console.log(`⚡ Strategy: ${bestResult.strategy}`);

  return bestResult;
}

/**
 * Ensure directory exists
 */
export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Clean up old files
 */
export function cleanupFiles(directory, maxAgeHours = 1) {
  try {
    const files = fs.readdirSync(directory);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    files.forEach(file => {
      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Cleaned up old file: ${file}`);
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error);
  }
} 