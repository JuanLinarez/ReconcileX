import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OnboardingHighlightProps {
  stepId: string;
  isActive: boolean;
  title: string;
  description: string;
  onDismiss: () => void;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}

// Usage:
//   <OnboardingHighlight
//     stepId="first-upload"
//     isActive={isStepActive('first-upload')}
//     title="Upload your data"
//     description="Start by uploading two CSV files"
//     onDismiss={() => dismissStep('first-upload')}
//   >
//     <UploadDropzone />
//   </OnboardingHighlight>

export function OnboardingHighlight({
  isActive,
  title,
  description,
  onDismiss,
  position = 'bottom',
  children,
}: OnboardingHighlightProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!isActive || dismissed) {
    return <>{children}</>;
  }

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-3',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-3',
    left: 'right-full top-1/2 -translate-y-1/2 mr-3',
    right: 'left-full top-1/2 -translate-y-1/2 ml-3',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-[var(--app-primary)]',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-[var(--app-primary)]',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-[var(--app-primary)]',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-[var(--app-primary)]',
  };

  return (
    <div className="relative">
      <div
        className="absolute -inset-1 z-10 animate-pulse rounded-lg border-2 border-[var(--app-primary)] pointer-events-none"
        aria-hidden
      />
      <div className="relative z-20">{children}</div>
      <div
        className={cn(
          'absolute z-30 w-72 rounded-lg border border-[var(--app-primary)]/20 bg-white p-4 shadow-lg',
          positionClasses[position]
        )}
      >
        <div
          className={cn(
            'absolute h-0 w-0 border-[6px] border-transparent',
            arrowClasses[position]
          )}
          aria-hidden
        />
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--app-heading)]">
              {title}
            </p>
            <p className="mt-1 text-xs text-[var(--app-body)]">{description}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              onDismiss();
            }}
            className="shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
