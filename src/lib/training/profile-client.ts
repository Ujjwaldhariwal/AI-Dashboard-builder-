import type {
  EndpointProfile,
  MappingCandidate,
  TrainingProfileRequest,
  TrainingProfileSummary,
} from '@/types/training'

interface TrainingProfilesResponse {
  profiles: EndpointProfile[]
}

interface TrainingSummaryResponse {
  summary: TrainingProfileSummary
}

interface TrainingFeedbackPayload {
  dashboardId: string
  endpointId: string
  widgetId?: string
  sourceAction: 'create_widget' | 'edit_widget' | 'review_override' | 'review_accept'
  acceptedMapping: MappingCandidate
  previousMapping?: MappingCandidate
  notes?: string
}

export async function profileDashboardEndpoints(
  payload: TrainingProfileRequest,
): Promise<TrainingProfileSummary> {
  const response = await fetch('/api/training/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Training profile run failed (${response.status})`)
  }

  const data = (await response.json()) as TrainingSummaryResponse
  return data.summary
}

export async function fetchTrainingProfiles(
  dashboardId: string,
): Promise<EndpointProfile[]> {
  const query = new URLSearchParams({ dashboardId })
  const response = await fetch(`/api/training/profile?${query.toString()}`, {
    method: 'GET',
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Failed to load training profiles (${response.status})`)
  }

  const data = (await response.json()) as TrainingProfilesResponse
  return data.profiles
}

export async function saveEndpointMappingFeedback(
  payload: TrainingFeedbackPayload,
): Promise<void> {
  const response = await fetch('/api/training/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Failed to save mapping feedback (${response.status})`)
  }
}

export function profileMapFromList(profiles: EndpointProfile[]): Record<string, EndpointProfile> {
  return Object.fromEntries(profiles.map(profile => [profile.endpointId, profile]))
}