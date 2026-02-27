// Module: ApiClient
import axios from 'axios'

export class ApiClient {
  static async fetchData(
    url: string,
    method: 'GET' | 'POST' = 'GET',
    headers?: Record<string, string>,
    body?: any
  ) {
    try {
      const response = await axios({
        url,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        data: body,
        timeout: 10000, // 10 second timeout
      })
      return response.data
    } catch (error) {
      console.error('API fetch error:', error)
      throw error
    }
  }
}
