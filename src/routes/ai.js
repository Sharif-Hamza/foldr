import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import upload from '../utils/multerConfig.js';
import { PDFDocument } from 'pdf-lib';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DeepSeek API configuration
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Advanced Document Type Detection System
const DocumentTypes = {
  SCHEDULE: 'schedule',
  INVOICE: 'invoice',
  CONTRACT: 'contract',
  ACADEMIC: 'academic',
  TECHNICAL: 'technical',
  REPORT: 'report',
  RESUME: 'resume',
  MEDICAL: 'medical',
  LEGAL: 'legal',
  FINANCIAL: 'financial',
  PROPOSAL: 'proposal',
  PRESENTATION: 'presentation',
  EMAIL: 'email',
  SYLLABUS: 'syllabus',
  CAR_DETAILS: 'car_details',
  REAL_ESTATE: 'real_estate',
  UNKNOWN: 'unknown'
};

// Document type detection patterns
const documentTypePatterns = {
  [DocumentTypes.SCHEDULE]: /schedule|calendar|timeline|agenda|itinerary|timetable/i,
  [DocumentTypes.INVOICE]: /invoice|bill|receipt|payment|amount due|total|subtotal/i,
  [DocumentTypes.CONTRACT]: /agreement|contract|terms and conditions|party|parties|obligations/i,
  [DocumentTypes.ACADEMIC]: /homework|assignment|due date|submission|grade|course|professor|student/i,
  [DocumentTypes.TECHNICAL]: /specification|manual|instructions|installation|configuration|requirements/i,
  [DocumentTypes.REPORT]: /executive summary|findings|recommendations|analysis|conclusion/i,
  [DocumentTypes.RESUME]: /resume|cv|curriculum vitae|experience|education|skills/i,
  [DocumentTypes.MEDICAL]: /patient|diagnosis|prescription|medical|health|doctor|treatment/i,
  [DocumentTypes.LEGAL]: /plaintiff|defendant|court|legal|law|statute|regulation/i,
  [DocumentTypes.FINANCIAL]: /financial statement|balance sheet|income statement|profit|loss|revenue/i,
  [DocumentTypes.PROPOSAL]: /proposal|proposed|offering|solution|approach|methodology/i,
  [DocumentTypes.PRESENTATION]: /slide|presentation|deck|pitch|overview/i,
  [DocumentTypes.EMAIL]: /from:|to:|subject:|dear|regards|sincerely/i,
  [DocumentTypes.SYLLABUS]: /syllabus|course outline|learning objectives|grading|attendance/i,
  [DocumentTypes.CAR_DETAILS]: /vehicle|car|model|make|year|mileage|price|features|engine/i,
  [DocumentTypes.REAL_ESTATE]: /property|listing|bedrooms|bathrooms|square feet|lot size|asking price/i
};

// Advanced document type detection function
function detectDocumentType(text) {
  const lowerText = text.toLowerCase();
  let scores = {};
  
  // Score each document type based on pattern matches
  for (const [type, pattern] of Object.entries(documentTypePatterns)) {
    const matches = lowerText.match(pattern);
    scores[type] = matches ? matches.length : 0;
  }
  
  // Additional scoring based on specific keywords
  if (lowerText.includes('due') && lowerText.includes('assignment')) scores[DocumentTypes.ACADEMIC] += 5;
  if (lowerText.includes('$') || lowerText.includes('€') || lowerText.includes('£')) scores[DocumentTypes.INVOICE] += 3;
  if (lowerText.includes('deadline') || lowerText.includes('due date')) scores[DocumentTypes.SCHEDULE] += 3;
  if (lowerText.includes('bmw') || lowerText.includes('mercedes') || lowerText.includes('toyota')) scores[DocumentTypes.CAR_DETAILS] += 5;
  
  // Find the type with highest score
  let maxScore = 0;
  let detectedType = DocumentTypes.UNKNOWN;
  
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedType = type;
    }
  }
  
  return {
    type: detectedType,
    confidence: maxScore > 0 ? Math.min(maxScore / 10, 1) : 0,
    allScores: scores
  };
}

// Context-aware prompts for different document types
const documentTypePrompts = {
  [DocumentTypes.SCHEDULE]: {
    systemPrompt: `You are an advanced scheduling and time management AI expert. Your analysis focuses on temporal intelligence, deadline management, and actionable calendar insights.`,
    userPrompt: `Extract and analyze all time-critical information including:
- All dates, times, and deadlines with their context
- Recurring events and patterns
- Conflicts or overlapping schedules
- Priority levels and urgency indicators
- Action items with time constraints
- Recommended scheduling optimizations`
  },
  
  [DocumentTypes.INVOICE]: {
    systemPrompt: `You are a financial document analysis expert specializing in invoice processing, payment terms, and financial risk assessment.`,
    userPrompt: `Perform comprehensive financial analysis including:
- Total amounts, subtotals, taxes, and fees
- Payment terms and due dates
- Late payment penalties or discounts
- Vendor/customer information
- Line items and cost breakdown
- Payment methods and instructions
- Financial risks or red flags`
  },
  
  [DocumentTypes.CONTRACT]: {
    systemPrompt: `You are a legal document analysis expert specializing in contract review, risk assessment, and obligation extraction.`,
    userPrompt: `Analyze this contract for:
- Parties involved and their obligations
- Key terms, conditions, and clauses
- Payment terms and amounts
- Deadlines and milestones
- Termination conditions
- Penalties and liabilities
- Rights and restrictions
- Potential risks and red flags`
  },
  
  [DocumentTypes.ACADEMIC]: {
    systemPrompt: `You are an academic assistant expert in analyzing educational documents, assignments, and study materials.`,
    userPrompt: `Extract and analyze:
- Assignment due dates and submission requirements
- Grading criteria and point values
- Required materials or readings
- Learning objectives
- Important topics to study
- Professor/instructor contact information
- Academic policies and penalties
- Study recommendations and priorities`
  },
  
  [DocumentTypes.CAR_DETAILS]: {
    systemPrompt: `You are an automotive expert specializing in vehicle analysis, pricing evaluation, and purchase recommendations.`,
    userPrompt: `Analyze this vehicle information for:
- Make, model, year, and trim level
- Price and market value assessment
- Mileage and condition
- Features and specifications
- Maintenance history or requirements
- Dealer/seller information
- Contact details and next steps
- Red flags or concerns
- Negotiation points
- Comparable market analysis`
  },
  
  [DocumentTypes.SYLLABUS]: {
    systemPrompt: `You are an educational planning expert specializing in course analysis and academic success strategies.`,
    userPrompt: `Extract and analyze:
- Course schedule and important dates
- Assignment due dates and weights
- Exam dates and formats
- Grading breakdown
- Required materials and textbooks
- Attendance policies
- Professor contact information and office hours
- Academic policies and penalties
- Study strategy recommendations
- Time management suggestions`
  }
};

