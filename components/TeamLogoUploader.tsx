'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Team = {
  id: number
  name: string
  logo_url?: string | null
}

export default function TeamLogoUploader() {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadTeams() {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, logo_url')
        .order('name')

      if (error) {
        setMessage(`Could not load teams: ${error.message}`)
        return
      }

      setTeams((data as Team[]) || [])
    }

    loadTeams()
  }, [])

  async function handleUpload() {
    setMessage('')

    if (!selectedTeamId) {
      setMessage('Please choose a team.')
      return
    }

    if (!selectedFile) {
      setMessage('Please choose a PNG file.')
      return
    }

    if (selectedFile.type !== 'image/png') {
      setMessage('Only PNG files are allowed.')
      return
    }

    setUploading(true)

    try {
      const teamId = Number(selectedTeamId)
      const filePath = `${teamId}.png`

      const { error: uploadError } = await supabase.storage
        .from('team-logos')
        .upload(filePath, selectedFile, {
          upsert: true,
          contentType: 'image/png',
        })

      if (uploadError) {
        throw uploadError
      }

      const { data: publicUrlData } = supabase.storage
        .from('team-logos')
        .getPublicUrl(filePath)

      const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`

      const { error: updateError } = await supabase
        .from('teams')
        .update({ logo_url: publicUrl })
        .eq('id', teamId)

      if (updateError) {
        throw updateError
      }

      setTeams((prev) =>
        prev.map((team) =>
          team.id === teamId ? { ...team, logo_url: publicUrl } : team
        )
      )

      setMessage('Logo uploaded successfully.')
      setSelectedFile(null)

      const fileInput = document.getElementById('team-logo-file') as HTMLInputElement | null
      if (fileInput) fileInput.value = ''
    } catch (err: any) {
      setMessage(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const selectedTeam = teams.find((team) => String(team.id) === selectedTeamId)

  return (
    <div className="mt-8 rounded-2xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-2xl font-semibold">Upload Team Logo</h2>
      <p className="mt-2 text-gray-600">
        Choose a team, upload a PNG, and replace the existing logo if one already exists.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium">Team</label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          >
            <option value="">Choose team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">PNG file</label>
          <input
            id="team-logo-file"
            type="file"
            accept="image/png"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </div>
      </div>

      {selectedTeam && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="font-medium">{selectedTeam.name}</p>
          {selectedTeam.logo_url ? (
            <div className="mt-3">
              <p className="mb-2 text-sm text-gray-600">Current logo</p>
              <img
                src={selectedTeam.logo_url}
                alt={`${selectedTeam.name} logo`}
                className="h-24 w-24 rounded-lg border border-gray-200 bg-white object-contain p-1"
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">No logo uploaded yet.</p>
          )}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={uploading}
        className="mt-6 rounded-xl bg-black px-5 py-3 text-white hover:opacity-90 disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : 'Upload / Replace Logo'}
      </button>

      {message && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
          {message}
        </div>
      )}
    </div>
  )
}