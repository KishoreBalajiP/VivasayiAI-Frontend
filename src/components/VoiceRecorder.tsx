import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import useSpeechToText from "react-hook-speech-to-text";

interface VoiceRecorderProps {
  onResult: (text: string) => void;
}

export default function VoiceRecorder({ onResult }: VoiceRecorderProps) {
  const { t } = useTranslation();

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
    timeout: 3000,
  });

  const lastTranscriptRef = useRef('');

  useEffect(() => {
    if (isRecording) {
      setResults([]);
      lastTranscriptRef.current = '';
      onResult('');
    }
  }, [isRecording, onResult, setResults]);

  useEffect(() => {
    if (results.length > 0 && isRecording) {
      const latestResult = results[results.length - 1];
      const transcript =
        typeof latestResult === "string"
          ? latestResult
          : latestResult.transcript;

      const trimmed = transcript.trim();
      if (trimmed && trimmed !== lastTranscriptRef.current) {
        lastTranscriptRef.current = trimmed;
        onResult(trimmed);
      }
    }
  }, [results, isRecording, onResult]);

  const handleToggleRecording = () => {
    isRecording ? stopSpeechToText() : startSpeechToText();
  };

  return (
    <div className="flex items-center justify-center sm:justify-start gap-2">
      <button
        onClick={handleToggleRecording}
        type="button"
        className={`p-4 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl transition-all shadow-lg text-sm sm:text-base ${
          isRecording
            ? 'bg-red-600 animate-pulse text-white'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {isRecording ? ` ${t('stop')}` : ` ${t('speak')}`}
      </button>

      {error && (
        <p className="text-red-500 text-xs sm:text-sm">
          {t('micError')}: {error}
        </p>
      )}
    </div>
  );
}
