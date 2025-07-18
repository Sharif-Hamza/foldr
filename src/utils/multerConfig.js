import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = uuidv4();
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${extension}`);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type based on the route
  const allowedMimes = {
    'pdf': ['application/pdf'],
    'image': ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp']
  };

  let allowed = false;
  
  // PDF routes - all these routes accept PDF files
  const pdfRoutes = ['merge', 'compress', 'split', 'reorder', 'delete-pages', 'extract-text', 'extract-images', 'protect', 'unlock', 'lock-pdf', 'unlock-pdf', 'pdf-to-word', 'pdf-to-excel', 'edit-metadata'];
  const aiPdfRoutes = ['chat-with-pdf', 'summarize-pdf', 'extract-tables', 'explain', 'highlight'];
  
  // Check if route accepts PDFs
  const routePath = req.route.path;
  const originalUrl = req.originalUrl;
  
  const acceptsPdf = pdfRoutes.some(route => routePath.includes(route)) || 
                    aiPdfRoutes.some(route => routePath.includes(route)) ||
                    originalUrl.includes('/lock-pdf') || 
                    originalUrl.includes('/unlock-pdf');
  
  if (acceptsPdf) {
    allowed = allowedMimes.pdf.includes(file.mimetype);
  } else if (routePath.includes('convert') || originalUrl.includes('convert')) {
    allowed = allowedMimes.image.includes(file.mimetype);
  }

  if (allowed) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Expected: ${routePath.includes('convert') || originalUrl.includes('convert') ? 'images' : 'PDF files'}`), false);
  }
};

// Configure multer with increased limits for large files
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit per file
    files: 20 // Maximum 20 files at once
  }
});

export default upload; 