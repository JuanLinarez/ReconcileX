import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';

interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorAlert({
  title = 'Something went wrong',
  message,
  onRetry,
  onDismiss,
}: ErrorAlertProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-800">{title}</p>
          <p className="mt-1 text-sm text-red-700">{message}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                onDismiss();
              }}
              className="rounded-md p-1 text-red-400 hover:text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
