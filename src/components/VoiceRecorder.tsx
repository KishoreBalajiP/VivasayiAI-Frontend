import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Square } from "lucide-react";
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
    <div className="flex items-center justify-center sm:justify-start">
      <button
        onClick={handleToggleRecording}
        type="button"
        aria-label={isRecording ? t('stop') : t('speak')}
        title={isRecording ? t('stop') : t('speak')}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
          isRecording
            ? 'bg-red-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        {isRecording ? (
          <>
            <Square className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-red-500" />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-600" />
          </>
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>

      {error && (
        <p className="ml-2 text-xs text-red-500">
          {t('micError')}: {error}
        </p>
      )}
    </div>
  );
}