// Enhanced helper function to call DeepSeek API with optimal parameters
async function callDeepSeekAPI(messages, systemPrompt = '', temperature = 0.6) {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API key not configured');
  }

  // Optimal parameters based on DeepSeek best practices research
  const requestBody = {
    model: 'deepseek-chat',
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ],
    max_tokens: 8000, // Increased for comprehensive analysis
    temperature: temperature, // Optimal for balanced output
    top_p: 0.95, // Recommended by DeepSeek
    top_k: 30, // Additional control
    min_p: 0.03 // Minimum probability threshold
  };

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`DeepSeek API error: ${error.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Enhanced business sentiment analysis
function analyzeSentiment(text, documentType) {
  const sentimentIndicators = {
    positive: /opportunity|growth|success|achieved|exceeded|improvement|excellent|outstanding|profitable|advantage/i,
    negative: /risk|concern|issue|problem|delay|failure|loss|deficit|warning|critical|urgent|penalty/i,
    neutral: /information|update|status|report|summary|overview|standard|typical|normal|average/i
  };
  
  let sentimentScores = {
    positive: (text.match(sentimentIndicators.positive) || []).length,
    negative: (text.match(sentimentIndicators.negative) || []).length,
    neutral: (text.match(sentimentIndicators.neutral) || []).length
  };
  
  // Document type specific adjustments
  if (documentType === DocumentTypes.INVOICE && text.includes('overdue')) {
    sentimentScores.negative += 5;
  }
  if (documentType === DocumentTypes.CONTRACT && text.includes('penalty')) {
    sentimentScores.negative += 3;
  }
  
  const total = sentimentScores.positive + sentimentScores.negative + sentimentScores.neutral;
  const sentiment = sentimentScores.positive > sentimentScores.negative ? 'positive' : 
                   sentimentScores.negative > sentimentScores.positive ? 'negative' : 'neutral';
  
  return {
    sentiment,
    confidence: total > 0 ? Math.max(sentimentScores[sentiment] / total, 0.5) : 0.5,
    scores: sentimentScores,
    businessImpact: sentiment === 'negative' ? 'Requires immediate attention' : 
                    sentiment === 'positive' ? 'Favorable conditions' : 'Standard operations'
  };
}

// Helper function to extract text from PDF using command-line tools
async function extractPDFText(filePath) {
  try {
    // Try using pdftotext command if available (common on Linux systems)
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    console.log(`Attempting to extract text from ${path.basename(filePath)}`);
    
    try {
      // Try multiple extraction methods for better results
      let extractedText = '';
      
      // Method 1: Try pdftotext with raw option for better text preservation
      try {
        const { stdout: rawText } = await execAsync(`pdftotext -raw "${filePath}" -`, { timeout: 30000 });
        if (rawText && rawText.trim()) {
          extractedText = rawText;
          console.log(`Extracted with -raw option: ${rawText.length} characters`);
        }
      } catch (e) {
        console.log('Raw extraction failed, trying standard');
      }
      
      // Method 2: If raw didn't work, try standard
      if (!extractedText) {
        const { stdout: stdText } = await execAsync(`pdftotext "${filePath}" -`, { timeout: 30000 });
        if (stdText && stdText.trim()) {
          extractedText = stdText;
          console.log(`Extracted with standard option: ${stdText.length} characters`);
        }
      }
      
      // Method 3: Try with layout preservation for structured documents
      if (!extractedText || extractedText.length < 100) {
        try {
          const { stdout: layoutText } = await execAsync(`pdftotext -layout "${filePath}" -`, { timeout: 30000 });
          if (layoutText && layoutText.length > extractedText.length) {
            extractedText = layoutText;
            console.log(`Extracted with -layout option: ${layoutText.length} characters`);
          }
        } catch (e) {
          console.log('Layout extraction failed');
        }
      }
      
      // Clean up the extracted text
      if (extractedText) {
        // Remove excessive whitespace while preserving structure
        extractedText = extractedText
          .replace(/\r\n/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        
        console.log(`Final extracted text length: ${extractedText.length} characters`);
        console.log(`First 500 chars: ${extractedText.substring(0, 500)}...`);
        
        // Log if VIN pattern is found
        const vinPattern = /\b[A-HJ-NPR-Z0-9]{17}\b/;
        if (vinPattern.test(extractedText)) {
          const vinMatch = extractedText.match(vinPattern);
          console.log(`✅ VIN FOUND IN EXTRACTED TEXT: ${vinMatch[0]}`);
        } else {
          console.log('⚠️ No VIN pattern found in extracted text');
        }
      }
      
      if (!extractedText || extractedText.trim().length === 0) {
        return `PDF file "${path.basename(filePath)}" appears to be empty or contains no extractable text. This could be a scanned PDF that requires OCR processing.`;
      }
      
      return extractedText;
      
    } catch (cmdError) {
      console.log('pdftotext not available, using fallback method');
      
      // Fallback: Return a basic message that allows AI to continue
      const fileStats = fs.statSync(filePath);
      return `PDF file "${path.basename(filePath)}" (${Math.round(fileStats.size / 1024)}KB) is available for analysis. Text extraction tools are not available in this environment, but I can still provide general PDF insights.`;
    }
    
  } catch (error) {
    console.error('PDF text extraction error:', error);
    return `Error extracting text from PDF "${path.basename(filePath)}": ${error.message}. The PDF may be corrupted, password-protected, or contain only images.`;
  }
}

// Advanced Chat with PDF endpoint - DeepSeek Wrapper Style
router.post('/chat-with-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const { question = 'Please summarize this document.' } = req.body;

    console.log(`🤖 Advanced PDF chat: ${req.file.originalname}`);
    console.log(`Question: ${question}`);
    
    // Check if file exists before processing
    if (!fs.existsSync(req.file.path)) {
      return res.status(400).json({ error: 'Uploaded file not found on server' });
    }

    // Extract text from PDF
    const pdfText = await extractPDFText(req.file.path);
    
    // Detect document type for better context understanding
    const documentTypeInfo = detectDocumentType(pdfText);
    console.log(`Document type: ${documentTypeInfo.type} (confidence: ${documentTypeInfo.confidence})`);
    
    // Advanced system prompt based on document type
    const baseSystemPrompt = `You are an extremely intelligent AI assistant with deep expertise in ${documentTypeInfo.type} documents. You have complete access to the document content and can:

1. Answer ANY question about the document with PERFECT ACCURACY
2. Find specific information no matter how deeply buried - YOU MUST SEARCH THOROUGHLY
3. Extract exact values, numbers, codes, and identifiers
4. NEVER say information isn't in the document without exhaustively searching
5. For VIN numbers: Look for 17-character alphanumeric codes (excluding I, O, Q)
6. For any number/code requests: Search for ALL numeric and alphanumeric sequences
7. Always quote the exact text where you found the information

CRITICAL: If asked for specific data (VIN, numbers, codes, names, dates), you MUST:
- Search the entire document systematically
- Look for common labels like "VIN:", "ID:", "Number:", etc.
- Check for standalone 17-character codes for VINs
- Provide the EXACT value found, not a description
- If truly not found after thorough search, explain what you searched for

