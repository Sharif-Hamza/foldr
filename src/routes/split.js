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

// Split PDF endpoint
router.post('/split', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    console.log(`Starting PDF split: ${req.file.originalname}`);

    // Read the PDF file
    const pdfBytes = fs.readFileSync(req.file.path);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();

    // Parse split options from request body
    const { splitType = 'range', pageRange = '1-1' } = req.body;
    
    let pagesToSplit = [];

    switch (splitType) {
      case 'range':
        // Parse page ranges like "1-5,7,9-10"
        const ranges = pageRange.split(',').map(r => r.trim());
        for (const range of ranges) {
          if (range.includes('-')) {
            const [start, end] = range.split('-').map(n => parseInt(n.trim()));
            for (let i = start; i <= Math.min(end, totalPages); i++) {
              if (i >= 1) pagesToSplit.push(i);
            }
          } else {
            const pageNum = parseInt(range);
            if (pageNum >= 1 && pageNum <= totalPages) {
              pagesToSplit.push(pageNum);
            }
          }
        }
        break;
        
      case 'even':
        for (let i = 2; i <= totalPages; i += 2) {
          pagesToSplit.push(i);
        }
        break;
        
      case 'odd':
        for (let i = 1; i <= totalPages; i += 2) {
          pagesToSplit.push(i);
        }
        break;
        
      case 'single':
        // Split each page into separate PDF
        for (let i = 1; i <= totalPages; i++) {
          pagesToSplit.push(i);
        }
        break;
        
      default:
        throw new Error('Invalid split type');
    }

    if (pagesToSplit.length === 0) {
      throw new Error('No valid pages specified for splitting');
    }

    // Remove duplicates and sort
    pagesToSplit = [...new Set(pagesToSplit)].sort((a, b) => a - b);

    // Save files directly to output directory (no subdirectory)
    const outputId = uuidv4();
    const outputDir = path.join(__dirname, '../../output');

    const splitFiles = [];

    if (splitType === 'single') {
      // Create separate PDF for each page
      for (const pageNum of pagesToSplit) {
        const newPdf = await PDFDocument.create();
        const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNum - 1]);
        newPdf.addPage(copiedPage);
        
        const pdfBytes = await newPdf.save();
        const filename = `split_${outputId}_page_${pageNum}.pdf`;
        const filepath = path.join(outputDir, filename);
        
        fs.writeFileSync(filepath, pdfBytes);
        splitFiles.push(filename);
      }
    } else {
      // Create single PDF with selected pages
      const newPdf = await PDFDocument.create();
      const pageIndices = pagesToSplit.map(p => p - 1);
      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
      
      copiedPages.forEach(page => newPdf.addPage(page));
      
      const pdfBytes = await newPdf.save();
      const filename = `split_${outputId}_${splitType}_pages.pdf`;
      const filepath = path.join(outputDir, filename);
      
      fs.writeFileSync(filepath, pdfBytes);
      splitFiles.push(filename);
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`Split completed. Created ${splitFiles.length} files`);

    // Return success response
    res.json({
      success: true,
      message: `Successfully split PDF into ${splitFiles.length} file(s)`,
      filename: splitFiles[0], // Use the first (and usually only) file
      downloadUrl: `/api/download/${splitFiles[0]}`,
      splitFiles: splitFiles,
      pageCount: pagesToSplit.length,
      splitType: splitType
    });

  } catch (error) {
    console.error('Split error:', error);
    
    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to split PDF',
      message: error.message
    });
  }
});

export default router; 