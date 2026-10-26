'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PersonalCampaignForm } from '@/components/personal-campaign-form'

function NewPersonalCampaignContent() {
  const searchParams = useSearchParams()
  const fromCampaignId = searchParams.get('from') || undefined
  return <PersonalCampaignForm mode="create" fromCampaignId={fromCampaignId} />
}

export default function NewPersonalCampaignPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-500">Đang tải...</div>}>
      <NewPersonalCampaignContent />
    </Suspense>
  )
}