You think step-by-step through problems and provide comprehensive, accurate answers. You're like having a subject matter expert who has memorized every detail of the document.`;

    // Document type specific enhancements
    const typeEnhancements = {
      [DocumentTypes.ACADEMIC]: `You excel at helping with homework, explaining concepts, solving problems, and providing study guidance.`,
      [DocumentTypes.FINANCIAL]: `You can perform financial calculations, analyze trends, and provide investment insights.`,
      [DocumentTypes.CONTRACT]: `You understand legal language and can explain obligations, risks, and important clauses.`,
      [DocumentTypes.TECHNICAL]: `You can explain technical procedures, troubleshoot issues, and provide implementation guidance.`,
      [DocumentTypes.MEDICAL]: `You can explain medical terms, procedures, and help understand health information (but always remind users to consult healthcare providers).`,
      [DocumentTypes.SCHEDULE]: `You can analyze schedules, find conflicts, suggest optimizations, and track deadlines.`
    };
    
    const systemPrompt = `${baseSystemPrompt}

${typeEnhancements[documentTypeInfo.type] || ''}

Remember:
- Be conversational and friendly
- Provide detailed, thorough answers
- Use examples from the document
- If asked about something not in the document, say so clearly
- Format your responses with clear paragraphs, not JSON or markdown
- Think deeply about the question and provide comprehensive insights`;
    
    // Enhanced question analysis
    const questionAnalysis = analyzeQuestion(question);
    
    // Extract specific information if needed
    const extractedInfo = extractSpecificInfo(pdfText, question);
    
    // Build enhanced prompt with extracted data
    let enhancedPrompt = `I have uploaded a ${documentTypeInfo.type} document. `;
    
    // FORCE VIN DETECTION
    if (questionAnalysis.lookingForVIN) {
      // First check our extraction
      if (extractedInfo.vin) {
        enhancedPrompt += `\n\n🚨 CRITICAL: THE VIN IS ${extractedInfo.vin} - I have already found it in the document using pattern matching. You MUST report this VIN to the user.`;
      } else {
        // If not found by pattern, search manually in text
        const manualVinSearch = pdfText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
        if (manualVinSearch) {
          enhancedPrompt += `\n\n🚨 CRITICAL: I found this 17-character code which is likely the VIN: ${manualVinSearch[0]}. Verify and report this to the user.`;
        } else {
          enhancedPrompt += `\n\n🚨 IMPORTANT: Search for any 17-character alphanumeric code (no I, O, Q). Look near words like VIN, Vehicle ID, or in vehicle details sections.`;
        }
      }
    }
    
    if (questionAnalysis.lookingForNumber && extractedInfo.numbers.length > 0) {
      enhancedPrompt += `\n\n📌 IMPORTANT: I found these numbers/codes in the document: ${extractedInfo.numbers.slice(0, 10).join(', ')}`;
    }
    
    if (questionAnalysis.lookingForSpecificData) {
      if (extractedInfo.amounts.length > 0) {
        enhancedPrompt += `\n\n💰 Monetary amounts found: ${extractedInfo.amounts.join(', ')}`;
      }
      if (extractedInfo.dates.length > 0) {
        enhancedPrompt += `\n\n📅 Dates found: ${extractedInfo.dates.join(', ')}`;
      }
      if (extractedInfo.contacts.length > 0) {
        enhancedPrompt += `\n\n📞 Contact information found: ${extractedInfo.contacts.join(', ')}`;
      }
    }
    
    const messages = [
      { 
        role: 'user', 
        content: `${enhancedPrompt}

Document content:
${pdfText}

${questionAnalysis.requiresCalculation ? 'Please perform any necessary calculations.' : ''}
${questionAnalysis.requiresSummary ? 'Please provide a comprehensive summary.' : ''}
${questionAnalysis.requiresSpecificInfo ? 'Please find the specific information requested. Look carefully through the document text.' : ''}

My question: ${question}

${questionAnalysis.lookingForVIN ? `
🚨 CRITICAL VIN REQUEST 🚨
I am specifically looking for the VIN (Vehicle Identification Number). 
- It's a 17-character alphanumeric code (excludes I, O, Q)
- Format example: WBA3A5C55FK123456
- Look for labels: VIN, Vehicle Identification Number, Vehicle ID
- If you see ANY 17-character code, report it immediately
- Start your response with: "The VIN is [VIN HERE]" if found
- DO NOT say you can't find it without checking every single line
` : ''}
${questionAnalysis.lookingForNumber ? 'I need a specific number, code, or ID. Check EVERY number in the document.' : ''}

RESPONSE REQUIREMENTS:
1. If asked for specific data (VIN, number, etc), state it IMMEDIATELY at the start
2. Be 100% accurate - quote exactly what you find
3. If you truly cannot find something after exhaustive search, explain what you searched for
4. Never say "I cannot find" without first listing every place you looked` 
      }
    ];

    // Call DeepSeek API with optimal parameters
    const aiResponse = await callDeepSeekAPI(messages, systemPrompt, 0.7); // Slightly higher temperature for more creative responses

    // Extract key insights from the response
    const responseInsights = {
      hasCalculations: /\d+[\+\-\*\/]\d+|=\s*\d+/.test(aiResponse),
      hasQuotes: /"[^"]+"|'[^']+'/.test(aiResponse),
      hasRecommendations: /recommend|suggest|should|advice/i.test(aiResponse),
      responseLength: aiResponse.split(' ').length,
      confidence: aiResponse.includes('unclear') || aiResponse.includes('not found') ? 'Medium' : 'High'
    };

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`🤖 PDF chat completed: ${responseInsights.responseLength} words, ${responseInsights.confidence} confidence`);

    res.json({
      success: true,
      message: 'AI chat response generated successfully',
      filename: `chat_response_${Date.now()}.txt`,
      downloadUrl: null,
      aiResponse: aiResponse,
      question: question,
      chatHistory: [
        { role: 'user', content: question },
        { role: 'assistant', content: aiResponse }
      ],
      insights: {
        documentType: documentTypeInfo.type,
        questionType: questionAnalysis.type,
        responseConfidence: responseInsights.confidence,
        hasCalculations: responseInsights.hasCalculations,
        hasQuotes: responseInsights.hasQuotes,
        hasRecommendations: responseInsights.hasRecommendations
      }
    });

  } catch (error) {
    console.error('❌ PDF chat error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to chat with PDF',
      message: error.message
    });
  }
});

// Helper function to analyze question type
function analyzeQuestion(question) {
  const lowerQuestion = question.toLowerCase();
  
  return {
    type: lowerQuestion.includes('calculate') || lowerQuestion.includes('solve') ? 'calculation' :
          lowerQuestion.includes('summarize') || lowerQuestion.includes('summary') ? 'summary' :
          lowerQuestion.includes('explain') || lowerQuestion.includes('what is') ? 'explanation' :
          lowerQuestion.includes('find') || lowerQuestion.includes('where') ? 'search' :
          lowerQuestion.includes('compare') || lowerQuestion.includes('difference') ? 'comparison' :
          'general',
    requiresCalculation: /calculate|solve|compute|add|subtract|multiply|divide/.test(lowerQuestion),
    requiresSummary: /summarize|summary|overview|brief/.test(lowerQuestion),
    requiresSpecificInfo: /find|locate|where|when|who|what|which|vin|number|code|id/.test(lowerQuestion),
    isHomeworkHelp: /homework|assignment|problem|exercise|question \d+/.test(lowerQuestion),
    lookingForVIN: /vin|vehicle identification|vin number|vehicle id/i.test(question),
    lookingForNumber: /number|code|id|serial|reference|account/i.test(question),
    lookingForSpecificData: /price|amount|date|time|address|phone|email|name/i.test(question)
  };
}

