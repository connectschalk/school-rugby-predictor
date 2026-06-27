import MemoryMapAuthShell from '@/components/memory-map/MemoryMapAuthShell'
import MemoryMapSignInForm from '@/components/memory-map/MemoryMapSignInForm'

export const dynamic = 'force-dynamic'

export default function MemoryMapSignInPage() {
  return (
    <MemoryMapAuthShell>
      <MemoryMapSignInForm />
    </MemoryMapAuthShell>
  )
}
