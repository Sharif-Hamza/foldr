import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import upload from '../utils/multerConfig.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Merge PDFs endpoint
router.post('/merge', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    if (req.files.length < 2) {
      return res.status(400).json({ error: 'At least 2 PDF files are required for merging' });
    }

    console.log(`Starting merge of ${req.files.length} PDFs...`);

    // Create a new PDF document
    const mergedPdf = await PDFDocument.create();

    // Process files in the order they were uploaded
    for (const file of req.files) {
      try {
        console.log(`Processing file: ${file.originalname}`);
        
        // Read the PDF file
        const pdfBytes = fs.readFileSync(file.path);
        const pdf = await PDFDocument.load(pdfBytes);
        
        // Copy all pages from this PDF to the merged PDF
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        
        // Add each page to the merged document
        pages.forEach((page) => mergedPdf.addPage(page));
        
        console.log(`Added ${pages.length} pages from ${file.originalname}`);
        
        // Clean up uploaded file
        fs.unlinkSync(file.path);
      } catch (error) {
        console.error(`Error processing ${file.originalname}:`, error);
        // Clean up uploaded file even if processing failed
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        throw new Error(`Failed to process ${file.originalname}. Make sure it's a valid PDF file.`);
      }
    }

    // Generate the merged PDF
    const mergedPdfBytes = await mergedPdf.save();
    
    // Save the merged PDF to output directory
    const outputFilename = `merged_${uuidv4()}.pdf`;
    const outputPath = path.join(__dirname, '../../output', outputFilename);
    
    fs.writeFileSync(outputPath, mergedPdfBytes);
    
    console.log(`Merge completed. Output saved as: ${outputFilename}`);

    // Return success response with download URL
    res.json({
      success: true,
      message: `Successfully merged ${req.files.length} PDF files`,
      filename: outputFilename,
      downloadUrl: `/api/download/${outputFilename}`,
      pageCount: mergedPdf.getPageCount()
    });

  } catch (error) {
    console.error('Merge error:', error);
    
    // Clean up any uploaded files in case of error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({
      error: 'Failed to merge PDFs',
      message: error.message
    });
  }
});

export default router; 