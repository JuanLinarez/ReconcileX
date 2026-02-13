import { useState } from 'react';
import { ChevronDown, ChevronUp, Circle } from 'lucide-react';
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

  // Get only incomplete steps
  const incompleteSteps = ONBOARDING_STEPS.filter(
    (s) => !completedStepIds.has(s.id)
  );

  // Hide if all complete
  if (incompleteSteps.length === 0) return null;

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
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold text-[var(--app-heading)]">
                Getting Started
              </span>
              <span className="block text-xs text-gray-400">
                {incompleteSteps.length} step
                {incompleteSteps.length !== 1 ? 's' : ''} remaining
              </span>
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {expanded && (
          <div className="space-y-2 border-t border-gray-100 px-4 py-3">
            {incompleteSteps.map((step) => {
              const isActive = step.id === activeStepId;
              return (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-md p-2 text-sm transition-colors',
                    isActive && 'bg-blue-50'
                  )}
                >
                  <Circle
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      isActive ? 'text-[var(--app-primary)]' : 'text-gray-300'
                    )}
                  />
                  <div>
                    <p className="font-medium text-[var(--app-heading)]">
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
