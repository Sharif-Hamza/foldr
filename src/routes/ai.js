import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import upload from '../utils/multerConfig.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DeepSeek API configuration
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Helper function to call DeepSeek API
async function callDeepSeekAPI(messages, systemPrompt = '') {
  // Read API key inside function to ensure dotenv has loaded
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  
  console.log('=== AI Function Debug ===');
  console.log('DEEPSEEK_API_KEY exists:', !!DEEPSEEK_API_KEY);
  console.log('DEEPSEEK_API_KEY length:', DEEPSEEK_API_KEY ? DEEPSEEK_API_KEY.length : 'undefined');
  console.log('=========================');
  
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API key not configured');
  }

  const requestBody = {
    model: 'deepseek-chat',
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ],
    max_tokens: 4000,
    temperature: 0.7
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

// Helper function to extract text from PDF using PDF.js
async function extractPDFText(filePath) {
  try {
    // Dynamic import of PDF.js
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument(data);
    const pdf = await loadingTask.promise;
    
    console.log(`Loading PDF with ${pdf.numPages} pages from ${path.basename(filePath)}`);
    
    let fullText = '';
    
    // Extract text from all pages
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `Page ${pageNum}:\n${pageText}\n\n`;
    }
    
    console.log(`Extracted text length: ${fullText.length} characters`);
    
    if (!fullText || fullText.trim().length === 0) {
      return `PDF file "${path.basename(filePath)}" appears to be empty or contains no extractable text. This could be a scanned PDF that requires OCR processing.`;
    }
    
    return fullText;
    
  } catch (error) {
    console.error('PDF text extraction error:', error);
    return `Error extracting text from PDF "${path.basename(filePath)}": ${error.message}. The PDF may be corrupted, password-protected, or contain only images.`;
  }
}

// Chat with PDF endpoint
router.post('/chat-with-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }

    const { question = 'Please summarize this document.' } = req.body;

    console.log(`Starting PDF chat: ${req.file.originalname}`);
    console.log(`File path: ${req.file.path}`);
    console.log(`File exists: ${fs.existsSync(req.file.path)}`);
    
    // Check if file exists before processing
    if (!fs.existsSync(req.file.path)) {
      return res.status(400).json({ error: 'Uploaded file not found on server' });
    }

    // Extract text from PDF
    const pdfText = await extractPDFText(req.file.path);

    // Prepare messages for DeepSeek
    const systemPrompt = `You are an intelligent PDF document assistant. You have access to the full text content of a specific PDF document. Your role is to:

1. Answer questions directly based on the document content
2. Provide detailed, helpful responses
3. Quote specific sections when relevant
4. If asked to summarize, provide a comprehensive summary
5. If asked specific questions, focus on answering those questions precisely
6. Write in clear, natural language without markdown formatting, special characters, or JSON formatting
7. Be conversational and helpful

Always base your responses on the actual document content provided.`;
    
    const messages = [
      { 
        role: 'user', 
        content: `I have uploaded a PDF document. Here is the full text content:

${pdfText}

Now please help me with this request: ${question}

Please provide a detailed response based on the document content.` 
      }
    ];

    // Call DeepSeek API
    const aiResponse = await callDeepSeekAPI(messages, systemPrompt);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`PDF chat completed for: ${req.file.originalname}`);

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
      ]
    });

  } catch (error) {
    console.error('PDF chat error:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to chat with PDF',
      message: error.message
    });
  }
});

