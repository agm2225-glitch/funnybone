'use server'

import { createClient } from '@/utils/supabase/server'

type Period = 'all' | 'year' | 'past30' | 'week'

export type PopularCaptionsOptions = {
  search?: string
  sort?: 'liked' | 'recent'
  humorFlavorId?: number | null
  categoryId?: number | null
}

export const fetchPopularCaptionsAction = async (
  limit = 100,
  period: Period = 'all',
  options: PopularCaptionsOptions = {}
) => {
  const { search, sort = 'liked', humorFlavorId = null, categoryId = null } = options
  const supabase = await createClient()

  // Only join the category mapping table when filtering by category
  const categoryJoin =
    categoryId !== null
      ? `, common_use_category_image_mappings!inner ( common_use_category_id )`
      : ''

  let query = supabase
    .from('captions')
    .select(
      `
      id,
      content,
      created_datetime_utc,
      image_id,
      like_count,
      humor_flavor_id,
      images!inner (
        id,
        url,
        is_common_use,
        is_public
        ${categoryJoin}
      )
    `
    )
    .eq('images.is_public', true)
    .eq('is_public', true)

  const term = search?.trim()
  if (term) {
    // Escape LIKE wildcards so "100%" or "a_b" are searched literally
    const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`)
    query = query.ilike('content', `%${escaped}%`)
  }

  if (humorFlavorId !== null) {
    query = query.eq('humor_flavor_id', humorFlavorId)
  }

  if (categoryId !== null) {
    query = query.eq(
      'images.common_use_category_image_mappings.common_use_category_id',
      categoryId
    )
  }

  if (sort === 'liked') {
    // Keep the original "popular" behavior, but don't hide zero-vote
    // captions when someone is searching
    if (!term) query = query.gt('like_count', 0)
    query = query
      .order('like_count', { ascending: false })
      .order('created_datetime_utc', { ascending: false })
  } else {
    query = query.order('created_datetime_utc', { ascending: false })
  }

  query = query.limit(limit)

  if (period !== 'all') {
    const now = new Date()
    const since = new Date(now)
    if (period === 'year') {
      since.setFullYear(now.getFullYear() - 1)
    } else if (period === 'past30') {
      since.setDate(now.getDate() - 30)
    } else if (period === 'week') {
      since.setDate(now.getDate() - 7)
    }
    query = query.gte('created_datetime_utc', since.toISOString())
  }

  const { data: captions, error } = await query

  if (error) {
    console.error('Error fetching popular captions:', error)
    throw new Error('Failed to fetch popular captions')
  }

  if (!captions) {
    return []
  }

  type PopularCaptionRow = {
    id: string
    content: string | null
    image_id: string | null
    like_count: number | null
    created_datetime_utc: string
    humor_flavor_id: number | null
    images?: {
      url?: string | null
      is_common_use?: boolean | null
      is_public?: boolean | null
    } | null
  }

  return (captions as unknown as PopularCaptionRow[]).map((caption) => ({
    id: caption.id,
    content: caption.content ?? '',
    image_id: caption.image_id ?? '',
    image_url: caption.images?.url ?? '',
    like_count: caption.like_count || 0,
    is_common_use: caption.images?.is_common_use ?? false,
    created_at: caption.created_datetime_utc,
    humor_flavor_id: caption.humor_flavor_id,
  }))
}