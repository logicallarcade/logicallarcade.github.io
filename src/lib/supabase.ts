import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xoopahkzmfibfnxzmqfk.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_pSbbyCzo8R0oPeyK_xwGtg_C81049id'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export { SUPABASE_URL, SUPABASE_ANON_KEY }
