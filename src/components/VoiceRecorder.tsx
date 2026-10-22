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
    if (isRecording) {
      stopSpeechToText();
    } else {
      startSpeechToText();
    }
  };

  return (
    <div className="flex items-center justify-center sm:justify-start">
      <button
        onClick={handleToggleRecording}
        type="button"
        aria-label={isRecording ? t('stop') : t('speak')}
        title={isRecording ? t('stop') : t('speak')}
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
          isRecording
            ? 'bg-danger-solid text-white'
            : 'bg-surface-sunken text-ink-muted hover:bg-surface-border'
        }`}
      >
        {isRecording ? (
          <>
            <Square className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-danger-solid" />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-danger-solid" />
          </>
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>

      {error && (
        <p role="alert" className="ml-2 text-xs text-danger-fg">
          {t('micErrorBody')}
        </p>
      )}
    </div>
  );
}
