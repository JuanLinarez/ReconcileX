import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ONBOARDING_STEPS } from './onboardingSteps';
import type { OnboardingState, OnboardingContext } from './types';

const DEFAULT_STATE: OnboardingState = {
  dismissedSteps: [],
  onboardingHidden: false,
  firstSeenAt: null,
};

export function useOnboarding(context: OnboardingContext) {
  const { user } = useAuth();
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);

  const persistState = useCallback(async (newState: OnboardingState) => {
    await supabase.auth.updateUser({
      data: { onboarding_state: newState },
    });
  }, []);

  // Load state from user_metadata on mount
  useEffect(() => {
    if (!user) return;
    const meta = user.user_metadata;
    const saved = meta?.onboarding_state as OnboardingState | undefined;
    if (saved) {
      setState(saved);
    } else {
      const initial: OnboardingState = {
        dismissedSteps: [],
        onboardingHidden: false,
        firstSeenAt: new Date().toISOString(),
      };
      setState(initial);
      void persistState(initial);
    }
    setLoaded(true);
  }, [user, persistState]);

  const completedStepIds = useMemo(() => {
    const completed = new Set<string>(state.dismissedSteps);
    for (const step of ONBOARDING_STEPS) {
      if (step.completionType === 'auto' && step.isComplete?.(context)) {
        completed.add(step.id);
      }
    }
    return completed;
  }, [context, state.dismissedSteps]);

  const remainingSteps = useMemo(() => {
    return ONBOARDING_STEPS.filter((s) => !completedStepIds.has(s.id)).sort(
      (a, b) => a.order - b.order
    );
  }, [completedStepIds]);

  const activeStep = remainingSteps[0] ?? null;

  const progress = useMemo(
    () => ({
      completed: completedStepIds.size,
      total: ONBOARDING_STEPS.length,
      percentage: Math.round(
        (completedStepIds.size / ONBOARDING_STEPS.length) * 100
      ),
    }),
    [completedStepIds.size]
  );

  const isStepActive = useCallback(
    (stepId: string) => activeStep?.id === stepId,
    [activeStep]
  );

  const dismissStep = useCallback(
    (stepId: string) => {
      const newState = {
        ...state,
        dismissedSteps: [...new Set([...state.dismissedSteps, stepId])],
      };
      setState(newState);
      void persistState(newState);
    },
    [state, persistState]
  );

  const hideOnboarding = useCallback(() => {
    const newState = { ...state, onboardingHidden: true };
    setState(newState);
    void persistState(newState);
  }, [state, persistState]);

  const isVisible =
    loaded && !state.onboardingHidden && remainingSteps.length > 0;

  return {
    activeStep,
    remainingSteps,
    completedStepIds,
    progress,
    isStepActive,
    dismissStep,
    hideOnboarding,
    isVisible,
    loaded,
  };
}
