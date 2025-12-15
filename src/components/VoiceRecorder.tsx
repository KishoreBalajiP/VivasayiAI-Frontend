import { useEffect, useRef } from "react";
import useSpeechToText from "react-hook-speech-to-text";

interface VoiceRecorderProps {
  onResult: (text: string) => void;
}

export default function VoiceRecorder({ onResult }: VoiceRecorderProps) {
  const {
    error,
    isRecording,
    results,
    startSpeechToText,
    stopSpeechToText,
    setResults,
  } = useSpeechToText({
    continuous: true,
    useLegacyResults: false,
    crossBrowser: true,
    timeout: 3000, // 3-second timeout
  });

  const lastTranscriptRef = useRef('');

  // Clear everything when starting new recording
  useEffect(() => {
    if (isRecording) {
      setResults([]);
      lastTranscriptRef.current = '';
      onResult('');
    }
  }, [isRecording, onResult, setResults]);

  // Update input in real-time as speech is recognized
  useEffect(() => {
    if (results.length > 0 && isRecording) {
      const latestResult = results[results.length - 1];
      const transcript =
        typeof latestResult === "string"
          ? latestResult
          : latestResult.transcript;

      const trimmedTranscript = transcript.trim();

      if (
        trimmedTranscript &&
        trimmedTranscript !== lastTranscriptRef.current
      ) {
        lastTranscriptRef.current = trimmedTranscript;
        onResult(trimmedTranscript);
      }
    }
  }, [results, isRecording, onResult]);

  const handleToggleRecording = () => {
    if (isRecording) {
      stopSpeechToText();
    } else {
      startSpeechToText();
    }
  };

  return (
    <div className="flex items-center justify-center sm:justify-start gap-2">
      <button
        onClick={handleToggleRecording}
        className={`p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl transition-all shadow-lg text-sm sm:text-base ${
          isRecording
            ? 'bg-red-600 animate-pulse text-white'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
        type="button"
      >
        {isRecording ? "🛑 Stop" : "🎤 Speak"}
      </button>

      {error && (
        <p className="text-red-500 text-xs sm:text-sm">
          Microphone error: {error}
        </p>
      )}
    </div>
  );
}
