import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import * as googleTTS from "google-tts-api";
import multer from "multer";

const upload = multer();
const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "static")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "templates", "index.html"));
});

const handleSpeak = async (req, res) => {
  try {
    const text = req.body?.text || req.query?.text;
    let lang = req.body?.lang || req.query?.lang || "en";
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).send("Text is required");
    }

    const trimmedText = text.trim();
    let audioBuffer;

    // Normalize lang code for googleTTS
    let langCode = lang.trim();
    if (langCode.toLowerCase().startsWith("zh-cn") || langCode.toLowerCase().startsWith("zh")) {
      langCode = "zh-CN";
    } else if (langCode.toLowerCase().startsWith("zh-tw")) {
      langCode = "zh-TW";
    } else if (langCode.includes("-")) {
      langCode = langCode.split("-")[0];
    }

    if (trimmedText.length <= 200) {
      const base64 = await googleTTS.getAudioBase64(trimmedText, {
        lang: langCode,
        slow: false,
        host: "https://translate.google.com",
        timeout: 10000,
      });
      audioBuffer = Buffer.from(base64, "base64");
    } else {
      const results = await googleTTS.getAllAudioBase64(trimmedText, {
        lang: langCode,
        slow: false,
        host: "https://translate.google.com",
        timeout: 10000,
      });
      const buffers = results.map((item) => Buffer.from(item.base64, "base64"));
      audioBuffer = Buffer.concat(buffers);
    }

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "Accept-Ranges": "bytes",
    });
    return res.send(audioBuffer);
  } catch (err) {
    console.error("Error generating TTS:", err);
    return res.status(500).send("Failed to generate speech");
  }
};

app.get("/speak", handleSpeak);
app.post("/speak", upload.none(), handleSpeak);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
