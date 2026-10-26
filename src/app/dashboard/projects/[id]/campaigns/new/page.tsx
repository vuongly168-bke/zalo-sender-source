'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { CampaignForm } from '@/components/campaign-form'

export default function NewCampaignPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const fromCampaignId = searchParams.get('from') || undefined

  return <CampaignForm mode="create" projectId={projectId} fromCampaignId={fromCampaignId} />
}
