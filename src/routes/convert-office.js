import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import FormData from 'form-data';
import { encryptPDF, decryptPDF } from '../utils/pdfEncryption.js';
import upload from '../utils/multerConfig.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Nutrient.io API configuration
const NUTRIENT_API_KEY = process.env.NUTRIENT_API_KEY || 'pdf_live_s904A47rKvurJdVeAk7ozb671OnqI0vf8JtGfZhHuOP';

// Helper function to make conversion requests with Nutrient.io
async function convertWithNutrient(inputFilePath, outputFormat) {
  try {
    const fileBuffer = fs.readFileSync(inputFilePath);
    const formData = new FormData();
    
    formData.append('file', fileBuffer, {
      filename: 'input.pdf',
      contentType: 'application/pdf'
    });
    formData.append('instructions', JSON.stringify({
      parts: [
        {
          file: "file"
        }
      ],
      output: {
        type: outputFormat
      }
    }));

    const response = await axios.post('https://api.nutrient.io/build', formData, {
      headers: {
        'Authorization': `Bearer ${NUTRIENT_API_KEY}`,
        ...formData.getHeaders()
      },
      responseType: 'arraybuffer'
    });

    return response.data;
  } catch (error) {
    console.error('Nutrient API error:', error.response?.data || error.message);
    console.error('Full error:', error.response?.status, error.response?.statusText);
    throw new Error(`Conversion failed: ${error.response?.status || 'Unknown'} - ${error.message}`);
  }
}

// PDF to Excel conversion
router.post('/pdf-to-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    console.log(`Starting PDF to Excel conversion: ${req.file.originalname}`);

    // Using Nutrient.io API for real conversion
    const convertedData = await convertWithNutrient(req.file.path, 'xlsx');
    
    // Generate output filename
    const outputFileName = `${path.parse(req.file.originalname).name}_converted_${Date.now()}.xlsx`;
    const outputPath = path.join(__dirname, '../../output', outputFileName);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write converted file
    fs.writeFileSync(outputPath, convertedData);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`PDF to Excel conversion completed: ${outputFileName}`);

    res.json({
      success: true,
      message: 'PDF converted to Excel successfully',
      filename: outputFileName,
      downloadUrl: `/api/download/${outputFileName}`,
      originalName: req.file.originalname,
      size: convertedData.length
    });

  } catch (error) {
    console.error('PDF to Excel conversion error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to convert PDF to Excel',
      message: error.message
    });
  }
});

// PDF to Word conversion
router.post('/pdf-to-word', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    console.log(`Starting PDF to Word conversion: ${req.file.originalname}`);

    // Using Nutrient.io API for real conversion
    const convertedData = await convertWithNutrient(req.file.path, 'docx');
    
    // Generate output filename
    const outputFileName = `${path.parse(req.file.originalname).name}_converted_${Date.now()}.docx`;
    const outputPath = path.join(__dirname, '../../output', outputFileName);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write converted file
    fs.writeFileSync(outputPath, convertedData);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`PDF to Word conversion completed: ${outputFileName}`);

    res.json({
      success: true,
      message: 'PDF converted to Word successfully',
      filename: outputFileName,
      downloadUrl: `/api/download/${outputFileName}`,
      originalName: req.file.originalname,
      size: convertedData.length
    });

  } catch (error) {
    console.error('PDF to Word conversion error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to convert PDF to Word',
      message: error.message
    });
  }
});

