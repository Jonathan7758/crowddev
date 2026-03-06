export interface DocumentInfo {
  filename: string;
  path: string;
  sections: Section[];
  totalChars: number;
}

export interface Section {
  index: number;
  title: string;
  content: string;
  charCount: number;
}

export interface ScreenedSection extends Section {
  score: number;
  value: 'high' | 'medium' | 'low';
  reason: string;
  conflictHint: string;
}

export interface Topic {
  topic: string;
  description: string;
  involvedRoles: string[];
  expectedConflict: string;
  priority: 'high' | 'medium' | 'low';
  prdSection: string;
}

export interface PrdUpdateResult {
  hasUnresolvedConflicts: boolean;
  unresolvedPoints: string[];
  suggestedNextSteps: string[];
  prdUpdates: PrdUpdateEntry[];
}

export interface PrdUpdateEntry {
  type: 'add' | 'modify' | 'delete';
  section: string;
  originalText?: string;
  newText: string;
  reason: string;
}