// Continue conversation with PDF endpoint
router.post('/continue-chat', async (req, res) => {
  try {
    const { message, chatHistory, pdfText } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }

    if (!pdfText) {
      return res.status(400).json({ error: 'No PDF text context provided' });
    }

    console.log(`Continuing PDF chat conversation`);

    // Prepare messages for DeepSeek with chat history
    const systemPrompt = `You are an intelligent PDF document assistant. You have access to the full text content of a specific PDF document. Your role is to:

1. Answer questions directly based on the document content
2. Provide detailed, helpful responses
3. Quote specific sections when relevant
4. Maintain context from previous conversation
5. Write in clear, natural language without markdown formatting, special characters, or JSON formatting
6. Be conversational and helpful

Always base your responses on the actual document content provided.`;
    
    const messages = [
      { 
        role: 'system', 
        content: `PDF Document Content:\n\n${pdfText}` 
      },
      ...(chatHistory || []),
      { 
        role: 'user', 
        content: message 
      }
    ];

    // Call DeepSeek API
    const aiResponse = await callDeepSeekAPI(messages.slice(1), systemPrompt); // Remove system message for API call

    console.log(`PDF chat conversation continued`);

    res.json({
      success: true,
      message: 'AI response generated successfully',
      aiResponse: aiResponse,
      userMessage: message
    });

  } catch (error) {
    console.error('PDF chat continuation error:', error);
    
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
    console.log(`File path: ${req.file.path}`);
    console.log(`File exists: ${fs.existsSync(req.file.path)}`);
    
    // Check if file exists before processing
    if (!fs.existsSync(req.file.path)) {
      return res.status(400).json({ error: 'Uploaded file not found on server' });
    }

    // Extract text from PDF
    const pdfText = await extractPDFText(req.file.path);

    // Advanced AI system prompt for intelligent summarization
    const systemPrompt = `You are an advanced AI document intelligence expert specializing in comprehensive content analysis and summarization. Your expertise includes:

**📊 ANALYTICAL CAPABILITIES:**
- Multi-layered content analysis (executive, technical, operational levels)
- Key insight extraction and pattern recognition
- Context-aware importance weighting
- Stakeholder perspective consideration
- Action-oriented conclusion synthesis

**🎯 SUMMARIZATION EXCELLENCE:**
- Executive summary with strategic insights
- Key findings with supporting evidence
- Important data points and metrics
- Action items and recommendations
- Risk factors and opportunities
- Future implications and next steps

**📝 PRESENTATION STANDARDS:**
- Clear, professional language without technical jargon
- Logical flow from high-level overview to specific details
- No markdown formatting, special characters, or code blocks
- Natural paragraph structure with smooth transitions
- Emphasis on practical value and business relevance

Provide a comprehensive yet concise summary that captures both the content and its significance for decision-making.`;
    
    const messages = [
      { 
        role: 'user', 
        content: `Perform advanced AI-powered analysis and create a comprehensive summary of this document. I need an intelligent analysis that includes:

🎯 EXECUTIVE OVERVIEW:
- What is this document about and why is it important?
- What are the key messages and main purposes?
- Who are the intended audiences and stakeholders?

📊 KEY FINDINGS & INSIGHTS:
- Most important data, facts, and conclusions
- Significant trends, patterns, or anomalies
- Critical numbers, percentages, and metrics
- Comparative analysis and benchmarking

💼 BUSINESS IMPACT:
- Strategic implications and business significance
- Opportunities, risks, and challenges identified
- Financial impact and resource requirements
- Competitive advantages or disadvantages

📋 ACTION INTELLIGENCE:
- Recommended next steps and action items
- Decision points requiring attention
- Timeline considerations and deadlines
- Required approvals or stakeholder involvement

⚠️ CRITICAL ALERTS:
- Urgent issues requiring immediate attention
- Compliance requirements and regulations
- Potential risks and mitigation strategies
- Important deadlines and time constraints

Document content:
${pdfText}

Provide a well-structured, professional summary that helps readers quickly understand both what the document contains and what actions or decisions might be needed based on its content.` 
      }
    ];

    // Call DeepSeek API for advanced analysis
    const aiSummary = await callDeepSeekAPI(messages, systemPrompt);

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

    // Advanced AI system prompt for intelligent highlighting
    const systemPrompt = `You are an advanced AI document intelligence specialist with expertise in critical information extraction. Your analysis capabilities include:

**🔍 CRITICAL DATA DETECTION:**
- Dates, deadlines, and time-sensitive information
- Financial amounts, payment terms, and monetary values
- Names, contacts, addresses, and entity information
- Legal clauses, terms, conditions, and obligations
- Action items, requirements, and next steps
- Warnings, restrictions, penalties, and consequences
- Performance metrics, KPIs, and benchmarks

**📊 INTELLIGENT ANALYSIS:**
- Context evaluation and importance ranking
- Risk assessment and compliance indicators
- Relationship mapping between different elements
- Impact analysis and business implications
- Urgency and priority classification

**💡 STRATEGIC INSIGHTS:**
- Decision support information
- Critical success factors
- Potential issues or red flags
- Opportunities and advantages

Provide specific, actionable findings with exact details extracted from the document. No generic responses or placeholder data.`;
    
    const messages = [
      { 
        role: 'user', 
        content: `Perform advanced AI-powered analysis to identify and extract the most critical information from this document. I need you to act as an intelligent document scanner that finds:

🔥 **IMMEDIATE PRIORITIES:**
- Deadlines, due dates, expiration dates
- Payment amounts, fees, penalties
- Action items requiring immediate attention
- Contact information for key people

💰 **FINANCIAL INTELLIGENCE:**
- All monetary amounts and their context
- Payment terms, conditions, and schedules
- Cost breakdowns and pricing structures
- Financial obligations and liabilities

📅 **TIME-CRITICAL INFORMATION:**
- All dates and their significance
- Timelines, schedules, and milestones
- Renewal dates and contract terms
- Event dates and important meetings

👥 **KEY STAKEHOLDERS:**
- Names, titles, and contact information
- Roles, responsibilities, and authority levels
- Decision makers and approval requirements
- External partners and vendors

⚠️ **RISKS & COMPLIANCE:**
- Penalties, consequences, and violations
- Compliance requirements and regulations
- Restrictions, limitations, and prohibitions
- Warning signs and red flags

📋 **ACTION ITEMS:**
- Required tasks and deliverables
- Approval processes and workflows
- Documentation and reporting requirements
- Next steps and follow-up actions

Document content:
${pdfText}

Provide detailed findings with specific extracted information, page references, and explain the business importance of each highlighted item. Focus on actionable intelligence that someone would need to act on or be aware of.` 
      }
    ];

    // Call DeepSeek API for advanced analysis
    const aiResponse = await callDeepSeekAPI(messages, systemPrompt);

    // Advanced parsing to extract structured highlights from AI response
    const extractedHighlights = [];
    
    // Extract dates
    const dateMatches = aiResponse.match(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/gi);
    if (dateMatches) {
      dateMatches.slice(0, 5).forEach((date, index) => {
        extractedHighlights.push({
          id: `date_${index}`,
          text: date,
          type: 'date',
          importance: 'high',
          category: 'Time-Critical'
        });
      });
    }

    // Extract monetary amounts
    const moneyMatches = aiResponse.match(/\$[\d,]+(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|usd|euros?|pounds?|\$|€|£)\b/gi);
    if (moneyMatches) {
      moneyMatches.slice(0, 5).forEach((amount, index) => {
        extractedHighlights.push({
          id: `money_${index}`,
          text: amount,
          type: 'financial',
          importance: 'high',
          category: 'Financial'
        });
      });
    }

    // Extract names (capitalized words that could be names)
    const nameMatches = aiResponse.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g);
    if (nameMatches) {
      nameMatches.slice(0, 3).forEach((name, index) => {
        extractedHighlights.push({
          id: `name_${index}`,
          text: name,
          type: 'contact',
          importance: 'medium',
          category: 'Stakeholders'
        });
      });
    }

    // Extract phone numbers
    const phoneMatches = aiResponse.match(/\b\d{3}[.\-\s]?\d{3}[.\-\s]?\d{4}\b/g);
    if (phoneMatches) {
      phoneMatches.slice(0, 3).forEach((phone, index) => {
        extractedHighlights.push({
          id: `phone_${index}`,
          text: phone,
          type: 'contact',
          importance: 'medium',
          category: 'Contact Information'
        });
      });
    }

    // Extract email addresses
    const emailMatches = aiResponse.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
    if (emailMatches) {
      emailMatches.slice(0, 3).forEach((email, index) => {
        extractedHighlights.push({
          id: `email_${index}`,
          text: email,
          type: 'contact',
          importance: 'medium',
          category: 'Contact Information'
        });
      });
    }

    // Generate intelligent summary
    const intelligentSummary = {
      totalHighlights: extractedHighlights.length,
      criticalItems: extractedHighlights.filter(h => h.importance === 'high').length,
      categories: [...new Set(extractedHighlights.map(h => h.category))],
      riskLevel: aiResponse.toLowerCase().includes('penalty') || aiResponse.toLowerCase().includes('deadline') ? 'High' : 'Medium',
      actionRequired: aiResponse.toLowerCase().includes('action') || aiResponse.toLowerCase().includes('required'),
      hasFinancialInfo: moneyMatches && moneyMatches.length > 0,
      hasContactInfo: (nameMatches && nameMatches.length > 0) || (phoneMatches && phoneMatches.length > 0),
      hasTimeElements: dateMatches && dateMatches.length > 0
    };

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log(`🎯 Advanced highlighting completed: ${req.file.originalname}`);
    console.log(`Intelligence Summary: ${intelligentSummary.totalHighlights} highlights, ${intelligentSummary.riskLevel} risk level`);

    res.json({
      success: true,
      message: `AI-powered analysis completed - ${intelligentSummary.totalHighlights} critical items identified`,
      filename: `ai_highlights_${Date.now()}.json`,
      downloadUrl: null,
      aiResponse: aiResponse,
      highlights: extractedHighlights,
      highlightCount: extractedHighlights.length,
      intelligence: intelligentSummary,
      insights: {
        riskLevel: intelligentSummary.riskLevel,
        actionRequired: intelligentSummary.actionRequired,
        hasFinancialInfo: intelligentSummary.hasFinancialInfo,
        hasContactInfo: intelligentSummary.hasContactInfo,
        hasTimeElements: intelligentSummary.hasTimeElements,
        categories: intelligentSummary.categories
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