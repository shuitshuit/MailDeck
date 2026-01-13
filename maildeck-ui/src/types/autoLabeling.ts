export interface AutoLabelingRule {
  id: string; // UUID
  userId: string;
  labelId: string; // UUID
  ruleName: string;
  priority: number;
  isEnabled: boolean;
  conditions: string; // JSON string of RuleConditions
  createdAt: string;
  updatedAt: string;
}

export interface RuleCondition {
  field: 'from' | 'subject' | 'body';
  operator: 'contains' | 'equals' | 'startswith' | 'endswith' | 'notcontains' | 'notequals';
  value: string;
}

export interface RuleConditions {
  operator: 'AND' | 'OR';
  rules: RuleCondition[];
}

export interface CreateRuleRequest {
  ruleName: string;
  labelId: string;
  priority: number;
  conditions: RuleConditions;
}

export interface UpdateRuleRequest {
  ruleName: string;
  labelId: string;
  priority: number;
  isEnabled: boolean;
  conditions: RuleConditions;
}

export interface AutoLabelingRuleWithLabel extends AutoLabelingRule {
  labelName?: string; // Populated client-side by joining with labels
  labelColor?: string;
}
