export interface AutoLabelingRule {
  id: string; // UUID
  userId: string;
  labelId: string; // UUID
  ruleName: string;
  priority: number;
  isEnabled: boolean;
  conditions: RuleConditions; // Deserialized by backend [Jsonb] attribute
  createdAt: string;
  updatedAt: string;
}

export interface RuleCondition {
  field: 'from' | 'subject' | 'body';
  operator: 'contains' | 'equals' | 'startswith' | 'endswith' | 'notcontains' | 'notequals';
  value: string;
  nextOperator?: 'AND' | 'OR'; // Operator to use with the next condition
}

export interface RuleConditions {
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
