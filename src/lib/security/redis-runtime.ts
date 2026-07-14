interface RedisCommandResult<T = unknown> {
  result?: T
  error?: string
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.DASHBOARDOS_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.DASHBOARDOS_REDIS_REST_TOKEN
  if (!url || !token) return null
  return {
    url: url.replace(/\/$/, ''),
    token,
  }
}

export function hasRedisRuntime() {
  return redisConfig() !== null
}

export async function redisCommand<T = unknown>(command: unknown[]): Promise<RedisCommandResult<T> | null> {
  const config = redisConfig()
  if (!config) return null

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    })

    if (!response.ok) return { error: `Redis command failed (${response.status})` }
    return await response.json() as RedisCommandResult<T>
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export async function redisPipeline<T = unknown>(commands: unknown[][]): Promise<RedisCommandResult<T>[] | null> {
  const config = redisConfig()
  if (!config) return null

  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      cache: 'no-store',
    })

    if (!response.ok) return [{ error: `Redis pipeline failed (${response.status})` }]
    return await response.json() as RedisCommandResult<T>[]
  } catch (error) {
    return [{ error: error instanceof Error ? error.message : String(error) }]
  }
}
