import type { MemoryMapDataSource } from '@/lib/memory-map/queries'

export function isUuid(value: string | null | undefined): boolean {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

export type SubmitIdValidationInput = {
  source: MemoryMapDataSource
  memoryMapId: string
  areaId: string
  existingPinId?: string | null
  categoryId?: string | null
}

export function validateMemoryMapSubmitIds(input: SubmitIdValidationInput): string | null {
  if (input.source === 'demo') {
    return 'This map is in preview mode. Memories can be submitted once the map is connected to the live database.'
  }

  if (!isUuid(input.memoryMapId)) {
    return 'This Memory Map is not linked to the database correctly. Refresh the page or ask admin to recreate the area.'
  }

  if (!isUuid(input.areaId)) {
    return 'This area is not linked to the database correctly. Refresh the page or ask admin to recreate the area.'
  }

  if (input.existingPinId != null && input.existingPinId !== '' && !isUuid(input.existingPinId)) {
    return 'This pin is not linked to the database correctly. Refresh the page or ask admin to recreate the area.'
  }

  if (input.categoryId != null && input.categoryId !== '' && !isUuid(input.categoryId)) {
    return 'This category is not linked to the database correctly. Refresh the page or ask admin to recreate the area.'
  }

  return null
}
