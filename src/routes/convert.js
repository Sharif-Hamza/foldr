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

    // Process each image file
    for (const file of req.files) {
      try {
        console.log(`Processing image: ${file.originalname}`);

        // Use Sharp to process the image and get metadata
        const imageBuffer = fs.readFileSync(file.path);
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();
        
        console.log(`Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

        // Convert image to JPEG if it's not already (for better PDF compatibility)
        let processedImageBuffer;
        if (metadata.format !== 'jpeg') {
          processedImageBuffer = await image
            .jpeg({ quality: 90 })
            .toBuffer();
        } else {
          processedImageBuffer = imageBuffer;
        }

        // Embed the image in the PDF
        const pdfImage = await pdfDoc.embedJpg(processedImageBuffer);
        const imageDims = pdfImage.scale(1);

        // Calculate page size to fit image while maintaining aspect ratio
        const maxWidth = 595; // A4 width in points
        const maxHeight = 842; // A4 height in points
        
        let { width, height } = imageDims;
        
        // Scale down if image is larger than A4
        if (width > maxWidth || height > maxHeight) {
          const widthRatio = maxWidth / width;
          const heightRatio = maxHeight / height;
          const scaleFactor = Math.min(widthRatio, heightRatio);
          
          width = width * scaleFactor;
          height = height * scaleFactor;
        }

        // Add a new page with the calculated dimensions
        const page = pdfDoc.addPage([width, height]);
        
        // Draw the image to fill the entire page
        page.drawImage(pdfImage, {
          x: 0,
          y: 0,
          width: width,
          height: height,
        });

        console.log(`Added image ${file.originalname} to PDF (${Math.round(width)}x${Math.round(height)})`);

        // Clean up the uploaded file
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

    // Generate the PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Generate unique filename for the converted PDF
    const outputFilename = `converted_${uuidv4()}.pdf`;
    const outputPath = path.join(__dirname, '../../output', outputFilename);

    // Save the PDF file
    fs.writeFileSync(outputPath, pdfBytes);

    console.log(`Conversion completed. Output saved as: ${outputFilename}`);

    // Return the download URL
    res.json({
      success: true,
      message: `Successfully converted ${req.files.length} images to PDF`,
      downloadUrl: `/api/download/${outputFilename}`,
      filename: outputFilename,
      pages: req.files.length
    });

  } catch (error) {
    console.error('Convert endpoint error:', error);
    
    // Clean up uploaded files
    if (req.files) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
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