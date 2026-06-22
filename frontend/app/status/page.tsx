import type { Metadata } from 'next'
import StatusPageClient from './StatusPageClient'

export const metadata: Metadata = {
  title: 'System Status — DocuMind AI',
  description: 'Real-time health status of DocuMind AI services',
}

export default function StatusPage() {
  return <StatusPageClient />
}
