import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if a command is available on the system
 */
async function isCommandAvailable(command) {
  try {
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
 * Professional PDF encryption using qpdf (works on Railway/Linux)
 * @param {string} inputPath - Path to input PDF
 * @param {string} outputPath - Path for output encrypted PDF
 * @param {string} password - Password for encryption
 * @returns {Promise<Object>} Encryption result
 */
export async function encryptPDF(inputPath, outputPath, password) {
  console.log(`🔒 PROFESSIONAL PDF ENCRYPTION: ${path.basename(inputPath)}`);
  
  // Check if qpdf is available (it will be on Railway/Linux)
  const qpdfAvailable = await isCommandAvailable('qpdf');
  
  if (!qpdfAvailable) {
    console.log('⚠️ qpdf not available on this system (probably Windows localhost)');
    return {
      success: false,
      error: 'PDF encryption requires qpdf (available on Railway deployment)',
      fallback: true
    };
  }

  console.log('🔧 qpdf available - proceeding with encryption');

  try {
    // Professional qpdf encryption command with full restrictions
    const command = `qpdf --encrypt "${password}" "${password}" 256 --accessibility=n --extract=n --print=none --modify=none --annotate=n --form=n --assembly=n --cleartext-metadata -- "${inputPath}" "${outputPath}"`;
    
    console.log('🚀 Executing qpdf encryption...');
    await execAsync(command, { timeout: 30000 });

    // Verify the encrypted file was created
    if (fs.existsSync(outputPath)) {
      const encryptedSize = getFileSize(outputPath);
      console.log(`✅ PDF successfully encrypted! Size: ${(encryptedSize / 1024 / 1024).toFixed(2)} MB`);
      
      return {
        success: true,
        outputPath,
        originalSize: getFileSize(inputPath),
        encryptedSize,
        method: 'qpdf_professional'
      };
    } else {
      throw new Error('Encrypted file was not created');
    }

  } catch (error) {
    console.error('❌ qpdf encryption failed:', error.message);
    return {
      success: false,
      error: error.message,
      fallback: false
    };
  }
}

/**
 * Professional PDF decryption using qpdf
 * @param {string} inputPath - Path to encrypted PDF
 * @param {string} outputPath - Path for decrypted PDF
 * @param {string} password - Password for decryption
 * @returns {Promise<Object>} Decryption result
 */
export async function decryptPDF(inputPath, outputPath, password) {
  console.log(`🔓 PROFESSIONAL PDF DECRYPTION: ${path.basename(inputPath)}`);
  
  const qpdfAvailable = await isCommandAvailable('qpdf');
  
  if (!qpdfAvailable) {
    console.log('⚠️ qpdf not available on this system');
    return {
      success: false,
      error: 'PDF decryption requires qpdf (available on Railway deployment)',
      fallback: true
    };
  }

  console.log('🔧 qpdf available - proceeding with decryption');

  try {
    // Professional qpdf decryption command
    const command = `qpdf --password="${password}" --decrypt "${inputPath}" "${outputPath}"`;
    
    console.log('🚀 Executing qpdf decryption...');
    await execAsync(command, { timeout: 30000 });

    if (fs.existsSync(outputPath)) {
      const decryptedSize = getFileSize(outputPath);
      console.log(`✅ PDF successfully decrypted! Size: ${(decryptedSize / 1024 / 1024).toFixed(2)} MB`);
      
      return {
        success: true,
        outputPath,
        originalSize: getFileSize(inputPath),
        decryptedSize,
        method: 'qpdf_professional'
      };
    } else {
      throw new Error('Decrypted file was not created');
    }

  } catch (error) {
    console.error('❌ qpdf decryption failed:', error.message);
    
    if (error.message.includes('invalid password') || error.message.includes('incorrect password')) {
      return {
        success: false,
        error: 'Invalid password provided',
        invalidPassword: true
      };
    }
    
    return {
      success: false,
      error: error.message,
      fallback: false
    };
  }
} 