const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiter storage (in production, gunakan Redis atau database)
const rateLimiter = new Map();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000', // hanya izinkan frontend lokal saat dev
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true, // kalau kamu pakai cookie atau auth
}));
app.use(express.json());
app.use(express.static('public'));

// Rate limiter middleware
function checkRateLimit(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  const now = Date.now();
  const cooldownPeriod = 60 * 1000; // 1 menit
  
  if (rateLimiter.has(clientIP)) {
    const clientData = rateLimiter.get(clientIP);
    const timeDiff = now - clientData.lastRequest;
    
    // Jika masih dalam cooldown
    if (timeDiff < cooldownPeriod) {
      const remainingTime = Math.ceil((cooldownPeriod - timeDiff) / 1000);
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        remainingTime: remainingTime,
        count: clientData.count
      });
    }
    
    // Reset count jika sudah lewat cooldown
    if (timeDiff >= cooldownPeriod) {
      clientData.count = 0;
    }
  }
  
  // Update rate limiter data
  const clientData = rateLimiter.get(clientIP) || { count: 0, lastRequest: 0 };
  clientData.count += 1;
  clientData.lastRequest = now;
  rateLimiter.set(clientIP, clientData);
  
  // Check jika sudah mencapai batas 3 kali
  if (clientData.count > 3) {
    const remainingTime = Math.ceil(cooldownPeriod / 1000);
    return res.status(429).json({ 
      error: 'Maximum attempts reached',
      remainingTime: remainingTime,
      count: clientData.count
    });
  }
  
  next();
}

// Route untuk generate dialog JLPT Choukai style
app.post('/api/generate-choukai', checkRateLimit, async (req, res) => {
  try {
    const { topic } = req.body;
    const prompt = `Buatlah soal listening (Choukai) JLPT Level N4-N3 sesuai dengan gaya soal JLPT asli.

Buatkan satu soal JLPT Choukai dengan struktur dan format JSON berikut:

Topik: "${topic}"

Format response JSON:
{
  "dialog": [
    {"speaker": "ナレーション", "text": "男の人は女の人と話しています。", "translation": "Laki-laki sedang berbicara dengan perempuan."},
    {"speaker": "男の人", "text": "こんにちは", "translation": "Halo"},
    {"speaker": "女の人", "text": "こんにちは", "translation": "Halo"}
  ],
  "question": {
    "context": "Situasi singkat dialog",
    "instruction": "Pertanyaan yang sesuai dengan isi percakapan (dalam gaya JLPT)",
    "options": ["Pilihan A dalam bahasa Jepang", "Pilihan B", "Pilihan C", "Pilihan D"],
    "correct": "A"
  }
}

Petunjuk pembuatan:
- Dialog harus diawali dengan satu baris narasi menggunakan speaker 'ナレーション' dengan teks: 男の人は女の人と話しています。
- Total dialog 4 sampai 6 baris termasuk narasi
- Kosakata dalam dialog harus berada pada level JLPT N4–N3
- Gunakan '男の人' dan '女の人' sebagai speaker setelah narasi
- Gaya bahasa harus casual-futsukei dengan bentuk desu/masu; hindari keigo atau bahasa yang terlalu formal
- Pertanyaan tidak terbatas pada 'nani wo shimasu ka'; bisa menanyakan maksud, sikap, tindakan selanjutnya, atau interpretasi
- Empat pilihan jawaban ditulis dalam bahasa Jepang, hanya satu jawaban benar
- Output harus hanya JSON seperti format di atas, tanpa penjelasan tambahan apa pun
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    const generatedText = data.candidates[0].content.parts[0].text;
    
    // Parse JSON dari response Gemini
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const chockaiData = JSON.parse(jsonMatch[0]);
      res.json(chockaiData);
    } else {
      throw new Error('Format response tidak valid');
    }
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Gagal generate dialog choukai' });
  }
});

// Route untuk check jawaban dan analisis
app.post('/api/check-answer', async (req, res) => {
  try {
    const { dialog, question, userAnswer } = req.body;
    
    const prompt = `Analisis jawaban user untuk soal JLPT Choukai berikut:

Dialog: ${JSON.stringify(dialog)}
Pertanyaan: ${question.instruction}
Pilihan jawaban: ${question.options.join(', ')}
Jawaban user: ${userAnswer}
Jawaban benar: ${question.correct}

Berikan analisis dalam bahasa Indonesia yang menjelaskan:
1. Mengapa jawaban ini benar?
2. Apa yang terjadi dalam dialog step by step
3. Vocabulary atau grammar penting yang digunakan

Format response sebagai teks biasa, tidak perlu JSON.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    let analysis = data.candidates[0].content.parts[0].text;
    
    // Fungsi parsing untuk membersihkan simbol yang mengganggu
    analysis = analysis
      .replace(/[*_\-;]/g, '') // Hapus simbol *, _, -, ;
      .replace(/`/g, '')       // Hapus backticks
      .replace(/\n\s*\n/g, '\n') // Hapus baris kosong berlebih
      .trim();
    
    res.json({ analysis });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Gagal menganalisis jawaban' });
  }
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});