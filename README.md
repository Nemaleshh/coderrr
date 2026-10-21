# CrackCoder - AI-Powered Interview Assistant & Voice Solver

A completely invisible, high-performance desktop assistant for technical interviews, coding challenges (DSA), SQL queries, aptitude MCQs, and system design questions. Built with **Electron**, **React**, **Google Gemini**, and local pre-trained **Whisper speech-to-text**.

---

## ✨ Features

- 🔒 **100% Undetectable** — Runs transparently with window-level content protection. Invisible to screen-sharing, recording, and monitoring software.
- 🎙️ **Local Voice Recognition** — Record your voice question via microphone (`⌘/Ctrl + M`). Speech is transcribed locally using an embedded pre-trained **Whisper** model (`Xenova/whisper-tiny.en`), converting speech to text with zero extra API keys.
- 📸 **Fast Screen Capture** — Capture screenshots of coding problems, MCQs, or SQL diagrams (`⌘/Ctrl + H`) without window flashing.
- 🤖 **Multi-Modal AI Reasoning** — Powered by Google Gemini with multi-key fallback handling for 99.9% uptime.
- ⚡ **Structured Solutions** — Delivers instant interview-ready explanations:
  - **Spoken Question** (when asking via microphone)
  - **Approach & Logic** (concise explanation an interviewee can speak aloud)
  - **Complete Solution Code** (syntax-highlighted and formatted)
  - **Time & Space Complexity** (Big-O analysis)
- 🌐 **Language Support** — Python, Java, C++, JavaScript, TypeScript, Go, C#, SQL, and more.
- ⚙️ **On-the-Fly Configuration** — Change programming language and API keys directly in-app (`⌘/Ctrl + P`).

---

## ⌨️ Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| `⌘/Ctrl + M` | **Voice Question** | Start / stop recording your voice. Transcribed locally and sent to Gemini. |
| `⌘/Ctrl + H` | **Screenshot** | Takes a screenshot of the question on your screen (up to 4 in queue). |
| `⌘/Ctrl + Enter` | **Get Solution** | Sends captured screenshot(s) to AI for solving. |
| `⌘/Ctrl + R` | **Reset** | Clears the queue, voice transcripts, and results to start fresh. |
| `⌘/Ctrl + B` | **Show / Hide** | Instantly toggles the overlay window visibility without losing focus. |
| `⌘/Ctrl + P` | **Settings** | Opens the configuration screen to update API key or language. |
| `⌘/Ctrl + Arrows`| **Move Window** | Repositions the overlay window around your desktop. |
| `⌘/Ctrl + Q` | **Quit** | Gracefully cleans up temp files and exits the application. |

---

## 🛠️ Installation & Setup

### Prerequisites
- **Node.js** (v18.0.0 or higher recommended)
- **npm** (v9.0.0 or higher)
- **Google Gemini API Key** ([Get a free key from Google AI Studio](https://aistudio.google.com/))

---

### Step-by-Step Installation

#### 1. Clone the repository
```bash
git clone https://github.com/Nemaleshh/coderrr.git
cd coderrr
```

#### 2. Install dependencies
```bash
npm install
```

#### 3. Set up Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Open `.env` and add your Gemini API key:
```env
# Google Gemini API Key
GEMINI_API_KEY="your-gemini-api-key-here"

# Preferred Programming Language (e.g. Python, Java, C++, JavaScript)
APP_LANGUAGE="Python"
```
*(Note: You can also configure or change the API key anytime inside the app using `⌘/Ctrl + P`.)*

#### 4. Build the Application
```bash
npm run build
```

#### 5. Launch the Application
```bash
npm start
```

For live development with auto-recompilation:
```bash
npm run dev
```

---

## 🎙️ How Voice Question Works
1. Press `⌘/Ctrl + M` or click the **🎙️ Voice** button in the action bar.
2. Speak your coding question, interview problem, or conceptual query clearly into your microphone.
3. Press `⌘/Ctrl + M` or click **Stop** when finished.
4. The local pre-trained Whisper model transcribes your speech to text and queries Gemini for the optimal solution, which is displayed directly on your screen.

---

## 📦 Project Structure

```text
├── src/
│   ├── main.ts              # Electron main process (shortcuts, window lifecycle, IPC)
│   ├── preload.ts           # Secure contextBridge IPC bridge
│   ├── renderer/            # React UI overlay
│   │   ├── App.tsx          # Main application component & voice recorder
│   │   ├── App.css          # Modern dark-glass styling & micro-animations
│   │   ├── ConfigScreen.tsx # Settings and API key manager
│   │   └── index.tsx        # React entry point
│   └── services/
│       ├── gemini.ts        # Gemini API client with multi-key / multi-model fallback
│       └── whisper.ts       # Local ONNX Whisper speech-to-text service
├── webpack.config.js        # Webpack bundle configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Scripts & dependencies
```

---

## 📄 License
MIT License. Open source and free for educational and personal use.
