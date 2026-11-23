'use server'

import { createClient } from '@/utils/supabase/server'

export type HumorFlavorOption = { id: number; slug: string; is_pinned: boolean }

export const fetchHumorFlavorsAction = async (): Promise<HumorFlavorOption[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('humor_flavors')
    .select('id, slug, is_pinned')
    .order('is_pinned', { ascending: false })
    .order('slug', { ascending: true })

  if (error) {
    console.error('Error fetching humor flavors:', error)
    return []
  }
  return data ?? []
}