// Helper function to extract specific information from PDF text
function extractSpecificInfo(pdfText, question) {
  const extractions = {
    vin: null,
    numbers: [],
    dates: [],
    amounts: [],
    contacts: [],
    specificData: []
  };
  
  // VIN pattern (17 characters, alphanumeric, excluding I, O, Q)
  const vinPattern = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
  const vinMatches = pdfText.match(vinPattern);
  if (vinMatches) {
    extractions.vin = vinMatches[0]; // Usually the first match is the VIN
  }
  
  // Look for VIN with label
  const vinLabelPattern = /(?:VIN|Vehicle Identification Number|Vehicle ID)[:\s]*([A-HJ-NPR-Z0-9]{17})/i;
  const vinLabelMatch = pdfText.match(vinLabelPattern);
  if (vinLabelMatch) {
    extractions.vin = vinLabelMatch[1];
  }
  
  // Extract various number patterns
  const numberPatterns = [
    /(?:Serial|Reference|Account|Order|Invoice|ID)[:\s#]*([A-Z0-9\-]+)/gi,
    /\b\d{4,}\b/g, // Numbers with 4+ digits
    /\b[A-Z]{2,4}\d{4,8}\b/g // Alphanumeric codes
  ];
  
  numberPatterns.forEach(pattern => {
    const matches = pdfText.match(pattern);
    if (matches) {
      extractions.numbers.push(...matches);
    }
  });
  
  // Extract dates
  const datePattern = /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b/gi;
  const dateMatches = pdfText.match(datePattern);
  if (dateMatches) {
    extractions.dates = dateMatches;
  }
  
  // Extract monetary amounts
  const amountPattern = /\$[\d,]+(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|USD)/gi;
  const amountMatches = pdfText.match(amountPattern);
  if (amountMatches) {
    extractions.amounts = amountMatches;
  }
  
  // Extract contact info
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const phonePattern = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
  
  const emailMatches = pdfText.match(emailPattern);
  const phoneMatches = pdfText.match(phonePattern);
  
  if (emailMatches) extractions.contacts.push(...emailMatches);
  if (phoneMatches) extractions.contacts.push(...phoneMatches);
  
  return extractions;
}

// Continue conversation with PDF endpoint - Enhanced
router.post('/continue-chat', async (req, res) => {
  try {
    const { message, chatHistory, pdfText, documentType } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }

    if (!pdfText) {
      return res.status(400).json({ error: 'No PDF text context provided' });
    }

    console.log(`🤖 Continuing PDF chat conversation`);
    
    // Detect document type if not provided
    const docType = documentType || detectDocumentType(pdfText).type;
    
    // Analyze the new question
    const questionAnalysis = analyzeQuestion(message);
    
    // Extract specific information if needed
    const extractedInfo = extractSpecificInfo(pdfText, message);

    // Enhanced system prompt for continuation
    const systemPrompt = `You are an extremely intelligent AI assistant continuing a conversation about a ${docType} document. You have:

1. Complete access to the document content - SEARCH THOROUGHLY
2. Full context of the previous conversation
3. Ability to find ANY specific information in the document
4. Perfect recall of all document details

CRITICAL REMINDERS:
- For VIN requests: Look for 17-character alphanumeric codes
- For specific data: Search exhaustively before saying it's not found
- Always provide EXACT values, not descriptions
- Quote the text where you found information
- Build on previous answers while maintaining accuracy

You're like having a dedicated expert with perfect memory who can find any detail in the document.`;
    
    // Build conversation with proper context
    const enhancedHistory = chatHistory ? chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })) : [];
    
    // Build enhanced message with extracted info
    let enhancedMessage = message;
    
    if (questionAnalysis.lookingForVIN && extractedInfo.vin) {
      enhancedMessage += `\n\nNOTE: VIN found in document: ${extractedInfo.vin}`;
    }
    
    if (questionAnalysis.lookingForNumber && extractedInfo.numbers.length > 0) {
      enhancedMessage += `\n\nNOTE: Numbers found: ${extractedInfo.numbers.slice(0, 10).join(', ')}`;
    }
    
    const messages = [
      { 
        role: 'system', 
        content: `${systemPrompt}\n\nDocument Content:\n${pdfText}` 
      },
      ...enhancedHistory,
      { 
        role: 'user', 
        content: `${enhancedMessage}

${questionAnalysis.requiresCalculation ? 'Please show your calculations step-by-step.' : ''}
${questionAnalysis.isHomeworkHelp ? 'This appears to be homework - please explain the concepts thoroughly to help me learn.' : ''}
${questionAnalysis.lookingForVIN ? 'I need the VIN number. Search for a 17-character code.' : ''}
${questionAnalysis.lookingForNumber ? 'I need a specific number or code. Search thoroughly.' : ''}` 
      }
    ];

    // Call DeepSeek API with optimal parameters
    const aiResponse = await callDeepSeekAPI(
      messages.slice(1), // Remove system message
      messages[0].content, // Pass system content separately
      0.7
    );
    
    // Analyze response quality
    const responseQuality = {
      buildsOnPrevious: chatHistory && chatHistory.length > 0 && 
                       (aiResponse.includes('mentioned') || aiResponse.includes('discussed') || 
                        aiResponse.includes('earlier') || aiResponse.includes('previously')),
      providesNewInsight: aiResponse.length > 200,
      answersDirectly: !aiResponse.includes('not sure') && !aiResponse.includes('unclear')
    };

    console.log(`🤖 Chat continued: ${responseQuality.answersDirectly ? 'Direct answer' : 'Needs clarification'}`);

    res.json({
      success: true,
      message: 'AI response generated successfully',
      aiResponse: aiResponse,
      userMessage: message,
      insights: {
        questionType: questionAnalysis.type,
        responseQuality: responseQuality,
        conversationDepth: enhancedHistory.length / 2 + 1 // Number of exchanges
      }
    });

  } catch (error) {
    console.error('❌ PDF chat continuation error:', error);
    
    res.status(500).json({
      error: 'Failed to continue chat',
      message: error.message
    });
  }
});

