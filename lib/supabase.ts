import { createClient } from '@supabase/supabase-js'

const supabaseUrl = https://jfiemxrgltfomycrzkjq.supabase.co
const supabaseAnonKey = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmaWVteHJnbHRmb215Y3J6a2pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDgwNDQsImV4cCI6MjA4ODQ4NDA0NH0.9yORruXI38Qbe7t5rwFjxt4zphFN7FSW_AWdj4JrGb4


export const supabase = createClient(supabaseUrl, supabaseAnonKey)