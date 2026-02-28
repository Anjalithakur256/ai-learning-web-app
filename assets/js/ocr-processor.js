/**
 * OCR Processing Module
 * Extracts text from homework images using Tesseract.js
 * Tesseract.js is client-side, no server dependency needed
 */

// Dynamic import of Tesseract.js
let Tesseract = null;

const loadTesseract = async () => {
  if (Tesseract) return Tesseract;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5";
    script.onload = () => {
      Tesseract = window.Tesseract;
      resolve(Tesseract);
    };
    script.onerror = () => {
      reject(new Error("Failed to load Tesseract.js"));
    };
    document.head.appendChild(script);
  });
};

/**
 * Extract text from image using OCR
 */
export async function extractTextFromImage(imageData) {
  if (!imageData) {
    throw new Error("Image data is required");
  }

  try {
    // Load Tesseract if not already loaded
    const TesseractModule = await loadTesseract();

    // Extract image data
    let imagePath = imageData;

    // If it's a base64 string, use directly
    if (typeof imageData === "string" && imageData.startsWith("data:")) {
      imagePath = imageData;
    }

    // Run OCR
    const {
      data: { text },
    } = await TesseractModule.recognize(imagePath, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(`OCR Progress: ${(m.progress * 100).toFixed(1)}%`);
        }
      },
    });

    return {
      success: true,
      text: text.trim(),
      confidence: 0.85, // Placeholder; Tesseract can provide actual confidence
    };
  } catch (error) {
    console.error("OCR Error:", error);
    return {
      success: false,
      text: "",
      error: error.message,
    };
  }
}

/**
 * Validate and clean OCR text
 */
export function cleanOCRText(rawText) {
  if (!rawText) return "";

  return rawText
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/([.?!])\s+/g, "$1\n") // Add line breaks after sentences
    .trim();
}

/**
 * Detect problem type from OCR text
 */
export function detectProblemType(text) {
  const types = {
    math: ["∑", "∫", "√", "π", "=", "+", "-", "×", "÷", "^"],
    physics: ["v =", "F =", "E =", "λ =", "m/s", "kg", "J"],
    chemistry: ["H₂", "O₂", "CO₂", "mol", "g/mol", "reaction"],
    programming: ["def", "class", "function", "if", "for", "return", "var"],
  };

  const lowerText = text.toLowerCase();

  for (const [type, keywords] of Object.entries(types)) {
    if (keywords.some((kw) => text.includes(kw) || lowerText.includes(kw))) {
      return type;
    }
  }

  return "general";
}

/**
 * Format homework problem for AI processing
 */
export function formatHomeworkProblem(ocrText, problemType = "general") {
  const cleaned = cleanOCRText(ocrText);

  return {
    originalText: ocrText,
    cleanedText: cleaned,
    problemType: problemType,
    charCount: cleaned.length,
    wordCount: cleaned.split(/\s+/).length,
    formatted: `[HOMEWORK PROBLEM - ${problemType.toUpperCase()}]\n${cleaned}`,
  };
}

export default {
  extractTextFromImage,
  cleanOCRText,
  detectProblemType,
  formatHomeworkProblem,
};
