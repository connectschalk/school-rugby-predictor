import MemoryMapAuthShell from '@/components/memory-map/MemoryMapAuthShell'
import MemoryMapSignUpForm from '@/components/memory-map/MemoryMapSignUpForm'

export const dynamic = 'force-dynamic'

export default function MemoryMapSignUpPage() {
  return (
    <MemoryMapAuthShell>
      <MemoryMapSignUpForm />
    </MemoryMapAuthShell>
  )
}
