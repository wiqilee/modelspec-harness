export type ComplianceRow = {
  case_id: string;
  model: string;
  pass: 0 | 1;
  critical: number;
  high: number;
  medium: number;
  low: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
};

export type RunBundle = {
  runId: string;
  specId: string;
  createdAt: string;
  rows: ComplianceRow[];
  totals: {
    totalCases: number;
    totalRows: number;
    byModel: Array<{
      model: string;
      total: number;
      pass: number;
      avg_latency_ms: number;
      cost_usd: number;
    }>;
  };
};
