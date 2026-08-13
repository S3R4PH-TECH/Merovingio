/**
 * Mirrors backend-gateway's `validate_password` (app/schema.py) exactly.
 *
 * It lives here rather than beside either screen because two of them show it —
 * signup and the profile page's password change — and the gateway enforces one
 * set of rules for both. A copy per screen is how the two drift apart until a
 * password the form accepts comes back as a 422.
 *
 * There is no minimum length: the 12-character floor was removed from the
 * gateway, and advertising a rule the server does not enforce is a lie to the
 * user in the one direction that costs them a password they liked.
 */
export interface PasswordRule {
  label: string;
  met: boolean;
}

export function checkPasswordRules(password: string): PasswordRule[] {
  const bytes = new TextEncoder().encode(password).length;

  return [
    { label: 'Contains a letter', met: /[a-zA-Z]/.test(password) },
    { label: 'Contains a digit', met: /\d/.test(password) },
    // bcrypt truncates past 72 bytes; the gateway rejects longer rather than
    // letting the extra characters silently count for nothing.
    { label: 'At most 72 bytes', met: bytes > 0 && bytes <= 72 },
  ];
}
