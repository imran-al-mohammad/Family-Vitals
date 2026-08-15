export function isMissingRelation(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.code === 'PGRST202' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    message.includes('could not find the function')
  );
}

export function setupErrorMessage(error) {
  if (isMissingRelation(error)) {
    return 'The database is not set up yet. Apply the SQL files in supabase/migrations to your Supabase project, then refresh.';
  }
  return error?.message || 'Something went wrong.';
}

export async function ensureProfile(supabase, user) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const row = {
    id: user.id,
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
    email: user.email || null,
  };

  const firstTry = await supabase.from('profiles').insert(row).select('*').single();
  if (!firstTry.error) return firstTry.data;

  if (/email/i.test(firstTry.error.message || '')) {
    delete row.email;
    const retry = await supabase.from('profiles').insert(row).select('*').single();
    if (retry.error) throw retry.error;
    return retry.data;
  }

  throw firstTry.error;
}

export async function fetchRegistrationEnabled(supabase) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'registration_enabled')
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return true;
    throw error;
  }
  if (!data) return true;
  return data.value !== 'false';
}

export async function fetchReadingsForUsers(supabase, userIds, limit = 200) {
  if (!userIds?.length) return [];
  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchFamilyMembers(supabase, familyId) {
  if (!familyId) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar, email, family_id, is_super_admin')
    .eq('family_id', familyId)
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createFamilyForUser(supabase, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Family name is required.');

  const rpc = await supabase.rpc('create_family_for_current_user', {
    family_name: trimmed,
  });
  if (!rpc.error) return rpc.data;

  if (!isMissingRelation(rpc.error)) throw rpc.error;

  const { data: family, error: familyError } = await supabase
    .from('families')
    .insert({ name: trimmed })
    .select('id')
    .single();
  if (familyError) throw familyError;

  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData?.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ family_id: family.id })
    .eq('id', userId);
  if (profileError) throw profileError;

  const { error: memberError } = await supabase
    .from('family_members')
    .insert({ user_id: userId, family_id: family.id, role: 'admin' });
  if (memberError && memberError.code !== '23505') throw memberError;

  return family.id;
}
