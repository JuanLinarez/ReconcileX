export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  route?: string;
  order: number;
  completionType: 'auto' | 'manual';
  isComplete?: (context: OnboardingContext) => boolean;
}

export interface OnboardingContext {
  reconciliationCount: number;
  templateCount: number;
  hasRunAIAnalysis: boolean;
  hasExportedResults: boolean;
}

export interface OnboardingState {
  dismissedSteps: string[];
  onboardingHidden: boolean;
  firstSeenAt: string | null;
}
