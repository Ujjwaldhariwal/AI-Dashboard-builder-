const REACT_DEVTOOLS_CHILDREN_SET_ERROR =
  'The children should not have changed if we pass in the same set.'

const REACT_DEVTOOLS_EXTENSION_STACK =
  /(?:chrome|moz)-extension:\/\/[^\s)]+\/(?:build\/)?installHook\.js/i

function consoleValueText(value: unknown): string {
  if (value instanceof Error) {
    return `${value.message}\n${value.stack ?? ''}`
  }

  return typeof value === 'string' ? value : ''
}

export function isReactDevToolsChildrenSetError(values: readonly unknown[]) {
  const diagnostic = values.map(consoleValueText).join('\n')

  return diagnostic.includes(REACT_DEVTOOLS_CHILDREN_SET_ERROR)
    && REACT_DEVTOOLS_EXTENSION_STACK.test(diagnostic)
}

export function shouldIgnoreDevelopmentConsoleError(
  values: readonly unknown[],
  environment = process.env.NODE_ENV,
) {
  return environment === 'development'
    && isReactDevToolsChildrenSetError(values)
}
