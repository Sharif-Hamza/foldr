import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Configure dotenv FIRST before importing routes
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// Import routes AFTER dotenv is configured
import mergeRoutes from './routes/merge.js';
import compressRoutes from './routes/compress.js';
import convertRoutes from './routes/convert.js';
import splitRoutes from './routes/split.js';
import deletePagesRoutes from './routes/delete-pages.js';
import convertOfficeRoutes from './routes/convert-office.js';
import pdfOperationsRoutes from './routes/pdf-operations.js';
import aiRoutes from './routes/ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Debug: Check if API key is loaded
console.log('=== Server.js Debug ===');
console.log('DEEPSEEK_API_KEY loaded:', !!process.env.DEEPSEEK_API_KEY);
console.log('API Key length:', process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.length : 'undefined');

// Check if compression tools are available on startup
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

async function checkTools() {
  try {
    console.log('🔍 Checking tool availability...');
    
    try {
      await execAsync('which qpdf');
      const qpdfVersion = await execAsync('qpdf --version');
      console.log('✅ qpdf available:', qpdfVersion.stdout.trim());
    } catch (e) {
      console.log('❌ qpdf NOT available');
    }
    
    try {
      await execAsync('which gs');
      const gsVersion = await execAsync('gs --version');
      console.log('✅ ghostscript available:', gsVersion.stdout.trim());
    } catch (e) {
      console.log('❌ ghostscript NOT available');
    }
    
  } catch (error) {
    console.log('🔍 Tool check failed:', error.message);
  }
}

checkTools();

console.log('====================');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for Railway deployment
app.set('trust proxy', 1);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
const outputDir = path.join(__dirname, '../output');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  trustProxy: true
});

app.use(limiter);

// Compression
app.use(compression());

// CORS - Extract base origin (protocol + domain + port only)
const getBaseOrigin = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (error) {
    return url;
  }
};

const allowedOrigins = [
  getBaseOrigin(process.env.FRONTEND_URL),
  'https://foldr.online', // Primary production frontend
  'https://stellar-kashata-5b896a.netlify.app', // Netlify frontend
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      console.log('Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parsing middleware with increased limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'FOLDR Backend is running' });
});

// Routes
app.use('/api/pdf', mergeRoutes);
app.use('/api/pdf', compressRoutes);
app.use('/api/pdf', convertRoutes);
app.use('/api/pdf', splitRoutes);
app.use('/api/pdf', deletePagesRoutes);
app.use('/api/pdf', convertOfficeRoutes);
app.use('/api/pdf', pdfOperationsRoutes);
app.use('/api/ai', aiRoutes);

// Serve static files (output PDFs)
app.use('/api/download', express.static(outputDir));

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Cleanup old files every hour
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  [uploadsDir, outputDir].forEach(dir => {
    fs.readdir(dir, (err, files) => {
      if (err) return;
      
      files.forEach(file => {
        const filePath = path.join(dir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          
          if (now - stats.mtime.getTime() > maxAge) {
            fs.unlink(filePath, err => {
              if (!err) console.log(`Cleaned up old file: ${file}`);
            });
          }
        });
      });
    });
  });
}, 60 * 60 * 1000); // Run every hour

app.listen(PORT, () => {
  console.log(`🚀 FOLDR Backend running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log(`📄 Output directory: ${outputDir}`);
}); 