// PDF Lock (Password Protection)
router.post('/lock-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    console.log(`Starting PDF password protection: ${req.file.originalname}`);

    // Generate output filename
    const outputFileName = `${path.parse(req.file.originalname).name}_locked_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../output', outputFileName);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Use professional PDF encryption utility (same pattern as compression)
    const encryptionResult = await encryptPDF(req.file.path, outputPath, password);
    
    if (!encryptionResult.success) {
      if (encryptionResult.fallback) {
        // This means qpdf isn't available (Windows localhost)
        throw new Error('PDF encryption is only available on Railway deployment. Please deploy to test this feature.');
      } else {
        throw new Error(`PDF encryption failed: ${encryptionResult.error}`);
      }
    }
    
    console.log('🎉 PDF encryption completed successfully!');
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`PDF password protection completed: ${outputFileName}`);

    res.json({
      success: true,
      message: 'PDF locked with password successfully',
      filename: outputFileName,
      downloadUrl: `/api/download/${outputFileName}`,
      originalName: req.file.originalname,
      size: encryptionResult.encryptedSize,
      protected: true,
      method: encryptionResult.method
    });

  } catch (error) {
    console.error('PDF lock error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to lock PDF',
      message: error.message
    });
  }
});

// PDF Unlock (Remove Password)
router.post('/unlock-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required to unlock PDF' });
    }

    console.log(`Starting PDF unlock: ${req.file.originalname}`);

    // Generate output filename
    const outputFileName = `${path.parse(req.file.originalname).name}_unlocked_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, '../../output', outputFileName);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Use professional PDF decryption utility (same pattern as compression)
    const decryptionResult = await decryptPDF(req.file.path, outputPath, password);
    
    if (!decryptionResult.success) {
      if (decryptionResult.fallback) {
        // This means qpdf isn't available (Windows localhost)
        throw new Error('PDF decryption is only available on Railway deployment. Please deploy to test this feature.');
      } else if (decryptionResult.invalidPassword) {
        throw new Error('Invalid password provided');
      } else {
        throw new Error(`PDF decryption failed: ${decryptionResult.error}`);
      }
    }
    
    console.log('🎉 PDF decryption completed successfully!');
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      console.log(`PDF unlock completed: ${outputFileName}`);

      res.json({
        success: true,
        message: 'PDF unlocked successfully',
        filename: outputFileName,
        downloadUrl: `/api/download/${outputFileName}`,
        originalName: req.file.originalname,
        size: decryptionResult.decryptedSize,
        unlocked: true,
        method: decryptionResult.method
      });

  } catch (error) {
    console.error('PDF unlock error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to unlock PDF',
      message: error.message
    });
  }
});

// Helper functions for conversion (placeholder implementations)
async function convertPDFToExcel(inputPath) {
  // This is a placeholder implementation
  // In production, you would integrate with a service like:
  // - PDF.co API
  // - ConvertAPI
  // - Aspose.Cloud
  // - Or use libraries like pdf-table-extractor
  
  // For demo purposes, return a simple Excel-like structure
  const excelContent = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Sheet1">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Extracted PDF Data</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type="String">This is placeholder content</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type="String">In production, integrate with PDF.co or ConvertAPI</Data></Cell>
   </Row>
  </Table>
 </Worksheet>
</Workbook>`;
  
  return Buffer.from(excelContent, 'utf8');
}

async function convertPDFToWord(inputPath) {
  // This is a placeholder implementation
  // In production, you would integrate with a service like:
  // - PDF.co API
  // - ConvertAPI
  // - Aspose.Cloud
  // - GroupDocs API
  
  // For demo purposes, return a simple DOCX structure
  const docxContent = `PK\x03\x04\x14\x00\x00\x00\x08\x00\x00\x00!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00
[Content_Types].xml\xEC\x92\xCDJ\xC30\x10\xC7\xEF\x82_\xA1\x8E\xD8\xB1\xE8\x0B\x04t\x91\xE4\x92\xBDI\x08\xE3V\xAAaC\xB3\xC7\x9D\xE9\xEF\xEF\x86\x95\xD6\x1A(\x9Aq\x89\xF3\xEE\x9B\x1B\xC8\x0F\xFF\xF7\xDD{\x00
This is placeholder DOCX content. 
In production, integrate with ConvertAPI or similar service for actual PDF to Word conversion.
Original PDF: ${path.basename(inputPath)}
Converted at: ${new Date().toISOString()}`;
  
  return Buffer.from(docxContent, 'utf8');
}

export default router; 