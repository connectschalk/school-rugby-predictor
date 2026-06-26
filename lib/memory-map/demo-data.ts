import { DEMO_MAP_ID, DEMO_MAP_SLUG } from '@/lib/memory-map/constants'
import type { MemoryMapBundle } from '@/lib/memory-map/types'

/** In-memory demo bundle — mirrors migration seed for offline / pre-migration use. */
export const DEMO_MEMORY_MAP_BUNDLE: MemoryMapBundle = {
  map: {
    id: DEMO_MAP_ID,
    organisation_id: 'a1000000-0000-4000-8000-000000000001',
    title: 'Boishaai Memory Map',
    slug: DEMO_MAP_SLUG,
    tagline: 'Every place has a story.',
    description: 'A living archive of Boishaai rugby, hostel life, hall events and school history.',
    visibility: 'link_only',
    status: 'active',
    profile_image_url: null,
    landing_background_url: null,
    primary_color: '#FFD400',
    primary_text_color: '#050505',
    secondary_color: 'transparent',
    secondary_text_color: '#FFFFFF',
    accent_color: '#FFD400',
    sponsor_name: 'Standard Bank',
    sponsor_logo_url: null,
    sponsor_website_url: 'https://www.standardbank.co.za',
    sponsor_message: 'Proudly supporting school sport and heritage.',
    organisation: {
      id: 'a1000000-0000-4000-8000-000000000001',
      name: 'Boishaai',
      slug: 'boishaai',
      type: 'school',
      logo_url: null,
      description: 'Boishaai — demo organisation for NextPlay Memory Map.',
    },
  },
  categories: [
    { id: 'cat-sport', memory_map_id: DEMO_MAP_ID, name: 'Sport', description: null, icon: 'trophy', colour: '#A855F7', sort_order: 1, is_active: true },
    { id: 'cat-history', memory_map_id: DEMO_MAP_ID, name: 'History', description: null, icon: 'landmark', colour: '#3B82F6', sort_order: 2, is_active: true },
    { id: 'cat-hostel', memory_map_id: DEMO_MAP_ID, name: 'Hostel', description: null, icon: 'home', colour: '#22C55E', sort_order: 3, is_active: true },
    { id: 'cat-interviews', memory_map_id: DEMO_MAP_ID, name: 'Interviews', description: null, icon: 'mic', colour: '#EF4444', sort_order: 4, is_active: true },
    { id: 'cat-events', memory_map_id: DEMO_MAP_ID, name: 'Events', description: null, icon: 'calendar', colour: '#F97316', sort_order: 5, is_active: true },
    { id: 'cat-archive', memory_map_id: DEMO_MAP_ID, name: 'Archive', description: null, icon: 'archive', colour: '#9CA3AF', sort_order: 6, is_active: true },
  ],
  areas: [
    { id: 'area-campus', memory_map_id: DEMO_MAP_ID, name: 'Main Campus', description: 'The heart of the school.', map_type: 'geo', geofence_polygon: null, centre_lat: -33.9249, centre_lng: 18.4241, map_image_url: null, image_width: null, image_height: null, sort_order: 1, is_active: true, pin_count: 0, story_count: 0 },
    { id: 'area-field', memory_map_id: DEMO_MAP_ID, name: 'Main Rugby Field', description: 'Match day memories.', map_type: 'geo', geofence_polygon: null, centre_lat: -33.9255, centre_lng: 18.425, map_image_url: null, image_width: null, image_height: null, sort_order: 2, is_active: true, pin_count: 3, story_count: 3 },
    { id: 'area-hostel', memory_map_id: DEMO_MAP_ID, name: 'Hostel', description: 'Boarding life through the years.', map_type: 'image', geofence_polygon: null, centre_lat: null, centre_lng: null, map_image_url: null, image_width: 1200, image_height: 800, sort_order: 3, is_active: true, pin_count: 1, story_count: 2 },
    { id: 'area-hall', memory_map_id: DEMO_MAP_ID, name: 'School Hall', description: 'Assemblies and performances.', map_type: 'image', geofence_polygon: null, centre_lat: null, centre_lng: null, map_image_url: null, image_width: 1200, image_height: 800, sort_order: 4, is_active: true, pin_count: 1, story_count: 0 },
    { id: 'area-offsite', memory_map_id: DEMO_MAP_ID, name: 'Off-site Fields', description: 'Away grounds and training venues.', map_type: 'geo', geofence_polygon: null, centre_lat: -33.93, centre_lng: 18.43, map_image_url: null, image_width: null, image_height: null, sort_order: 5, is_active: true, pin_count: 0, story_count: 0 },
  ],
  pins: [
    { id: 'pin-scoreboard', area_id: 'area-field', category_id: 'cat-sport', title: 'Scoreboard Corner', description: 'Where unforgettable tries were celebrated.', icon: null, colour: '#A855F7', lat: -33.9256, lng: 18.4252, x_position: null, y_position: null, status: 'approved', is_official: true, story_count: 3 },
    { id: 'pin-pavilion', area_id: 'area-field', category_id: 'cat-history', title: 'Pavilion Steps', description: 'Old boys gather here after big matches.', icon: null, colour: '#3B82F6', lat: -33.9253, lng: 18.4248, x_position: null, y_position: null, status: 'approved', is_official: false, story_count: 1 },
    { id: 'pin-tunnel', area_id: 'area-field', category_id: 'cat-sport', title: 'Main Field Tunnel', description: 'The walk from the changeroom to the field.', icon: null, colour: '#A855F7', lat: -33.9254, lng: 18.4251, x_position: null, y_position: null, status: 'approved', is_official: false, story_count: 0 },
    { id: 'pin-hostel-hall', area_id: 'area-hostel', category_id: 'cat-hostel', title: 'Hostel Dining Hall', description: 'Meals, war cries and lifelong friendships.', icon: null, colour: '#22C55E', lat: null, lng: null, x_position: 42, y_position: 58, status: 'approved', is_official: false, story_count: 2 },
    { id: 'pin-stage', area_id: 'area-hall', category_id: 'cat-events', title: 'School Hall Stage', description: 'Assemblies, concerts and prize giving.', icon: null, colour: '#F97316', lat: null, lng: null, x_position: 55, y_position: 35, status: 'approved', is_official: true, story_count: 0 },
  ],
  stories: [
    { id: 'story-try-grey', pin_id: 'pin-scoreboard', title: 'Winning try vs Grey', description: 'The moment the crowd erupted in 2025.', story_type: 'video', event_year: 2025, event_date: null, uploaded_by: null, logged_by_display_name: 'Media Team', upload_mode: 'current_location', risk_level: 'low', status: 'approved', rejection_reason: null, tags: ['rugby'], media: [{ id: 'm1', story_id: 'story-try-grey', media_type: 'video', file_url: '/demo/memory-map/placeholder-video.jpg', thumbnail_url: '/demo/memory-map/placeholder-video.jpg', file_name: 'try.mp4', sort_order: 0 }] },
    { id: 'story-old-boys', pin_id: 'pin-scoreboard', title: 'Old boys remember the pavilion', description: 'Reunion stories from the class of 2018.', story_type: 'mixed', event_year: 2018, event_date: null, uploaded_by: null, logged_by_display_name: 'Old Boys Committee', upload_mode: 'archive_submission', risk_level: 'low', status: 'approved', rejection_reason: null, tags: ['reunion'], media: [] },
    { id: 'story-reunion-1998', pin_id: 'pin-scoreboard', title: 'First XV reunion story', description: 'Photos and memories from 1998.', story_type: 'mixed', event_year: 1998, event_date: null, uploaded_by: null, logged_by_display_name: 'Archive Team', upload_mode: 'archive_submission', risk_level: 'low', status: 'approved', rejection_reason: null, tags: [], media: [] },
    { id: 'story-hostel-2001', pin_id: 'pin-hostel-hall', title: 'Hostel life in 2001', description: 'A day in the hostel dining hall.', story_type: 'mixed', event_year: 2001, event_date: null, uploaded_by: null, logged_by_display_name: 'Parent Contributor', upload_mode: 'manual_image_map', risk_level: 'medium', status: 'pending_review', rejection_reason: null, tags: ['hostel'], media: [] },
    { id: 'story-war-cry', pin_id: 'pin-hostel-hall', title: 'Hostel war cry', description: 'The legendary hostel war cry on derby day.', story_type: 'video', event_year: 1998, event_date: null, uploaded_by: null, logged_by_display_name: 'Old Boy', upload_mode: 'archive_submission', risk_level: 'low', status: 'approved', rejection_reason: null, tags: ['hostel'], media: [] },
    { id: 'story-founders', pin_id: 'pin-pavilion', title: 'Founders Day Parade', description: 'Marching onto the pavilion steps.', story_type: 'photo', event_year: 2024, event_date: null, uploaded_by: null, logged_by_display_name: 'Teacher', upload_mode: 'manual_geo', risk_level: 'low', status: 'pending_review', rejection_reason: null, tags: [], media: [] },
  ],
  tags: [
    { id: 'tag-rugby', name: 'rugby' },
    { id: 'tag-hostel', name: 'hostel' },
    { id: 'tag-reunion', name: 'reunion' },
  ],
}

export function getDemoBundle(mapSlug?: string): MemoryMapBundle | null {
  if (!mapSlug || mapSlug === DEMO_MAP_SLUG) return DEMO_MEMORY_MAP_BUNDLE
  return null
}

export function enrichBundle(bundle: MemoryMapBundle): MemoryMapBundle {
  const categoryById = new Map(bundle.categories.map((c) => [c.id, c]))
  const pins = bundle.pins.map((pin) => ({
    ...pin,
    category: pin.category_id ? categoryById.get(pin.category_id) : undefined,
    story_count: bundle.stories.filter(
      (s) => s.pin_id === pin.id && (s.status === 'approved' || s.status === 'pending_review')
    ).length,
  }))
  const areas = bundle.areas.map((area) => {
    const areaPins = pins.filter((p) => p.area_id === area.id && p.status === 'approved')
    const storyCount = bundle.stories.filter(
      (s) => areaPins.some((p) => p.id === s.pin_id) && s.status === 'approved'
    ).length
    return { ...area, pin_count: areaPins.length, story_count: storyCount }
  })
  return { ...bundle, pins, areas }
}
