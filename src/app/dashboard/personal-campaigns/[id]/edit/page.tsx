'use client'

import { useParams } from 'next/navigation'
import { PersonalCampaignForm } from '@/components/personal-campaign-form'

export default function EditPersonalCampaignPage() {
  const params = useParams()
  const campaignId = params.id as string
  return <PersonalCampaignForm mode="edit" campaignId={campaignId} />
}
