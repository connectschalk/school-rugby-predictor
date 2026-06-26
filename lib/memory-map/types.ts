export type OrganisationType = 'school' | 'event' | 'venue' | 'club' | 'community'
export type MapVisibility = 'private' | 'link_only' | 'public'
export type MapStatus = 'draft' | 'active' | 'archived'
export type AreaMapType = 'geo' | 'image'
export type MemberRole = 'admin' | 'moderator' | 'contributor' | 'viewer'
export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type PinStatus = 'pending' | 'approved' | 'hidden' | 'archived' | 'deleted'
export type StoryType = 'video' | 'photo' | 'text' | 'mixed'
export type StoryStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'hidden'
  | 'archived'
  | 'deleted'
export type RiskLevel = 'low' | 'medium' | 'high' | 'admin_review'
export type UploadMode =
  | 'current_location'
  | 'manual_geo'
  | 'manual_image_map'
  | 'archive_submission'

export type MemoryOrganisation = {
  id: string
  name: string
  slug: string
  type: OrganisationType
  logo_url: string | null
  description: string | null
}

export type MemoryMapBranding = {
  primary_color: string
  primary_text_color: string
  secondary_color: string
  secondary_text_color: string
  accent_color: string
  profile_image_url: string | null
  landing_background_url: string | null
}

export type MemoryMap = MemoryMapBranding & {
  id: string
  organisation_id: string
  title: string
  slug: string
  tagline: string | null
  description: string | null
  visibility: MapVisibility
  status: MapStatus
  sponsor_name: string | null
  sponsor_logo_url: string | null
  sponsor_website_url: string | null
  sponsor_message: string | null
  organisation?: MemoryOrganisation
}

export type MemoryArea = {
  id: string
  memory_map_id: string
  name: string
  description: string | null
  map_type: AreaMapType
  geofence_polygon: unknown | null
  centre_lat: number | null
  centre_lng: number | null
  map_image_url: string | null
  image_width: number | null
  image_height: number | null
  sort_order: number
  is_active: boolean
  pin_count?: number
  story_count?: number
}

export type MemoryCategory = {
  id: string
  memory_map_id: string
  name: string
  description: string | null
  icon: string | null
  colour: string
  sort_order: number
  is_active: boolean
}

export type MemoryPin = {
  id: string
  area_id: string
  category_id: string | null
  title: string
  description: string | null
  icon: string | null
  colour: string | null
  lat: number | null
  lng: number | null
  x_position: number | null
  y_position: number | null
  status: PinStatus
  is_official: boolean
  story_count?: number
  category?: MemoryCategory
}

export type MemoryStoryMedia = {
  id: string
  story_id: string
  media_type: 'video' | 'image'
  file_url: string
  thumbnail_url: string | null
  file_name: string | null
  sort_order: number
}

export type MemoryStory = {
  id: string
  pin_id: string
  title: string
  description: string | null
  story_type: StoryType
  event_year: number
  event_date: string | null
  uploaded_by: string | null
  logged_by_display_name: string | null
  upload_mode: UploadMode
  risk_level: RiskLevel
  status: StoryStatus
  rejection_reason: string | null
  tags?: string[]
  media?: MemoryStoryMedia[]
}

export type MemoryMapBundle = {
  map: MemoryMap
  areas: MemoryArea[]
  categories: MemoryCategory[]
  pins: MemoryPin[]
  stories: MemoryStory[]
  tags: { id: string; name: string }[]
}

export type AdminTab =
  | 'overview'
  | 'pending'
  | 'published'
  | 'pins'
  | 'areas'
  | 'contributors'
  | 'categories'
  | 'branding'
  | 'sponsor'
  | 'share'
  | 'audit'
