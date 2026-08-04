import { shouldIgnoreDevelopmentConsoleError } from '@/lib/observability/development-console-filter'

if (process.env.NODE_ENV === 'development') {
  const reportConsoleError = console.error.bind(console)

  console.error = (...values: unknown[]) => {
    if (shouldIgnoreDevelopmentConsoleError(values)) return
    reportConsoleError(...values)
  }
}
