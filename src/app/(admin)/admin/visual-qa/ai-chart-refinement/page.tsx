import { notFound } from 'next/navigation'

import { AiChartRefinementVisualHarness } from '@/components/platform/ai-chart-refinement-visual-harness'

export default function AiChartRefinementVisualPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <AiChartRefinementVisualHarness />
}