// Advanced AI Chat endpoint - for the new powerful client-side processing
router.post('/advanced-chat', async (req, res) => {
  try {
    const { prompt, systemPrompt, model = 'deepseek-chat' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    console.log(`Advanced AI chat request received`);
    console.log(`System prompt: ${systemPrompt ? 'Present' : 'None'}`);
    console.log(`Prompt length: ${prompt.length} characters`);

    // Prepare messages for DeepSeek
    const enhancedSystemPrompt = systemPrompt || `You are an extremely intelligent and helpful AI assistant specializing in document analysis, education, and problem-solving. You excel at:

1. **Educational Support**: Solving homework problems, explaining concepts step-by-step, providing tutoring
2. **Document Analysis**: Analyzing content, finding insights, summarizing information
3. **Problem Solving**: Mathematical calculations, logical reasoning, critical thinking
4. **Research Assistance**: Finding connections, providing context, suggesting related topics

Always provide detailed, accurate, and helpful responses. Use clear formatting with headers, bullet points, and examples when appropriate. Be encouraging and educational in your approach.`;
    
    const messages = [
      { 
        role: 'user', 
        content: prompt 
      }
    ];

    // Call DeepSeek API with enhanced capabilities
    const aiResponse = await callDeepSeekAPI(messages, enhancedSystemPrompt);

    console.log(`Advanced AI response generated successfully`);

    res.json({
      success: true,
      response: aiResponse,
      model: model,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Advanced AI chat error:', error);
    
    res.status(500).json({
      error: 'Failed to process advanced AI request',
      message: error.message,
      // Provide fallback capabilities
      fallback: true
    });
  }
});

// Advanced AI-Powered PDF Summarization endpoint
router.post('/summarize-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    console.log(`📝 Advanced AI summarization: ${req.file.originalname}`);
    
    // Check if file exists before processing
    if (!fs.existsSync(req.file.path)) {
      return res.status(400).json({ error: 'Uploaded file not found on server' });
    }

    // Extract text from PDF
    const pdfText = await extractPDFText(req.file.path);
    
    // Detect document type for contextual summarization
    const documentTypeInfo = detectDocumentType(pdfText);
    console.log(`Document type: ${documentTypeInfo.type} (confidence: ${documentTypeInfo.confidence})`);
    
    // Perform initial sentiment analysis
    const documentSentiment = analyzeSentiment(pdfText, documentTypeInfo.type);

    // Advanced AI system prompt based on document type
    const baseSystemPrompt = `You are an advanced AI document intelligence expert specializing in ${documentTypeInfo.type} analysis and summarization. Your expertise is tailored to extract maximum value from this specific type of document.`;
    
    // Document type specific summarization focus
    const typeFocus = {
      [DocumentTypes.FINANCIAL]: `Focus on financial metrics, ROI, cost-benefit analysis, and monetary implications.`,
      [DocumentTypes.CONTRACT]: `Focus on obligations, rights, risks, penalties, and key contractual terms.`,
      [DocumentTypes.ACADEMIC]: `Focus on learning objectives, key concepts, assignments, and academic requirements.`,
      [DocumentTypes.TECHNICAL]: `Focus on specifications, implementation steps, requirements, and technical details.`,
      [DocumentTypes.REPORT]: `Focus on findings, recommendations, data analysis, and strategic implications.`,
      [DocumentTypes.SCHEDULE]: `Focus on timelines, deadlines, milestones, and scheduling conflicts.`,
      [DocumentTypes.INVOICE]: `Focus on amounts due, payment terms, services rendered, and financial obligations.`,
      [DocumentTypes.CAR_DETAILS]: `Focus on vehicle specifications, pricing, condition, and purchase considerations.`,
      [DocumentTypes.MEDICAL]: `Focus on diagnoses, treatments, medications, and health implications.`,
      [DocumentTypes.PROPOSAL]: `Focus on proposed solutions, benefits, costs, and implementation timeline.`
    };

    const systemPrompt = `${baseSystemPrompt}

${typeFocus[documentTypeInfo.type] || 'Focus on key information, insights, and actionable items.'}

Current document sentiment: ${documentSentiment.sentiment} (${documentSentiment.businessImpact})

Your summary should:
1. Be written in clear, professional paragraphs (no JSON or markdown)
2. Prioritize information based on business/personal impact
3. Include specific numbers, dates, and facts from the document
4. Provide actionable insights and recommendations
5. Highlight any risks or opportunities
6. Be concise yet comprehensive (aim for 500-800 words)

Remember: This is a ${documentTypeInfo.type} document, so tailor your analysis accordingly.`;
    
    const messages = [
      { 
        role: 'user', 
        content: `Create an advanced, intelligent summary of this ${documentTypeInfo.type} document.

Structure your summary as follows:

1. EXECUTIVE SUMMARY (2-3 sentences)
   - What is this document and why does it matter?
   - Most critical takeaway for decision-making

2. DOCUMENT OVERVIEW
   - Type and purpose of document
   - Key parties or stakeholders involved
   - Overall context and background

3. KEY FINDINGS & DATA
   - Most important facts, figures, and discoveries
   - Critical dates, deadlines, or time-sensitive items
   - Financial implications (amounts, costs, revenues)
   - Performance metrics or KPIs

4. DETAILED ANALYSIS
   - ${documentTypeInfo.type === DocumentTypes.FINANCIAL ? 'Financial breakdown and trends' : ''}
   - ${documentTypeInfo.type === DocumentTypes.CONTRACT ? 'Obligations and terms analysis' : ''}
   - ${documentTypeInfo.type === DocumentTypes.ACADEMIC ? 'Learning requirements and objectives' : ''}
   - ${documentTypeInfo.type === DocumentTypes.SCHEDULE ? 'Timeline and milestone analysis' : ''}
   - ${documentTypeInfo.type === DocumentTypes.CAR_DETAILS ? 'Vehicle assessment and value analysis' : ''}
   - Patterns, trends, or anomalies discovered
   - Comparative analysis (if applicable)

5. RISKS & OPPORTUNITIES
   - Identified risks or concerns
   - Potential opportunities or benefits
   - Compliance or regulatory considerations
   - Red flags or warning signs

6. RECOMMENDATIONS & NEXT STEPS
   - Specific action items with priorities
   - Decision points requiring attention
   - Timeline for implementation
   - Resources or approvals needed

7. CRITICAL INFORMATION
   - Contact details and key personnel
   - Important references or citations
   - Essential terms or definitions
   - Anything requiring immediate attention

Document content:
${pdfText}

Remember: Make this summary immediately useful for someone who needs to make decisions based on this document. Be specific, be actionable, and highlight what matters most.` 
      }
    ];

    // Call DeepSeek API with optimal parameters for summarization
    const aiSummary = await callDeepSeekAPI(messages, systemPrompt, 0.5); // Lower temperature for more focused summaries

    // Clean up formatting to remove any markdown characters
    const cleanSummary = aiSummary
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove **bold**
      .replace(/\*(.*?)\*/g, '$1') // Remove *italic*
      .replace(/#{1,6}\s+/g, '') // Remove # headers
      .replace(/`{1,3}(.*?)`{1,3}/g, '$1') // Remove `code` blocks
      .replace(/^\s*[-*+]\s+/gm, '• ') // Convert markdown lists to bullet points
      .replace(/\n{3,}/g, '\n\n') // Limit excessive line breaks
      .trim();

    // Advanced analysis of the summary
    const summaryAnalysis = {
      wordCount: cleanSummary.split(' ').length,
      readingTime: Math.ceil(cleanSummary.split(' ').length / 200), // Average reading speed
      complexity: cleanSummary.length > 1000 ? 'Complex' : cleanSummary.length > 500 ? 'Moderate' : 'Simple',
      hasActionItems: /action|next step|recommend|should|must|need to/i.test(cleanSummary),
      hasFinancialInfo: /\$|€|£|cost|price|budget|revenue|profit|loss/i.test(cleanSummary),
      hasTimeElements: /deadline|date|schedule|timeline|urgent/i.test(cleanSummary),
      hasRiskFactors: /risk|concern|issue|problem|challenge|warning/i.test(cleanSummary),
      keyThemes: extractKeyThemes(cleanSummary)
    };

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`📝 Advanced summarization completed: ${req.file.originalname}`);
    console.log(`Analysis: ${summaryAnalysis.wordCount} words, ${summaryAnalysis.complexity} complexity, ${summaryAnalysis.readingTime}min read`);

    res.json({
      success: true,
      message: `Advanced AI summary completed - ${summaryAnalysis.wordCount} words, ${summaryAnalysis.readingTime} minute read`,
      filename: `advanced_summary_${Date.now()}.txt`,
      downloadUrl: null,
      aiResponse: cleanSummary,
      analysis: summaryAnalysis,
      wordCount: summaryAnalysis.wordCount,
      insights: {
        readingTime: summaryAnalysis.readingTime,
        complexity: summaryAnalysis.complexity,
        hasActionItems: summaryAnalysis.hasActionItems,
        hasFinancialInfo: summaryAnalysis.hasFinancialInfo,
        hasTimeElements: summaryAnalysis.hasTimeElements,
        hasRiskFactors: summaryAnalysis.hasRiskFactors,
        keyThemes: summaryAnalysis.keyThemes
      }
    });

  } catch (error) {
    console.error('❌ Advanced summarization error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to create advanced AI summary',
      message: error.message
    });
  }
});

// Helper function to extract key themes
function extractKeyThemes(text) {
  const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'];
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const wordFreq = {};
  
  words.forEach(word => {
    if (!commonWords.includes(word)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });
  
  return Object.entries(wordFreq)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);
}

