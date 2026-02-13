import type { OnboardingStep } from './types';

// TO ADD A NEW STEP IN THE FUTURE:
// 1. Add an entry here with a unique id
// 2. Wrap the relevant UI element with <OnboardingHighlight stepId="your-id">
// That's it.

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'first-upload',
    title: 'Upload your data',
    description: 'Upload two CSV or Excel files to start your first reconciliation.',
    route: '/reconciliation',
    order: 1,
    completionType: 'auto',
    isComplete: (ctx) => ctx.reconciliationCount > 0,
  },
  {
    id: 'configure-rules',
    title: 'Configure matching rules',
    description: 'Set up how amounts, dates, and references should be compared.',
    route: '/reconciliation',
    order: 2,
    completionType: 'auto',
    isComplete: (ctx) => ctx.reconciliationCount > 0,
  },
  {
    id: 'review-results',
    title: 'Review your results',
    description: 'Explore matched pairs, analyze exceptions, and export your report.',
    route: '/reconciliation',
    order: 3,
    completionType: 'auto',
    isComplete: (ctx) => ctx.reconciliationCount > 0,
  },
  {
    id: 'try-ai-analysis',
    title: 'Try AI Exception Analysis',
    description: 'Click "Analyze" on any unmatched transaction to get AI-powered insights.',
    route: '/reconciliation',
    order: 4,
    completionType: 'auto',
    isComplete: (ctx) => ctx.hasRunAIAnalysis,
  },
  {
    id: 'save-template',
    title: 'Save a matching template',
    description: 'Save your rule configuration to reuse it on future reconciliations.',
    route: '/reconciliation',
    order: 5,
    completionType: 'auto',
    isComplete: (ctx) => ctx.templateCount > 0,
  },
  {
    id: 'export-results',
    title: 'Export your report',
    description: 'Download your reconciliation results as Excel or CSV.',
    route: '/reconciliation',
    order: 6,
    completionType: 'auto',
    isComplete: (ctx) => ctx.hasExportedResults,
  },
];
