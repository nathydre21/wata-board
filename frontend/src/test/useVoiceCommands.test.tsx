import { renderHook, act } from '@testing-library/react';
import { useVoiceCommands } from '../hooks/useVoiceCommands';

function createMockSpeechRecognition() {
  let onResult: ((event: any) => void) | null = null;
  let onError: ((event: any) => void) | null = null;
  let onEnd: (() => void) | null = null;
  const mockStart = jest.fn(() => {});
  const mockStop = jest.fn(() => {
    onEnd?.();
  });
  const mockAbort = jest.fn();

  class MockSpeechRecognition {
    lang = '';
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    onend: (() => void) | null = null;
    start = mockStart;
    stop = mockStop;
    abort = mockAbort;
  }

  const instance = new MockSpeechRecognition();
  onResult = instance.onresult;
  onError = instance.onerror;
  onEnd = instance.onend;

  return { MockSpeechRecognition, instance, onResult, onError, onEnd, mockStart, mockStop };
}

describe('useVoiceCommands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  it('should return isSupported=false when SpeechRecognition is not available', () => {
    const { result } = renderHook(() => useVoiceCommands());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.status).toBe('idle');
  });

  it('should return isSupported=true when SpeechRecognition is available', () => {
    const { MockSpeechRecognition } = createMockSpeechRecognition();
    (window as any).SpeechRecognition = MockSpeechRecognition;

    const { result } = renderHook(() => useVoiceCommands());
    expect(result.current.isSupported).toBe(true);
  });

  it('should set status to listening when startListening is called', () => {
    const { MockSpeechRecognition } = createMockSpeechRecognition();
    (window as any).SpeechRecognition = MockSpeechRecognition;

    const { result } = renderHook(() => useVoiceCommands());

    act(() => {
      result.current.startListening();
    });

    expect(result.current.status).toBe('listening');
  });

  it('should set status to idle after stopListening', () => {
    const { MockSpeechRecognition } = createMockSpeechRecognition();
    (window as any).SpeechRecognition = MockSpeechRecognition;

    const { result } = renderHook(() => useVoiceCommands());

    act(() => {
      result.current.startListening();
    });

    expect(result.current.status).toBe('listening');

    act(() => {
      result.current.stopListening();
    });

    expect(result.current.status).toBe('idle');
  });

  it('should set error status when SpeechRecognition errors', () => {
    const { MockSpeechRecognition, instance } = createMockSpeechRecognition();
    (window as any).SpeechRecognition = MockSpeechRecognition;

    const { result } = renderHook(() => useVoiceCommands());

    act(() => {
      result.current.startListening();
      instance.onerror?.({ error: 'no-speech' } as any);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('no-speech');
  });

  it('should reset state on reset call', () => {
    const { MockSpeechRecognition } = createMockSpeechRecognition();
    (window as any).SpeechRecognition = MockSpeechRecognition;

    const { result } = renderHook(() => useVoiceCommands());

    act(() => {
      result.current.startListening();
    });
    expect(result.current.status).toBe('listening');

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.transcript).toBe('');
    expect(result.current.interimTranscript).toBe('');
    expect(result.current.command).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
