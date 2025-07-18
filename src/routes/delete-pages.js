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

// Delete pages from PDF endpoint
router.post('/delete-pages', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    console.log(`Starting page deletion: ${req.file.originalname}`);

    // Read the PDF file
    const pdfBytes = fs.readFileSync(req.file.path);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();

    // Parse pages to delete from request body
    const { pagesToDelete = '1' } = req.body;
    
    let deletePageNumbers = [];
    
    // Parse page numbers like "1,3,5-7"
    const ranges = pagesToDelete.split(',').map(r => r.trim());
    for (const range of ranges) {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        for (let i = start; i <= Math.min(end, totalPages); i++) {
          if (i >= 1) deletePageNumbers.push(i);
        }
      } else {
        const pageNum = parseInt(range);
        if (pageNum >= 1 && pageNum <= totalPages) {
          deletePageNumbers.push(pageNum);
        }
      }
    }

    if (deletePageNumbers.length === 0) {
      throw new Error('No valid pages specified for deletion');
    }

    if (deletePageNumbers.length >= totalPages) {
      throw new Error('Cannot delete all pages from PDF');
    }

    // Remove duplicates and sort in descending order (to delete from end first)
    deletePageNumbers = [...new Set(deletePageNumbers)].sort((a, b) => b - a);

    // Create new PDF with remaining pages
    const newPdf = await PDFDocument.create();
    
    // Get all page indices except the ones to delete
    const pageIndicesToKeep = [];
    for (let i = 1; i <= totalPages; i++) {
      if (!deletePageNumbers.includes(i)) {
        pageIndicesToKeep.push(i - 1); // Convert to 0-based index
      }
    }

    if (pageIndicesToKeep.length === 0) {
      throw new Error('Cannot delete all pages from PDF');
    }

    // Copy remaining pages
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndicesToKeep);
    copiedPages.forEach(page => newPdf.addPage(page));

    // Generate the PDF bytes
    const modifiedPdfBytes = await newPdf.save();

    // Save the modified PDF
    const outputFilename = `pages_deleted_${uuidv4()}.pdf`;
    const outputPath = path.join(__dirname, '../../output', outputFilename);
    
    fs.writeFileSync(outputPath, modifiedPdfBytes);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`Page deletion completed. Deleted ${deletePageNumbers.length} pages, kept ${pageIndicesToKeep.length} pages`);

    // Return success response
    res.json({
      success: true,
      message: `Successfully deleted ${deletePageNumbers.length} pages from PDF`,
      filename: outputFilename,
      downloadUrl: `/api/download/${outputFilename}`,
      originalPages: totalPages,
      deletedPages: deletePageNumbers.length,
      remainingPages: pageIndicesToKeep.length,
      pagesDeleted: deletePageNumbers.sort((a, b) => a - b)
    });

  } catch (error) {
    console.error('Delete pages error:', error);
    
    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to delete pages from PDF',
      message: error.message
    });
  }
});

export default router; 