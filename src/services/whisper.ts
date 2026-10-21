import { pipeline } from '@xenova/transformers';

let transcriber: any = null;
let isInitializing = false;

/**
 * Initializes and caches the local Whisper pre-trained model.
 * Uses Xenova/whisper-tiny.en (~39MB) for ultra-fast local inference.
 */
export async function getTranscriber() {
  if (transcriber) return transcriber;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return transcriber;
  }

  isInitializing = true;
  try {
    console.log('[Whisper] Loading local pre-trained Whisper model (Xenova/whisper-tiny.en)...');
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    console.log('[Whisper] Model loaded and ready for transcription');
    return transcriber;
  } catch (err) {
    console.error('[Whisper] Failed to load local Whisper model:', err);
    throw err;
  } finally {
    isInitializing = false;
  }
}

/**
 * Transcribes 16kHz PCM audio samples to text locally.
 * @param audioSamples Float32Array or array of 16kHz audio samples.
 */
export async function transcribeAudio(audioSamples: Float32Array | number[]): Promise<string> {
  const model = await getTranscriber();
  const input = audioSamples instanceof Float32Array ? audioSamples : new Float32Array(audioSamples);
  const result = await model(input);
  const text = typeof result?.text === 'string' ? result.text.trim() : '';
  console.log('[Whisper] Transcribed text:', text);
  return text;
}

export default {
  getTranscriber,
  transcribeAudio,
};
