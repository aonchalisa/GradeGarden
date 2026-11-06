// Supabase enforces a minimum of six characters in its API. Four- and
// five-character user passwords use a stable, versioned SHA-256 representation
// before Supabase's normal password hashing. Existing 6+ passwords are unchanged.
export async function authPassword(password) {
  if (password.length < 4 || password.length >= 6) return password;
  const bytes = new TextEncoder().encode(`GradeGarden:short-password:v1\0${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'ggp1_' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
