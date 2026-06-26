'use client'

type PoolVisibilitySettingProps = {
  isPublic: boolean
  disabled?: boolean
  saving?: boolean
  onChange: (isPublic: boolean) => void
}

export default function PoolVisibilitySetting({
  isPublic,
  disabled = false,
  saving = false,
  onChange,
}: PoolVisibilitySettingProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-800">
      <input
        type="checkbox"
        checked={isPublic}
        disabled={disabled || saving}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 rounded border-gray-300"
      />
      <span>
        <span className="font-semibold">Public pool</span>
        <span className="mt-0.5 block text-xs font-normal text-gray-500">
          Searchable by name in the pool directory. Private pools can still be joined with an invite link or
          exact pool code.
        </span>
        {saving ? <span className="mt-1 block text-xs font-medium text-gray-500">Saving…</span> : null}
      </span>
    </label>
  )
}
