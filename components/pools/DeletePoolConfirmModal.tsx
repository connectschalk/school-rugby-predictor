'use client'

type DeletePoolConfirmModalProps = {
  open: boolean
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function DeletePoolConfirmModal({
  open,
  deleting,
  onCancel,
  onConfirm,
}: DeletePoolConfirmModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!deleting) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-pool-dialog-title"
        className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-pool-dialog-title" className="text-lg font-black text-gray-900">
          Delete pool?
        </h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700">
          <p>Are you sure you want to delete this pool?</p>
          <p className="font-semibold text-gray-900">This action cannot be undone.</p>
          <p>
            The pool, members, and join requests will be removed. Match predictions and user accounts
            will not be affected.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-xl border border-red-600 bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete Pool'}
          </button>
        </div>
      </div>
    </div>
  )
}
