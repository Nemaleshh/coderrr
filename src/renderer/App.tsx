import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import ConfigScreen from './ConfigScreen';

interface Screenshot {
  id: number;
  preview: string;
  path: string;
}

interface ProcessedSolution {
  approach: string;
  code: string;
  timeComplexity: string;
  spaceComplexity: string;
  error?: string; // error field from main process error path
  userPrompt?: string; // spoken question text if voice was used
}

interface Config {
  apiKey: string;
  language: string;
}

declare global {
  interface Window {
    electron: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      quit: () => void;
      takeScreenshot: () => Promise<void>;
      processScreenshots: (complexity?: string) => Promise<void>;
      processVoice: (data: { text?: string; audioBase64?: string; mimeType?: string; complexity?: string }) => Promise<any>;
      resetQueue: () => Promise<void>;
      getConfig: () => Promise<Config | null>;
      saveConfig: (config: Config) => Promise<boolean>;
      onProcessingComplete: (callback: (result: string) => void) => void;
      onScreenshotTaken: (callback: (data: Screenshot) => void) => void;
      onProcessingStarted: (callback: () => void) => void;
      onQueueReset: (callback: () => void) => void;
      onShowConfig: (callback: () => void) => void;
      onToggleVoiceRecording: (callback: () => void) => void;
      removeListener: (channel: string) => void;
    };
  }
}

const MAX_SCREENSHOTS = 4;