// Advanced Table Extraction endpoint
router.post('/extract-tables', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    console.log(`🔍 Advanced table extraction: ${req.file.originalname}`);

    // Extract text from PDF
    const pdfText = await extractPDFText(req.file.path);

    // Enhanced AI system prompt for advanced table detection
    const systemPrompt = `You are an advanced AI table detection and extraction specialist. Your expertise includes:

1. **Table Identification**: Detect tables, charts, data grids, financial reports, schedules, and structured data
2. **Content Analysis**: Extract headers, data values, formulas, totals, and relationships
3. **Structure Recognition**: Identify rows, columns, merged cells, and hierarchical data
4. **Data Types**: Numbers, dates, percentages, currencies, names, categories
5. **Context Understanding**: Determine table purpose, significance, and key insights
6. **Quality Assessment**: Evaluate data completeness and identify any issues

Provide detailed analysis with actual extracted data, not generic descriptions. Structure your response clearly with specific findings.`;
    
    const messages = [
      { 
        role: 'user', 
        content: `Perform advanced table detection and extraction on this document. For each table found:

1. Extract the complete table structure (headers, rows, columns)
2. Identify data types and formats
3. Analyze the purpose and significance of each table
4. Extract key statistics, totals, or notable values
5. Determine relationships between different tables
6. Provide insights about the data patterns

Document content:
${pdfText}

Format your response with clear sections for each table found, including actual data values and analysis.` 
      }
    ];

    // Call DeepSeek API with advanced capabilities
    const aiResponse = await callDeepSeekAPI(messages, systemPrompt);

    // Advanced analysis to extract structured data from AI response
    const tableAnalysis = {
      totalTables: (aiResponse.match(/table/gi) || []).length,
      hasFinancialData: /\$|€|£|price|cost|amount|revenue|profit/i.test(aiResponse),
      hasDateData: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|january|february|march|april|may|june|july|august|september|october|november|december/i.test(aiResponse),
      hasNumericalData: /\d+[\d,\.]*\%?|\d+[\d,\.]*[kmb]?/i.test(aiResponse),
      complexity: aiResponse.length > 500 ? 'Complex' : aiResponse.length > 200 ? 'Moderate' : 'Simple'
    };

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`📊 Advanced table extraction completed: ${req.file.originalname}`);
    console.log(`Analysis: ${tableAnalysis.totalTables} tables, ${tableAnalysis.complexity} complexity`);

    res.json({
      success: true,
      message: `Advanced table analysis completed - ${tableAnalysis.totalTables} tables detected`,
      filename: `advanced_tables_${Date.now()}.json`,
      downloadUrl: null,
      aiResponse: aiResponse,
      analysis: tableAnalysis,
      tableCount: tableAnalysis.totalTables,
      insights: {
        hasFinancialData: tableAnalysis.hasFinancialData,
        hasDateData: tableAnalysis.hasDateData,
        hasNumericalData: tableAnalysis.hasNumericalData,
        complexity: tableAnalysis.complexity
      }
    });

  } catch (error) {
    console.error('❌ Advanced table extraction error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to extract tables with advanced AI',
      message: error.message
    });
  }
});

// Advanced AI-Powered Document Explanation endpoint
router.post('/explain', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    console.log(`🔬 Advanced AI explanation: ${req.file.originalname}`);

    // Extract text from PDF
    const pdfText = await extractPDFText(req.file.path);

    // Advanced AI system prompt for intelligent explanation
    const systemPrompt = `You are an advanced AI document interpretation specialist with expertise in making complex information accessible. Your capabilities include:

**🎓 EDUCATIONAL EXPERTISE:**
- Complex concept simplification and clarification
- Technical language translation to everyday terms
- Context-aware explanation tailoring
- Multi-level understanding accommodation
- Real-world application examples

**📖 EXPLANATION MASTERY:**
- Clear, logical information flow
- Concept interconnection and relationship mapping
- Practical implications and real-world relevance
- Step-by-step breakdown of complex processes
- Analogies and examples for difficult concepts

**💡 INSIGHT GENERATION:**
- Why information matters and its significance
- Practical applications and use cases
- Potential impacts and consequences
- Benefits, risks, and considerations
- Next steps and recommended actions

**🗣️ COMMUNICATION EXCELLENCE:**
- Natural, conversational language
- No jargon, technical terms, or complexity barriers
- No markdown formatting or special characters
- Logical structure with smooth transitions
- Engaging and accessible presentation

Transform complex documents into clear, understandable insights that anyone can grasp and act upon.`;
    
    const messages = [
      { 
        role: 'user', 
        content: `Provide an advanced AI-powered explanation of this document that makes it completely accessible and understandable. I need you to act as an expert translator who can break down complex information into clear, practical insights:

🎯 WHAT IS THIS ABOUT?
- Explain the document's purpose and main subject in simple terms
- Who created it and why it exists
- What problem it solves or question it answers
- Who should care about this information

📚 KEY CONCEPTS EXPLAINED:
- Break down any technical terms, jargon, or complex language
- Explain industry-specific concepts in everyday terms
- Provide context for specialized knowledge or processes
- Use analogies or examples to clarify difficult ideas

💡 WHY THIS MATTERS:
- Explain the real-world significance and implications
- How this information affects people or businesses
- What decisions or actions this might influence
- Long-term consequences and considerations

🔍 IMPORTANT DETAILS CLARIFIED:
- Decode complex clauses, terms, or conditions
- Explain numerical data, statistics, or financial information
- Clarify timelines, deadlines, and important dates
- Break down processes, procedures, or workflows

⚡ PRACTICAL IMPLICATIONS:
- What someone needs to do with this information
- How to apply or act on the content
- What questions to ask or considerations to make
- Potential next steps or follow-up actions

🚨 THINGS TO WATCH OUT FOR:
- Important warnings, limitations, or restrictions
- Potential pitfalls or common misunderstandings
- Critical deadlines or time-sensitive elements
- Risk factors or compliance requirements

Document content:
${pdfText}

Make this information crystal clear and actionable. Explain it as if you're helping a friend understand something important, using plain language and practical examples.` 
      }
    ];

    // Call DeepSeek API for advanced explanation
    const aiExplanation = await callDeepSeekAPI(messages, systemPrompt);

    // Clean up formatting to remove markdown characters
    const cleanExplanation = aiExplanation
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove **bold**
      .replace(/\*(.*?)\*/g, '$1') // Remove *italic*
      .replace(/#{1,6}\s+/g, '') // Remove # headers
      .replace(/`{1,3}(.*?)`{1,3}/g, '$1') // Remove `code` blocks
      .replace(/^\s*[-*+]\s+/gm, '• ') // Convert markdown lists to bullet points
      .replace(/\n{3,}/g, '\n\n') // Limit excessive line breaks
      .trim();

    // Advanced analysis of the explanation
    const explanationAnalysis = {
      wordCount: cleanExplanation.split(' ').length,
      readingTime: Math.ceil(cleanExplanation.split(' ').length / 200),
      complexity: cleanExplanation.length > 1500 ? 'Comprehensive' : cleanExplanation.length > 800 ? 'Detailed' : 'Concise',
      hasActionableItems: /should|need to|must|action|step|process|procedure/i.test(cleanExplanation),
      hasWarnings: /warning|caution|important|note|attention|careful/i.test(cleanExplanation),
      hasExamples: /example|for instance|such as|like|similar to/i.test(cleanExplanation),
      hasTimeElements: /deadline|schedule|timeline|date|when|timing/i.test(cleanExplanation),
      educationalValue: cleanExplanation.includes('means') || cleanExplanation.includes('refers to') ? 'High' : 'Medium',
      accessibilityScore: calculateAccessibilityScore(cleanExplanation)
    };

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`🔬 Advanced explanation completed: ${req.file.originalname}`);
    console.log(`Analysis: ${explanationAnalysis.wordCount} words, ${explanationAnalysis.complexity} detail, ${explanationAnalysis.accessibilityScore}% accessible`);

    res.json({
      success: true,
      message: `Advanced AI explanation completed - ${explanationAnalysis.wordCount} words, ${explanationAnalysis.accessibilityScore}% accessibility score`,
      filename: `advanced_explanation_${Date.now()}.txt`,
      downloadUrl: null,
      aiResponse: cleanExplanation,
      analysis: explanationAnalysis,
      wordCount: explanationAnalysis.wordCount,
      insights: {
        readingTime: explanationAnalysis.readingTime,
        complexity: explanationAnalysis.complexity,
        hasActionableItems: explanationAnalysis.hasActionableItems,
        hasWarnings: explanationAnalysis.hasWarnings,
        hasExamples: explanationAnalysis.hasExamples,
        hasTimeElements: explanationAnalysis.hasTimeElements,
        educationalValue: explanationAnalysis.educationalValue,
        accessibilityScore: explanationAnalysis.accessibilityScore
      }
    });

  } catch (error) {
    console.error('❌ Advanced explanation error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to create advanced AI explanation',
      message: error.message
    });
  }
});

