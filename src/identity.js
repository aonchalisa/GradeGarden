// A synthetic, reserved .invalid address lets Supabase handle password hashing,
// sessions and rate limits without treating usernames as verified real email.
export function usernameEmail(value) {
  const username = String(value).trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('invalid_username');
  return `${username}@users.gradegarden.invalid`;
}