const App: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessedSolution | null>(null);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [complexity, setComplexity] = useState<'brute' | 'medium' | 'optimal'>('optimal');

  // ── Voice Recording State & Refs ──────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [speechTranscript, setSpeechTranscript] = useState('');

  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);
  const speechTranscriptRef = useRef('');

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // ── Load config on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const savedConfig = await window.electron.getConfig();
        setConfig(savedConfig);
        if (!savedConfig) {
          setShowConfig(true);
        }
      } catch (err: any) {
        console.error('Error loading config:', err);
        setError('Failed to load configuration');
        setShowConfig(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  // ── Voice Recording Actions ───────────────────────────────────────────────
  const startRecording = async () => {
    if (isProcessing) return;
    try {
      setError(null);
      setSpeechTranscript('');
      speechTranscriptRef.current = '';
      setRecordingDuration(0);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // Setup MediaRecorder
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Setup SpeechRecognition for real-time speech-to-text if available
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          recognition.onresult = (event: any) => {
            let transcriptText = '';
            for (let i = 0; i < event.results.length; i++) {
              transcriptText += event.results[i][0].transcript + ' ';
            }
            const cleanText = transcriptText.trim();
            setSpeechTranscript(cleanText);
            speechTranscriptRef.current = cleanText;
          };

          recognition.onerror = (event: any) => {
            console.warn('SpeechRecognition info/event:', event?.error);
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (recErr) {
          console.warn('SpeechRecognition setup error:', recErr);
        }
      }

      mediaRecorder.start(250);
      setIsRecording(true);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Error starting audio recording:', err);
      setError('Microphone access denied or unavailable: ' + (err?.message || err));
    }
  };

  const stopRecordingAndSend = () => {
    if (!isRecordingRef.current) return;
    setIsRecording(false);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Stop speech recognition
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
      speechRecognitionRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const capturedText = speechTranscriptRef.current;

        // Clean up audio tracks
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(t => t.stop());
          audioStreamRef.current = null;
        }

        // Convert Blob to Base64 for Gemini audio fallback
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          try {
            const base64Data = (reader.result as string)?.split(',')[1] || '';
            setIsProcessing(true);
            setResult(null);
            setError(null);

            // NOTE: Do NOT send audioSamples (PCM Float32 array) over IPC —
            // 80,000+ numbers crash the Electron IPC channel. Send text + base64 only.
            await window.electron.processVoice({
              text: capturedText,
              audioBase64: base64Data,
              mimeType: mimeType,
              complexity: complexity,
            });
          } catch (processErr: any) {
            console.error('Error sending voice to main process:', processErr);
            setError(processErr?.message || 'Error processing voice');
            setIsProcessing(false);
          }
        };
      };

      recorder.stop();
    } else {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      }
    }
  };

  const handleToggleVoice = () => {
    if (isRecordingRef.current) {
      stopRecordingAndSend();
    } else {
      startRecording();
    }
  };

  // ── Register IPC & keyboard listeners ────────────────────────────────────
  useEffect(() => {
    console.log('Setting up event listeners...');

    // Show config toggle
    window.electron.onShowConfig(() => {
      setShowConfig(prev => !prev);
    });

    // Voice recording toggle from global shortcut
    window.electron.onToggleVoiceRecording(() => {
      handleToggleVoice();
    });

    // Processing started
    window.electron.onProcessingStarted(() => {
      console.log('Processing started');
      setIsProcessing(true);
      setResult(null);
      setError(null);
    });

    // Processing complete
    window.electron.onProcessingComplete((resultStr) => {
      console.log('Processing complete. Result:', resultStr);
      setIsProcessing(false);
      try {
        if (!resultStr || resultStr.trim() === '') {
          setError('Received empty response from AI');
          return;
        }
        const parsedResult = JSON.parse(resultStr) as ProcessedSolution;

        // Surface any error returned by the main process
        if (parsedResult.error) {
          setError(parsedResult.error);
          setResult(null);
          return;
        }

        setResult(parsedResult);
      } catch (parseErr) {
        console.error('Error parsing result:', parseErr);
        setError('Failed to parse AI response. Please try again.');
      }
    });

    // New screenshot taken
    window.electron.onScreenshotTaken((screenshot) => {
      console.log('New screenshot taken:', screenshot.id);
      setScreenshots(prev => {
        if (prev.length >= MAX_SCREENSHOTS) return prev; // guard
        return [...prev, screenshot];
      });
    });

    // Queue reset
    window.electron.onQueueReset(() => {
      console.log('Queue reset triggered');
      setScreenshots([]);
      setResult(null);
      setError(null);
      setSpeechTranscript('');
    });

    // Keyboard shortcuts (renderer-side, complementing global shortcuts)
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Ignore if focus is inside an input/select to allow normal typing
      const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      const isCmdOrCtrl = event.metaKey || event.ctrlKey;

      switch (event.key.toLowerCase()) {
        case 'h':
          if (isCmdOrCtrl) {
            event.preventDefault();
            await handleTakeScreenshot();
          }
          break;
        case 'm':
          if (isCmdOrCtrl) {
            event.preventDefault();
            handleToggleVoice();
          }
          break;
        case 'enter':
          if (isCmdOrCtrl) {
            event.preventDefault();
            await handleProcess();
          }
          break;
        case 'r':
          if (isCmdOrCtrl) {
            event.preventDefault();
            await handleReset();
          }
          break;
        case 'p':
          if (isCmdOrCtrl) {
            event.preventDefault();
            setShowConfig(prev => !prev);
          }
          break;
        case 'q':
          if (isCmdOrCtrl) {
            event.preventDefault();
            handleQuit();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      console.log('Cleaning up event listeners...');
      window.removeEventListener('keydown', handleKeyDown);
      window.electron.removeListener('processing-complete');
      window.electron.removeListener('processing-started');
      window.electron.removeListener('screenshot-taken');
      window.electron.removeListener('queue-reset');
      window.electron.removeListener('show-config');
      window.electron.removeListener('toggle-voice-recording');

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []); // Empty deps — handlers reference stable electron APIs

  // ── Auto-dismiss error after 12 seconds or on interaction ───────────────
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 12000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // ── Action handlers ───────────────────────────────────────────────────────
  const handleTakeScreenshot = async () => {
    if (screenshots.length >= MAX_SCREENSHOTS) {
      setError(`Maximum of ${MAX_SCREENSHOTS} screenshots reached. Reset to take more.`);
      return;
    }
    try {
      await window.electron.takeScreenshot();
    } catch (err: any) {
      console.error('Error taking screenshot:', err);
      setError(err?.message || 'Error taking screenshot');
    }
  };

  const handleProcess = async (overrideComplexity?: 'brute' | 'medium' | 'optimal') => {
    if (screenshots.length === 0) {
      setError('Take at least one screenshot first (Ctrl+H) or use Voice Question (Ctrl+M)');
      return;
    }
    if (isProcessing) return;
    const level = overrideComplexity || complexity;
    setIsProcessing(true);
    setResult(null);
    setError(null);
    try {
      await window.electron.processScreenshots(level);
    } catch (err: any) {
      console.error('Error processing screenshots:', err);
      setError(err?.message || 'Error processing screenshots');
      setIsProcessing(false);
    }
  };

  const handleReset = async () => {
    try {
      if (isRecordingRef.current) {
        setIsRecording(false);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(t => t.stop());
      }
      setSpeechTranscript('');
      setError(null);
      await window.electron.resetQueue();
    } catch (err: any) {
      console.error('Error resetting queue:', err);
      setError(err?.message || 'Error resetting queue');
    }
  };

  const handleQuit = () => {
    window.electron.quit();
  };

  const handleConfigSave = async (newConfig: Config) => {
    try {
      const success = await window.electron.saveConfig(newConfig);
      if (success) {
        setConfig(newConfig);
        setShowConfig(false);
        setError(null);
      } else {
        setError('Failed to save configuration. Please check your API key.');
      }
    } catch (err: any) {
      console.error('Error saving configuration:', err);
      setError(err?.message || 'Error saving configuration');
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  /**
   * Safely format code into numbered lines.
   */
  const formatCode = (code: string | undefined | null) => {
    if (!code || code.trim() === '') return null;
    return code.split('\n').map((line, index) => (
      <div key={index} className="code-line">
        <span className="line-number">{index + 1}</span>
        <span className="code-text">{line}</span>
      </div>
    ));
  };

  const getScreenDescription = (): string => {
    if (isLoading) return 'Loading configuration…';
    if (showConfig) return 'Configuration panel is open';
    if (isRecording) return `Recording voice question: ${formatDuration(recordingDuration)}`;
    if (isProcessing) return `Processing question with AI…`;
    if (error) return `Error: ${error}`;
    if (result) {
      if (result.error) return `Error: ${result.error}`;
      return `Solution ready — Approach: ${result.approach?.substring(0, 60)}…`;
    }
    if (screenshots.length > 0) return `${screenshots.length} screenshot${screenshots.length !== 1 ? 's' : ''} captured — ready to process`;
    return 'Ready — Press Ctrl+H for screenshot or Ctrl+M for voice';
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="app">
        <div className="status-row">
          <div className="empty-status">Loading…</div>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="app" role="main" aria-label={getScreenDescription()}>
      {/* Screen reader description */}
      <span className="sr-only" aria-live="polite">{getScreenDescription()}</span>

      {/* Error banner */}
      {error && result && (
        <div className="error-bar" role="alert">
          <span className="error-bar-text">⚠️ {error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error">&times;</button>
        </div>
      )}

      {/* Config overlay */}
      {showConfig && (
        <ConfigScreen
          onSave={handleConfigSave}
          initialConfig={config || undefined}
          onClose={() => setShowConfig(false)}
        />
      )}

      {/* Complexity Selector */}
      <div className="complexity-selector" role="group" aria-label="Solution complexity">
        <span className="complexity-label">Mode:</span>
        <button
          id="btn-brute"
          className={`complexity-btn brute-btn ${complexity === 'brute' ? 'active' : ''}`}
          onClick={() => setComplexity('brute')}
          title="Brute Force — simple nested loops, no optimisation"
          type="button"
        >
          🔴 Brute
        </button>
        <button
          id="btn-medium"
          className={`complexity-btn medium-btn ${complexity === 'medium' ? 'active' : ''}`}
          onClick={() => setComplexity('medium')}
          title="Medium — hash maps, sorting, two pointers"
          type="button"
        >
          🟡 Medium
        </button>
        <button
          id="btn-optimal"
          className={`complexity-btn optimal-btn ${complexity === 'optimal' ? 'active' : ''}`}
          onClick={() => setComplexity('optimal')}
          title="Optimal — best possible time & space complexity"
          type="button"
        >
          🟢 Optimal
        </button>
      </div>

      {/* Shortcuts & Action Row */}
      <div className="shortcuts-row">
        <div className="shortcut"><code>⌘/Ctrl + H</code> Screenshot</div>
        <div className="shortcut"><code>⌘/Ctrl + ↵</code> Solution</div>
        
        {/* Voice Recording Button */}
        <button
          className={`voice-record-btn ${isRecording ? 'recording' : ''}`}
          onClick={handleToggleVoice}
          title={isRecording ? "Stop recording and get answer (⌘/Ctrl + M)" : "Record voice question (⌘/Ctrl + M)"}
          type="button"
        >
          <span className="voice-mic-icon">{isRecording ? '⏹' : '🎙️'}</span>
          <span className="voice-btn-text">
            {isRecording ? `Stop (${formatDuration(recordingDuration)})` : 'Voice'}
          </span>
          <code>⌘/Ctrl + M</code>
        </button>

        <div className="shortcut"><code>⌘/Ctrl + R</code> Reset</div>

        <div className="hover-shortcuts">
          <div className="hover-shortcuts-content">
            <div className="shortcut"><code>⌘/Ctrl + M</code> Voice Question</div>
            <div className="shortcut"><code>⌘/Ctrl + B</code> Show/Hide</div>
            <div className="shortcut"><code>⌘/Ctrl + P</code> Settings</div>
            <div className="shortcut"><code>⌘/Ctrl + Q</code> Quit</div>
            <div className="shortcut"><code>⌘/Ctrl + Arrow Keys</code> Move Around</div>
          </div>
        </div>
      </div>

      {/* Live Voice Recording Banner */}
      {isRecording && (
        <div className="voice-recording-banner" role="status" aria-live="assertive">
          <div className="voice-banner-header">
            <div className="voice-recording-indicator">
              <span className="voice-pulse-dot"></span>
              <span className="voice-status-text">
                Listening… ({formatDuration(recordingDuration)})
              </span>
            </div>
            <button className="voice-finish-btn" onClick={handleToggleVoice}>
              ⏹ Send to AI
            </button>
          </div>
          {speechTranscript ? (
            <div className="voice-live-transcript">
              &ldquo;{speechTranscript}&rdquo;
            </div>
          ) : (
            <div className="voice-live-transcript voice-transcript-placeholder">
              Speak your question or interview problem clearly…
            </div>
          )}
        </div>
      )}

      {/* Screenshot Previews */}
      <div className="preview-row" aria-label={`${screenshots.length} of ${MAX_SCREENSHOTS} screenshots`}>
        {screenshots.length === 0 ? (
          <div className="empty-status preview-hint">No screenshots yet (optional with voice)</div>
        ) : (
          screenshots.map(screenshot => (
            <div key={screenshot.id} className="preview-item" title={`Screenshot ${screenshot.id}`}>
              <img src={screenshot.preview} alt={`Screenshot ${screenshots.indexOf(screenshot) + 1}`} loading="lazy" />
              <div className="preview-badge">{screenshots.indexOf(screenshot) + 1}</div>
            </div>
          ))
        )}
        {/* Placeholder slots */}
        {Array.from({ length: MAX_SCREENSHOTS - screenshots.length }).map((_, i) => (
          <div key={`empty-${i}`} className="preview-item preview-empty" aria-hidden="true">
            <span className="preview-empty-icon">+</span>
          </div>
        ))}
      </div>

      {/* Status / Result Row */}
      <div className="status-row">
        {isProcessing ? (
          <div className="processing" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true"></div>
            Analysing question with AI…
          </div>
        ) : error ? (
          <div className="status-error-card" role="alert">
            <div className="status-error-header">
              <span className="status-error-badge">⚠️ Processing Error</span>
              <button 
                className="status-error-dismiss" 
                onClick={() => setError(null)} 
                title="Dismiss error"
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
            <p className="status-error-message">{error}</p>
            <div className="status-error-actions">
              <button className="status-error-btn retry-btn" onClick={() => handleProcess()}>
                ↻ Retry (⌘/Ctrl + ↵)
              </button>
              <button className="status-error-btn reset-btn" onClick={handleReset}>
                ✕ Reset (⌘/Ctrl + R)
              </button>
            </div>
          </div>
        ) : result ? (
          <div className="result">
            {/* Spoken Question (if available) */}
            {result.userPrompt && (
              <div className="solution-section voice-prompt-section">
                <h3>🎙️ Spoken Question</h3>
                <p className="voice-prompt-text">&ldquo;{result.userPrompt}&rdquo;</p>
              </div>
            )}

            {/* Approach */}
            <div className="solution-section">
              <h3>📋 Approach / Answer</h3>
              <p>{result.approach || 'No approach provided'}</p>
            </div>

            {/* Code — only shown when non-empty */}
            {result.code && result.code.trim() !== '' && (
              <div className="solution-section">
                <h3>💻 Solution Code</h3>
                <pre aria-label="Code solution">
                  {formatCode(result.code)}
                </pre>
              </div>
            )}

            {/* Complexity — only shown when not N/A */}
            {(result.timeComplexity !== 'N/A' || result.spaceComplexity !== 'N/A') && (
              <div className="solution-section complexity-section">
                <h3>⚡ Complexity</h3>
                <p>Time: <strong>{result.timeComplexity}</strong></p>
                <p>Space: <strong>{result.spaceComplexity}</strong></p>
              </div>
            )}

            <div className="hint">(Press ⌘/Ctrl + R to reset, or ⌘/Ctrl + M to ask another voice question)</div>
          </div>
        ) : (
          <div className="empty-status">
            {screenshots.length > 0
              ? `✅ ${screenshots.length}/${MAX_SCREENSHOTS} screenshots — Press ⌘/Ctrl + ↵ to get solution`
              : '📸 Press ⌘/Ctrl + H for screenshot or 🎙️ ⌘/Ctrl + M to ask via voice'}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;