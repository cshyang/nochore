export interface RequestInputToolInput {
  question: string;
  options: Array<{ key: string; label: string; description?: string; selected?: boolean }>;
  multiSelect: boolean;
  allowCustom?: boolean;
  skippable?: boolean;
  placeholder?: string;
}

export type OnboardingMessage = {
  role: string;
  parts: Array<Record<string, unknown>>;
};
