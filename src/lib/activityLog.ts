import { supabase } from './supabase'

export async function logActivity(description: string) {
  await supabase.from('admin_activity_log').insert({ description })
}
