import Tesseract from 'tesseract.js';

/**
 * OCR is intentionally advisory. This parser only extracts text and candidate
 * integer values; it does NOT infer team identity or silently save results.
 */
export async function readScreenshot(file, onProgress = () => {}) {
  if (!file || !(/\.(jpe?g|png)$/i.test(file.name) || ['image/jpeg', 'image/png'].includes(file.type))) {
    throw new Error('รองรับเฉพาะไฟล์ JPG, JPEG และ PNG');
  }
  const result = await Tesseract.recognize(file, 'eng', {
    logger: message => {
      if (message.status === 'recognizing text') onProgress(Math.round((message.progress || 0) * 100));
    }
  });
  const text = result.data?.text?.trim() || '';
  const confidence = Number(result.data?.confidence || 0);
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const looksHard = confidence < 65 || lines.length < 2;
  return {
    text, confidence, lines,
    warning: looksHard ? 'ภาพอาจอ่านได้ไม่ชัด กรุณาตรวจทุกช่องและกรอกส่วนที่ขาดด้วยตนเอง' : '',
    candidates: lines.map(line => ({ line, numbers: (line.match(/\b\d+\b/g) || []).map(Number) }))
  };
}