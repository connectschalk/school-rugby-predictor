'use client'

import type { PoolInviteJoinMode } from '@/lib/pools'

type Props = {
  value: PoolInviteJoinMode
  disabled?: boolean
  saving?: boolean
  onChange: (mode: PoolInviteJoinMode) => void
}

export default function PoolInviteJoinModeSetting({ value, disabled = false, saving = false, onChange }: Props) {
  return (
    <fieldset className="space-y-3" disabled={disabled || saving}>
      <legend className="text-xs font-black uppercase tracking-wide text-gray-600">Invite link access</legend>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-800">
        <input
          type="radio"
          name="invite-join-mode"
          checked={value === 'request'}
          onChange={() => onChange('request')}
          className="mt-1"
        />
        <span>
          <span className="font-semibold">Request to join</span>
          <span className="mt-0.5 block text-xs font-normal text-gray-500">
            People with the link can request access. An admin must approve them.
          </span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-800">
        <input
          type="radio"
          name="invite-join-mode"
          checked={value === 'auto'}
          onChange={() => onChange('auto')}
          className="mt-1"
        />
        <span>
          <span className="font-semibold">Join automatically</span>
          <span className="mt-0.5 block text-xs font-normal text-gray-500">
            People with the link can join this pool immediately after signing in.
          </span>
        </span>
      </label>
      {saving ? <p className="text-xs font-medium text-gray-500">Saving…</p> : null}
    </fieldset>
  )
}