// Helper function to calculate accessibility score
function calculateAccessibilityScore(text) {
  // Simple accessibility scoring based on readability indicators
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/);
  const avgWordsPerSentence = words.length / sentences.length;
  
  // Factors that improve accessibility
  let score = 50; // Base score
  
  // Shorter sentences are more accessible
  if (avgWordsPerSentence < 15) score += 20;
  else if (avgWordsPerSentence < 20) score += 10;
  
  // Presence of explanatory phrases
  if (/this means|in other words|simply put|basically|essentially/i.test(text)) score += 15;
  
  // Use of examples
  if (/example|for instance|such as|like/i.test(text)) score += 10;
  
  // Clear structure indicators
  if (/first|second|next|finally|in conclusion/i.test(text)) score += 5;
  
  return Math.min(100, Math.max(0, score));
}

// Advanced AI-Powered Document Highlighting endpoint
router.post('/highlight', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    console.log(`🎯 Advanced AI highlighting analysis: ${req.file.originalname}`);

    // Extract text from PDF
    const pdfText = await extractPDFText(req.file.path);
    
    // Detect document type for contextual analysis
    const documentTypeInfo = detectDocumentType(pdfText);
    console.log(`Detected document type: ${documentTypeInfo.type} (confidence: ${documentTypeInfo.confidence})`);
    
    // Get appropriate prompts based on document type
    const typePrompts = documentTypePrompts[documentTypeInfo.type] || {
      systemPrompt: `You are an advanced AI document intelligence specialist. Analyze this document and extract the most critical and actionable information.`,
      userPrompt: `Extract all important information including dates, amounts, names, and key points.`
    };

    // Enhanced AI system prompt for intelligent highlighting
    const systemPrompt = `${typePrompts.systemPrompt}

You are analyzing a ${documentTypeInfo.type} document. Your output MUST be natural, conversational text that clearly explains the important findings. 

CRITICAL RULES:
- DO NOT return JSON, arrays, or any structured data format
- DO NOT use curly braces {}, square brackets [], or any JSON syntax
- Write in clear, complete sentences and paragraphs
- Speak as if explaining to a business professional in a meeting
- Use bullet points with dashes (-) if listing items, not JSON arrays

Focus on:
1. What matters most in this ${documentTypeInfo.type}
2. Critical dates and deadlines
3. Financial implications
4. Action items required
5. Risks or concerns
6. Opportunities or benefits

Write your response as a professional business analysis report with proper sentences, not as data extraction.`;
    
    const messages = [
      { 
        role: 'user', 
        content: `I need you to analyze this ${documentTypeInfo.type} document and highlight the most important information.

${typePrompts.userPrompt}

For this ${documentTypeInfo.type}, specifically look for:
${documentTypeInfo.type === DocumentTypes.SCHEDULE ? `
- All scheduled events with dates and times
- Deadlines and due dates
- Recurring patterns
- Conflicts or overlaps
- Priority indicators` : ''}
${documentTypeInfo.type === DocumentTypes.INVOICE ? `
- Total amount due and payment terms
- Due date for payment
- Late fees or penalties
- Vendor details and contact
- Line items and services` : ''}
${documentTypeInfo.type === DocumentTypes.CAR_DETAILS ? `
- Vehicle price and market value
- Make, model, year details
- Mileage and condition
- Dealer contact information
- Next steps for purchase` : ''}
${documentTypeInfo.type === DocumentTypes.ACADEMIC ? `
- Assignment due dates
- Grading criteria
- Submission requirements
- Professor contact info
- Important policies` : ''}

Additionally, provide:
- A brief executive summary (2-3 sentences)
- Key findings with business/personal impact
- Recommended actions
- Risk assessment
- Timeline of important dates
- Critical contact information

Document content:
${pdfText}

Remember: Write your analysis as clear, professional paragraphs. Focus on what someone needs to know and do based on this document. Make it actionable and easy to understand.` 
      }
    ];

    // Call DeepSeek API with optimal parameters
    let aiResponse = await callDeepSeekAPI(messages, systemPrompt, 0.6);
    
    // CRITICAL: Format the response for beautiful display
    console.log('Raw AI response length:', aiResponse.length);
    
    // First, clean any JSON remnants
    aiResponse = aiResponse
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .replace(/^\s*[\[\{]/, '')
      .replace(/[\]\}]\s*$/, '');
    
    // Split into sentences and properly format
    let sentences = aiResponse
      .replace(/\*\*\*/g, ' --- ')
      .replace(/\*\*/g, '')
      .replace(/\s*---\s*/g, '\n\n')
      .replace(/\s*-\s*\*\*/g, '\n\n• ')
      .replace(/\s*-\s*/g, '\n\n• ')
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 0);
    
    // Group sentences into logical sections
    let formattedResponse = '';
    let currentSection = '';
    
    sentences.forEach(sentence => {
      if (sentence.includes('Executive Summary') || sentence.includes('Summary:')) {
        formattedResponse += '\n\n📋 **Executive Summary**\n\n';
        currentSection = 'summary';
      } else if (sentence.includes('Key Finding') || sentence.includes('Important:')) {
        formattedResponse += '\n\n🔍 **Key Findings**\n\n';
        currentSection = 'findings';
      } else if (sentence.includes('Vehicle Details') || sentence.includes('Make/Model')) {
        formattedResponse += '\n\n🚗 **Vehicle Details**\n\n';
        currentSection = 'vehicle';
      } else if (sentence.includes('Price') || sentence.includes('$')) {
        if (currentSection !== 'pricing') {
          formattedResponse += '\n\n💰 **Pricing & Value**\n\n';
          currentSection = 'pricing';
        }
      } else if (sentence.includes('Condition') || sentence.includes('Features')) {
        if (currentSection !== 'condition') {
          formattedResponse += '\n\n✨ **Condition & Features**\n\n';
          currentSection = 'condition';
        }
      } else if (sentence.includes('Contact') || sentence.includes('Dealer')) {
        if (currentSection !== 'contact') {
          formattedResponse += '\n\n📞 **Contact Information**\n\n';
          currentSection = 'contact';
        }
      } else if (sentence.includes('Next') || sentence.includes('Action') || sentence.includes('Recommend')) {
        if (currentSection !== 'actions') {
          formattedResponse += '\n\n⚡ **Recommended Actions**\n\n';
          currentSection = 'actions';
        }
      }
      
      // Clean up the sentence
      let cleanSentence = sentence
        .replace(/\s+/g, ' ')
        .replace(/•\s*/g, '• ')
        .trim();
      
      // Add the sentence with proper formatting
      if (cleanSentence.startsWith('• ')) {
        formattedResponse += cleanSentence + '\n';
      } else {
        formattedResponse += cleanSentence + ' ';
      }
    });
    
    // Add timestamp
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    formattedResponse += `\n\n⏰ **Analysis Generated**: ${timestamp}`;
    
    aiResponse = formattedResponse.trim();
    
    // Perform sentiment analysis
    const sentimentAnalysis = analyzeSentiment(aiResponse, documentTypeInfo.type);
    
    // Extract key highlights in human-readable format
    const highlights = [];
    
    // Define key information patterns
    const extractPatterns = [
      {
        pattern: /(?:Price|Cost|Value)[:\s]*\$?([\d,]+)/i,
        format: (match) => `💰 Price: $${match[1]}`
      },
      {
        pattern: /(?:Mileage|Miles)[:\s]*([\d,]+)/i,
        format: (match) => `🛣️ Mileage: ${match[1]} miles`
      },
      {
        pattern: /(?:Year|Model Year)[:\s]*(\d{4})/i,
        format: (match) => `📅 Year: ${match[1]}`
      },
      {
        pattern: /(?:Make\/Model|Vehicle)[:\s]*([^.!?]+)/i,
        format: (match) => `🚗 Vehicle: ${match[1].trim()}`
      },
      {
        pattern: /\b([A-HJ-NPR-Z0-9]{17})\b/,
        format: (match) => `🔑 VIN: ${match[1]}`
      },
      {
        pattern: /(?:Contact|Call|Phone)[:\s]*([\d\s\-\(\)]+)/i,
        format: (match) => `📞 Contact: ${match[1]}`
      },
      {
        pattern: /(?:Dealer|Dealership)[:\s]*([^.!?]+)/i,
        format: (match) => `🏪 Dealer: ${match[1].trim()}`
      },
      {
        pattern: /(?:Location|Address)[:\s]*([^.!?]+)/i,
        format: (match) => `📍 Location: ${match[1].trim()}`
      }
    ];
    
    // Extract structured highlights
    extractPatterns.forEach(({ pattern, format }) => {
      const match = aiResponse.match(pattern);
      if (match && !highlights.some(h => h.includes(match[1]))) {
        highlights.push(format(match));
      }
    });
    
    // Extract important statements
    const importantStatements = [];
    
    // Look for key phrases in the response
    const keyPhrases = [
      /(?:certified pre-owned|CPO)/i,
      /(?:warranty|coverage)[^.!?]+/i,
      /(?:excellent|great|good) condition/i,
      /(?:competitive|fair|below market) price/i,
      /(?:recommend|suggest|should)[^.!?]+/i,
      /(?:next step|action)[^.!?]+/i,
      /(?:test drive|schedule|appointment)/i,
      /(?:negotiat\w+|room for)[^.!?]+/i
    ];
    
    keyPhrases.forEach(phrase => {
      const matches = aiResponse.match(new RegExp(`[^.!?]*${phrase.source}[^.!?]*[.!?]`, 'gi'));
      if (matches) {
        matches.forEach(match => {
          const cleanMatch = match.trim()
            .replace(/\*\*/g, '')
            .replace(/^[-•]\s*/, '');
          
          if (cleanMatch.length > 20 && cleanMatch.length < 200) {
            if (/certified|CPO|warranty/i.test(cleanMatch)) {
              importantStatements.push(`✅ ${cleanMatch}`);
            } else if (/recommend|suggest|should|next/i.test(cleanMatch)) {
              importantStatements.push(`💡 ${cleanMatch}`);
            } else if (/negotiat|price|competitive/i.test(cleanMatch)) {
              importantStatements.push(`💸 ${cleanMatch}`);
            } else if (/condition|excellent|features/i.test(cleanMatch)) {
              importantStatements.push(`⭐ ${cleanMatch}`);
            } else {
              importantStatements.push(`📌 ${cleanMatch}`);
            }
          }
        });
      }
    });
    
    // Add unique important statements
    importantStatements.forEach(statement => {
      if (!highlights.some(h => h.includes(statement.substring(2, 30)))) {
        highlights.push(statement);
      }
    });
    
    // Add a summary highlight if we have specific data
    if (highlights.some(h => h.includes('Price')) && highlights.some(h => h.includes('Mileage'))) {
      const priceHighlight = highlights.find(h => h.includes('Price'));
      const mileageHighlight = highlights.find(h => h.includes('Mileage'));
      
      if (priceHighlight && mileageHighlight) {
        const price = priceHighlight.match(/\$([\d,]+)/)?.[1];
        const miles = mileageHighlight.match(/([\d,]+) miles/)?.[1];
        
        if (price && miles) {
          highlights.unshift(`🎯 Quick Summary: $${price} for ${miles} miles - ${
            parseInt(miles.replace(/,/g, '')) < 50000 ? 'Low' : 
            parseInt(miles.replace(/,/g, '')) < 80000 ? 'Moderate' : 'High'
          } mileage`);
        }
      }
    }
    
    // Ensure we have at least 3 highlights
    if (highlights.length < 3) {
      // Extract first few sentences as highlights
      const sentences = aiResponse
        .split(/[.!?]+/)
        .filter(s => s.trim().length > 30)
        .slice(0, 5)
        .map(s => `📝 ${s.trim()}.`);
      
      highlights.push(...sentences);
    }
    
    // Remove duplicates and limit to 10
    const uniqueHighlights = [...new Set(highlights)];
    const topHighlights = uniqueHighlights.slice(0, 10);
    
    // Business intelligence summary
    const intelligenceSummary = {
      documentType: documentTypeInfo.type,
      documentTypeConfidence: Math.round(documentTypeInfo.confidence * 100) + '%',
      sentiment: sentimentAnalysis.sentiment,
      sentimentConfidence: Math.round(sentimentAnalysis.confidence * 100) + '%',
      businessImpact: sentimentAnalysis.businessImpact,
      totalHighlights: topHighlights.length,
      hasUrgentItems: aiResponse.toLowerCase().includes('urgent') || aiResponse.toLowerCase().includes('immediate'),
      hasFinancialInfo: /\$[\d,]+/.test(aiResponse),
      hasDeadlines: /deadline|due date|due by/i.test(aiResponse),
      requiresAction: /action|required|must|need to/i.test(aiResponse)
    };

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`🎯 Advanced highlighting completed: ${req.file.originalname}`);
    console.log(`Intelligence Summary: ${intelligenceSummary.documentType} document, ${intelligenceSummary.sentiment} sentiment`);

    res.json({
      success: true,
      message: `AI-powered analysis completed - ${intelligenceSummary.totalHighlights} critical items identified`,
      filename: `ai_highlights_${Date.now()}.json`,
      downloadUrl: null,
      aiResponse: aiResponse,
      highlights: topHighlights, // This will be displayed properly in the frontend
      highlightCount: topHighlights.length,
      intelligence: intelligenceSummary,
      insights: {
        documentType: intelligenceSummary.documentType,
        sentiment: intelligenceSummary.sentiment,
        businessImpact: intelligenceSummary.businessImpact,
        urgency: intelligenceSummary.hasUrgentItems ? 'High' : 'Normal',
        completeness: topHighlights.length > 5 ? 'Comprehensive' : 'Summary'
      }
    });

  } catch (error) {
    console.error('❌ Advanced highlighting error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to perform advanced AI highlighting',
      message: error.message
    });
  }
});

export default router; 