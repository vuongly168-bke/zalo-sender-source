'use client'

import { useParams } from 'next/navigation'
import { CampaignForm } from '@/components/campaign-form'

export default function EditCampaignPage() {
  const params = useParams()
  const projectId = params.id as string
  const campaignId = params.campaignId as string

  return <CampaignForm mode="edit" projectId={projectId} campaignId={campaignId} />
}
