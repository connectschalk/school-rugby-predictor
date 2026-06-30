import MemoryMapAuthShell from '@/components/memory-map/MemoryMapAuthShell'
import MemoryMapCreatePasswordForm from '@/components/memory-map/MemoryMapCreatePasswordForm'

export const dynamic = 'force-dynamic'

export default function MemoryMapCreatePasswordPage() {
  return (
    <MemoryMapAuthShell>
      <MemoryMapCreatePasswordForm />
    </MemoryMapAuthShell>
  )
}
