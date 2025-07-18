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

// Reorder pages endpoint
router.post('/reorder', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    console.log(`Starting page reordering: ${req.file.originalname}`);

    // Read the PDF file
    const pdfBytes = fs.readFileSync(req.file.path);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();

    // Parse new page order from request body
    const { pageOrder = '1,2,3' } = req.body;
    
    let newOrder = [];
    const orderArray = pageOrder.split(',').map(p => parseInt(p.trim()));
    
    // Validate page order
    for (const pageNum of orderArray) {
      if (pageNum >= 1 && pageNum <= totalPages) {
        newOrder.push(pageNum - 1); // Convert to 0-based index
      }
    }

    if (newOrder.length === 0) {
      throw new Error('No valid page order specified');
    }

    // Create new PDF with reordered pages
    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdfDoc, newOrder);
    copiedPages.forEach(page => newPdf.addPage(page));

    // Generate the PDF bytes
    const reorderedPdfBytes = await newPdf.save();

    // Save the reordered PDF
    const outputFilename = `reordered_${uuidv4()}.pdf`;
    const outputPath = path.join(__dirname, '../../output', outputFilename);
    
    fs.writeFileSync(outputPath, reorderedPdfBytes);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`Page reordering completed for: ${req.file.originalname}`);

    // Return success response
    res.json({
      success: true,
      message: 'Pages reordered successfully',
      filename: outputFilename,
      downloadUrl: `/api/download/${outputFilename}`,
      pageCount: newOrder.length,
      newOrder: orderArray
    });

  } catch (error) {
    console.error('Reorder pages error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to reorder PDF pages',
      message: error.message
    });
  }
});

// Note: Extract images functionality has been removed as requested
// PDF Lock/Unlock functionality has been moved to convert-office.js route

// Edit metadata endpoint (placeholder)
router.post('/edit-metadata', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const { title = '', author = '', subject = '', keywords = '' } = req.body;

    console.log(`Starting metadata editing: ${req.file.originalname}`);

    // This is a placeholder implementation
    // In production, you would use:
    // - pdf-lib to modify metadata
    // - Access document.setTitle(), setAuthor(), etc.

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`Metadata editing completed for: ${req.file.originalname}`);

    // Return placeholder response
    res.json({
      success: true,
      message: 'PDF metadata updated successfully (placeholder)',
      filename: `metadata_updated_${req.file.originalname}`,
      downloadUrl: null,
      metadata: {
        title,
        author,
        subject,
        keywords
      },
      note: 'This is a placeholder implementation. In production, integrate with pdf-lib metadata modification for actual metadata editing.'
    });

  } catch (error) {
    console.error('Metadata editing error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to edit PDF metadata',
      message: error.message
    });
  }
});

export default router; 