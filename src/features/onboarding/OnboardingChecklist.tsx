import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ONBOARDING_STEPS } from './onboardingSteps';

export interface OnboardingChecklistProps {
  completedStepIds: Set<string>;
  activeStepId: string | null;
  progress: { completed: number; total: number; percentage: number };
  onHideOnboarding: () => void;
}

export function OnboardingChecklist({
  completedStepIds,
  activeStepId,
  progress,
  onHideOnboarding,
}: OnboardingChecklistProps) {
  const [expanded, setExpanded] = useState(true);

  if (progress.percentage === 100) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="relative h-8 w-8">
              <svg className="h-8 w-8 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="3"
                  strokeDasharray={`${progress.percentage} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[var(--app-primary)]">
                {progress.completed}/{progress.total}
              </span>
            </div>
            <span className="text-sm font-semibold text-[var(--app-heading)]">
              Getting Started
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {expanded && (
          <div className="space-y-2 border-t border-gray-100 px-4 py-3">
            {ONBOARDING_STEPS.map((step) => {
              const isCompleted = completedStepIds.has(step.id);
              const isActive = step.id === activeStepId;
              return (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-md p-2 text-sm transition-colors',
                    isActive && 'bg-blue-50',
                    isCompleted && 'opacity-60'
                  )}
                >
                  {isCompleted ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  ) : (
                    <Circle
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        isActive ? 'text-[var(--app-primary)]' : 'text-gray-300'
                      )}
                    />
                  )}
                  <div>
                    <p
                      className={cn(
                        'font-medium',
                        isCompleted
                          ? 'line-through text-gray-400'
                          : 'text-[var(--app-heading)]'
                      )}
                    >
                      {step.title}
                    </p>
                    {isActive && (
                      <p className="mt-0.5 text-xs text-[var(--app-body)]">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={onHideOnboarding}
              className="mt-2 w-full text-center text-xs text-gray-400 transition-colors hover:text-gray-600"
            >
              Don&apos;t show again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
