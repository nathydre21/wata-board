import { useState, useCallback, useRef, useEffect } from 'react';

export type VoiceCommandStatus = 'idle' | 'listening' | 'processing' | 'success' | 'error';

export interface ParsedPaymentCommand {
  amount: number;
  meterId?: string;
  memo?: string;
  raw: string;
}

export interface VoiceCommandResult {
  status: VoiceCommandStatus;
  transcript: string;
  interimTranscript: string;
  command: ParsedPaymentCommand | null;
  error: string | null;
}

const COMMAND_PATTERNS = [
  {
    pattern: /pay\s+(\d+(?:\.\d+)?)\s*(?:xlm)?\s*(?:to\s+meter\s+([a-z0-9-]+))?/i,
    extract: (match: RegExpMatchArray): ParsedPaymentCommand => ({
      amount: parseFloat(match[1]),
      meterId: match[2] || undefined,
      raw: match[0],
    }),
  },
  {
    pattern: /send\s+(\d+(?:\.\d+)?)\s*(?:xlm)?\s*(?:to\s+meter\s+([a-z0-9-]+))?/i,
    extract: (match: RegExpMatchArray): ParsedPaymentCommand => ({
      amount: parseFloat(match[1]),
      meterId: match[2] || undefined,
      raw: match[0],
    }),
  },
  {
    pattern: /(?:make\s+a\s+)?payment\s+of\s+(\d+(?:\.\d+)?)\s*(?:xlm)?\s*(?:for\s+meter\s+([a-z0-9-]+))?/i,
    extract: (match: RegExpMatchArray): ParsedPaymentCommand => ({
      amount: parseFloat(match[1]),
      meterId: match[2] || undefined,
      raw: match[0],
    }),
  },
];

function parseVoiceCommand(transcript: string): ParsedPaymentCommand | null {
  for (const { pattern, extract } of COMMAND_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      return extract(match);
    }
  }
  return null;
}

function getSpeechRecognition(): SpeechRecognition | null {
  if (typeof window === 'undefined') return null;
  const SpeechRecognitionAPI =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  return SpeechRecognitionAPI ? new SpeechRecognitionAPI() : null;
}

export function useVoiceCommands() {
  const [result, setResult] = useState<VoiceCommandResult>({
    status: 'idle',
    transcript: '',
    interimTranscript: '',
    command: null,
    error: null,
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningRef = useRef(false);

  const cleanup = useCallback(() => {
    isListeningRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
      }
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startListening = useCallback(() => {
    const recognition = getSpeechRecognition();
    if (!recognition) {
      setResult(prev => ({
        ...prev,
        status: 'error',
        error: 'Speech recognition is not supported in this browser.',
      }));
      return;
    }

    cleanup();

    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const resultItem = event.results[i];
        if (resultItem.isFinal) {
          finalTranscript += resultItem[0].transcript;
        } else {
          interimTranscript += resultItem[0].transcript;
        }
      }

      if (finalTranscript) {
        setResult(prev => ({
          ...prev,
          status: 'processing',
          transcript: finalTranscript,
          interimTranscript: '',
          command: parseVoiceCommand(finalTranscript),
        }));
      } else {
        setResult(prev => ({
          ...prev,
          interimTranscript,
        }));
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setResult(prev => ({
        ...prev,
        status: 'error',
        error: `Speech recognition error: ${event.error}`,
      }));
      cleanup();
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        setResult(prev => ({
          ...prev,
          status: 'idle',
          interimTranscript: '',
        }));
      }
      isListeningRef.current = false;
    };

    recognitionRef.current = recognition;
    isListeningRef.current = true;
    setResult({
      status: 'listening',
      transcript: '',
      interimTranscript: '',
      command: null,
      error: null,
    });

    try {
      recognition.start();
    } catch (err) {
      setResult(prev => ({
        ...prev,
        status: 'error',
        error: 'Failed to start speech recognition.',
      }));
    }

    timeoutRef.current = setTimeout(() => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
        }
      }
    }, 10000);
  }, [cleanup]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
      }
    }
    cleanup();
    setResult(prev => ({
      ...prev,
      status: 'idle',
      interimTranscript: '',
    }));
  }, [cleanup]);

  const reset = useCallback(() => {
    stopListening();
    setResult({
      status: 'idle',
      transcript: '',
      interimTranscript: '',
      command: null,
      error: null,
    });
  }, [stopListening]);

  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  return {
    ...result,
    startListening,
    stopListening,
    reset,
    isSupported,
  };
}
