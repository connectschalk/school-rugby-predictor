'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  createDefaultMemoryCategories,
  ensureGeneralCategory,
} from '@/lib/memory-map/default-categories'
import type { MemoryCategory } from '@/lib/memory-map/types'

type Props = {
  mapId: string
  categories: MemoryCategory[]
  onRefresh: () => void
}

type EditDraft = {
  name: string
  colour: string
  icon: string
}

export default function AdminCategoriesPanel({ mapId, categories, onRefresh }: Props) {
  const [busy, setBusy] = useState<'general' | 'defaults' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: '', colour: '#FFD400', icon: 'pin' })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColour, setNewColour] = useState('#FFD400')
  const [newIcon, setNewIcon] = useState('pin')

  const active = categories.filter((c) => c.is_active)
  const inactive = categories.filter((c) => !c.is_active)
  const hasGeneral = active.some((c) => c.name.toLowerCase() === 'general')

  useEffect(() => {
    if (active.length > 0) return
    void ensureGeneralCategory(supabase, mapId).then(({ error: err }) => {
      if (!err) onRefresh()
    })
  }, [active.length, mapId, onRefresh])

  async function onCreateGeneral() {
    setBusy('general')
    setError('')
    setMessage('')
    const { error: err } = await ensureGeneralCategory(supabase, mapId)
    setBusy(null)
    if (err) {
      setError(err)
      return
    }
    setMessage('General category is ready.')
    onRefresh()
  }

  async function onCreateDefaults() {
    setBusy('defaults')
    setError('')
    setMessage('')
    const { error: err } = await createDefaultMemoryCategories(supabase, mapId)
    setBusy(null)
    if (err) {
      setError(err)
      return
    }
    setMessage('Default categories created.')
    onRefresh()
  }

  function startEdit(cat: MemoryCategory) {
    setEditingId(cat.id)
    setEditDraft({ name: cat.name, colour: cat.colour, icon: cat.icon ?? 'pin' })
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(catId: string) {
    const name = editDraft.name.trim()
    if (!name) {
      setError('Category name is required.')
      return
    }
    setSavingId(catId)
    setError('')
    const { error: updateErr } = await supabase
      .from('memory_categories')
      .update({
        name,
        colour: editDraft.colour,
        icon: editDraft.icon.trim() || 'pin',
      })
      .eq('id', catId)
      .eq('memory_map_id', mapId)
    setSavingId(null)
    if (updateErr) {
      setError(updateErr.message)
      return
    }
    setEditingId(null)
    setMessage('Category updated.')
    onRefresh()
  }

  async function setCategoryActive(cat: MemoryCategory, isActive: boolean) {
    setSavingId(cat.id)
    setError('')
    const { error: updateErr } = await supabase
      .from('memory_categories')
      .update({ is_active: isActive })
      .eq('id', cat.id)
      .eq('memory_map_id', mapId)
    setSavingId(null)
    if (updateErr) {
      setError(updateErr.message)
      return
    }
    setMessage(isActive ? 'Category reactivated.' : 'Category deactivated.')
    onRefresh()
  }

  async function onAddCategory() {
    const name = newName.trim()
    if (!name) {
      setError('Category name is required.')
      return
    }
    setSavingId('new')
    setError('')
    const maxSort = categories.reduce((max, c) => Math.max(max, c.sort_order), 0)
    const { error: insertErr } = await supabase.from('memory_categories').insert({
      memory_map_id: mapId,
      name,
      colour: newColour,
      icon: newIcon.trim() || 'pin',
      sort_order: maxSort + 1,
      is_active: true,
    })
    setSavingId(null)
    if (insertErr) {
      setError(insertErr.message)
      return
    }
    setNewName('')
    setNewColour('#FFD400')
    setNewIcon('pin')
    setShowAddForm(false)
    setMessage('Category added.')
    onRefresh()
  }

  if (active.length === 0 && inactive.length === 0) {
    return (
      <div className="mm-card rounded-2xl p-6 text-center">
        <p className="text-lg font-black">No categories yet</p>
        <p className="mm-muted mx-auto mt-2 max-w-md text-sm">
          Categories help organise pins and stories. A General category is enough to get started.
        </p>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-green-300">{message}</p> : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void onCreateGeneral()}
            className="mm-btn-primary rounded-xl px-4 py-3 text-sm font-black disabled:opacity-50"
          >
            {busy === 'general' ? 'Creating…' : 'Create General category'}
          </button>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void onCreateDefaults()}
            className="mm-btn-secondary rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50"
          >
            {busy === 'defaults' ? 'Creating…' : 'Create default category set'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!hasGeneral ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          No General category yet. Content will use General automatically, or you can create it now.
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void onCreateGeneral()}
            className="mm-btn-secondary ml-2 mt-2 rounded-lg px-3 py-1 text-xs font-bold"
          >
            Create General
          </button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-green-300">{message}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {[...active]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              editing={editingId === cat.id}
              editDraft={editDraft}
              saving={savingId === cat.id}
              onStartEdit={() => startEdit(cat)}
              onCancelEdit={cancelEdit}
              onSaveEdit={() => void saveEdit(cat.id)}
              onDeactivate={() => void setCategoryActive(cat, false)}
              onEditDraftChange={setEditDraft}
            />
          ))}
      </div>

      {inactive.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-white/50">Inactive</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {inactive.map((cat) => (
              <div key={cat.id} className="mm-card flex items-center gap-3 rounded-2xl p-3 opacity-60">
                <span className="h-8 w-8 shrink-0 rounded-lg" style={{ backgroundColor: cat.colour }} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{cat.name}</p>
                  <p className="mm-muted text-xs">{cat.icon ?? 'pin'} · Inactive</p>
                </div>
                <button
                  type="button"
                  disabled={savingId === cat.id}
                  onClick={() => void setCategoryActive(cat, true)}
                  className="mm-btn-secondary rounded-lg px-2 py-1 text-xs font-bold"
                >
                  Reactivate
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="mm-btn-primary rounded-lg px-3 py-2 text-xs font-bold"
        >
          {showAddForm ? 'Cancel' : 'Add category'}
        </button>
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void onCreateDefaults()}
          className="mm-btn-secondary rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50"
        >
          {busy === 'defaults' ? 'Creating…' : 'Add default category set'}
        </button>
      </div>

      {showAddForm ? (
        <div className="mm-card space-y-3 rounded-2xl p-4">
          <p className="text-sm font-black">New category</p>
          <label className="block text-xs">
            <span className="mm-muted">Name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              placeholder="e.g. Sport"
            />
          </label>
          <div className="flex gap-3">
            <label className="block flex-1 text-xs">
              <span className="mm-muted">Colour</span>
              <input
                type="color"
                value={newColour}
                onChange={(e) => setNewColour(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/5"
              />
            </label>
            <label className="block flex-1 text-xs">
              <span className="mm-muted">Icon</span>
              <input
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                placeholder="pin"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={savingId === 'new'}
            onClick={() => void onAddCategory()}
            className="mm-btn-primary rounded-lg px-4 py-2 text-xs font-black disabled:opacity-50"
          >
            {savingId === 'new' ? 'Saving…' : 'Save category'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function CategoryCard({
  cat,
  editing,
  editDraft,
  saving,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDeactivate,
  onEditDraftChange,
}: {
  cat: MemoryCategory
  editing: boolean
  editDraft: EditDraft
  saving: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDeactivate: () => void
  onEditDraftChange: (draft: EditDraft) => void
}) {
  if (editing) {
    return (
      <div className="mm-card space-y-2 rounded-2xl p-3">
        <input
          value={editDraft.name}
          onChange={(e) => onEditDraftChange({ ...editDraft, name: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold"
        />
        <div className="flex gap-2">
          <input
            type="color"
            value={editDraft.colour}
            onChange={(e) => onEditDraftChange({ ...editDraft, colour: e.target.value })}
            className="h-9 w-14 rounded-lg border border-white/10 bg-white/5"
          />
          <input
            value={editDraft.icon}
            onChange={(e) => onEditDraftChange({ ...editDraft, icon: e.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="icon"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onSaveEdit}
            className="mm-btn-primary rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onCancelEdit} className="mm-btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mm-card flex items-center gap-3 rounded-2xl p-3">
      <span className="h-8 w-8 shrink-0 rounded-lg" style={{ backgroundColor: cat.colour }} />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{cat.name}</p>
        <p className="mm-muted text-xs">
          {cat.icon ?? 'pin'} · {cat.is_active ? 'Active' : 'Inactive'}
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button type="button" onClick={onStartEdit} className="mm-btn-secondary rounded-lg px-2 py-1 text-xs font-bold">
          Edit
        </button>
        {cat.name.toLowerCase() !== 'general' ? (
          <button
            type="button"
            disabled={saving}
            onClick={onDeactivate}
            className="rounded-lg px-2 py-1 text-xs font-bold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
          >
            Deactivate
          </button>
        ) : null}
      </div>
    </div>
  )
}
