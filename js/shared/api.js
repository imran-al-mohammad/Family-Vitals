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

function isRlsError(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42501' || message.includes('row-level security');
}

export async function insertReading(supabase, row) {
  const first = await supabase.from('readings').insert(row);
  if (!first.error) return first.data;

  if (row.logged_by && /logged_by/i.test(first.error.message || '')) {
    const retry = { ...row };
    delete retry.logged_by;
    const second = await supabase.from('readings').insert(retry);
    if (!second.error) return second.data;
    throw second.error;
  }

  if (isRlsError(first.error) && row.user_id && row.user_id !== row.logged_by) {
    throw new Error(
      'Family members cannot log readings for each other yet. In the Supabase SQL editor, run supabase/migrations/202608150009_family_member_readings.sql, then try again.',
    );
  }

  throw first.error;
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

const MEMBER_COLUMNS =
  'id, full_name, avatar, email, family_id, is_super_admin, date_of_birth, age_years, weight_kg';

export async function fetchFamilyMembers(supabase, familyId) {
  if (!familyId) return [];
  const full = await supabase
    .from('profiles')
    .select(MEMBER_COLUMNS)
    .eq('family_id', familyId)
    .order('full_name', { ascending: true });
  if (!full.error) return full.data || [];

  if (!/date_of_birth|age_years|weight_kg/.test(full.error.message || '')) throw full.error;

  const basic = await supabase
    .from('profiles')
    .select('id, full_name, avatar, email, family_id, is_super_admin')
    .eq('family_id', familyId)
    .order('full_name', { ascending: true });
  if (basic.error) throw basic.error;
  return basic.data || [];
}

export async function updatePersonProfile(supabase, payload) {
  const { error } = await supabase.rpc('update_person_profile', {
    target_user: payload.userId,
    new_full_name: payload.fullName ?? null,
    new_email: payload.email ?? null,
    new_date_of_birth: payload.dateOfBirth ?? null,
    new_weight_kg: payload.weightKg ?? null,
    new_family: payload.familyId ?? null,
    set_family: Boolean(payload.setFamily),
    new_password: payload.password || null,
  });

  if (!error) return;

  if (isMissingRelation(error)) {
    throw new Error(
      'The profile editor is not installed. In the Supabase SQL editor, run supabase/migrations/202608150012_date_of_birth.sql, then try again.',
    );
  }
  throw error;
}

export async function updatePersonBodyStats(supabase, { userId, dateOfBirth, weightKg }) {
  const rpc = await supabase.rpc('update_person_body_stats', {
    target_user: userId,
    new_date_of_birth: dateOfBirth,
    new_weight_kg: weightKg,
  });
  if (!rpc.error) return rpc.data;

  if (!isMissingRelation(rpc.error)) throw rpc.error;

  const { error } = await supabase
    .from('profiles')
    .update({
      date_of_birth: dateOfBirth,
      weight_kg: weightKg,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (!error) return null;

  if (/date_of_birth|age_years|weight_kg/.test(error.message || '')) {
    throw new Error(
      'Date of birth is not installed. In the Supabase SQL editor, run supabase/migrations/202608150012_date_of_birth.sql, then try again.',
    );
  }
  throw error;
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

export async function adminCreateUser(supabase, { email, password, fullName, familyId, dateOfBirth, weightKg }) {
  const { data, error } = await supabase.rpc('admin_create_user', {
    user_email: String(email || '').trim(),
    user_password: String(password || ''),
    user_full_name: String(fullName || '').trim(),
    target_family: familyId || null,
  });

  if (!error) {
    if (dateOfBirth != null || weightKg != null) {
      try {
        await updatePersonBodyStats(supabase, { userId: data, dateOfBirth, weightKg });
      } catch {
        // Account exists even if body stats could not be saved yet.
      }
    }
    return data;
  }

  if (isMissingRelation(error)) {
    throw new Error(
      'The add-user function is not installed. In the Supabase SQL editor, run supabase/migrations/202608150008_admin_create_user.sql, then try again.',
    );
  }

  throw error;
}
