import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import upload from '../utils/multerConfig.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Convert images to PDF endpoint
router.post('/convert', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    console.log(`Starting conversion of ${req.files.length} images to PDF...`);

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Sort files by original name to maintain order
    const sortedFiles = req.files.sort((a, b) => a.originalname.localeCompare(b.originalname));

    // Process each image file
    for (const file of sortedFiles) {
      try {
        console.log(`Processing image: ${file.originalname}`);
        
        // Read and process the image with Sharp
        let imageBuffer = fs.readFileSync(file.path);
        
        // Get image metadata
        const metadata = await sharp(imageBuffer).metadata();
        console.log(`Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
        
        // Convert to JPEG if not already (for better PDF compatibility)
        // and optimize the image
        if (metadata.format !== 'jpeg') {
          imageBuffer = await sharp(imageBuffer)
            .jpeg({ quality: 85, progressive: true })
            .toBuffer();
        } else {
          // Optimize existing JPEG
          imageBuffer = await sharp(imageBuffer)
            .jpeg({ quality: 85, progressive: true })
            .toBuffer();
        }

        // Embed the image in the PDF
        const image = await pdfDoc.embedJpg(imageBuffer);
        
        // Calculate page size to fit the image properly
        const { width: imgWidth, height: imgHeight } = image.scale(1);
        
        // Standard page sizes (A4 = 595.28 x 841.89 points)
        const maxWidth = 595.28;
        const maxHeight = 841.89;
        
        // Calculate scaling to fit the image on the page
        const scaleX = maxWidth / imgWidth;
        const scaleY = maxHeight / imgHeight;
        const scale = Math.min(scaleX, scaleY, 1); // Don't upscale
        
        const finalWidth = imgWidth * scale;
        const finalHeight = imgHeight * scale;
        
        // Add a new page with the calculated dimensions
        const page = pdfDoc.addPage([finalWidth, finalHeight]);
        
        // Draw the image on the page
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: finalWidth,
          height: finalHeight,
        });
        
        console.log(`Added image ${file.originalname} to PDF (${finalWidth.toFixed(0)}x${finalHeight.toFixed(0)})`);
        
        // Clean up uploaded file
        fs.unlinkSync(file.path);
        
      } catch (error) {
        console.error(`Error processing ${file.originalname}:`, error);
        // Clean up uploaded file even if processing failed
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        throw new Error(`Failed to process ${file.originalname}. Make sure it's a valid image file.`);
      }
    }

    // Generate the PDF
    const pdfBytes = await pdfDoc.save();
    
    // Save the PDF to output directory
    const outputFilename = `converted_${uuidv4()}.pdf`;
    const outputPath = path.join(__dirname, '../../output', outputFilename);
    
    fs.writeFileSync(outputPath, pdfBytes);
    
    console.log(`Conversion completed. Output saved as: ${outputFilename}`);

    res.json({
      success: true,
      message: `Successfully converted ${req.files.length} images to PDF`,
      filename: outputFilename,
      downloadUrl: `/api/download/${outputFilename}`,
      pageCount: pdfDoc.getPageCount(),
      imagesProcessed: req.files.length
    });

  } catch (error) {
    console.error('Conversion error:', error);
    
    // Clean up any uploaded files in case of error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({
      error: 'Failed to convert images to PDF',
      message: error.message
    });
  }
});

export default router; 