import { useState } from "react";
import { useAuth } from "../../lib/AuthProvider";
import { inputStyle } from "../../lib/brand";
import AuthShell, { labelStyle, errorStyle, noticeStyle, primaryButtonStyle } from "./AuthShell";

// Reached via the link Supabase emails from requestPasswordReset(). Landing
// here establishes a temporary recovery session (see AuthProvider's
// PASSWORD_RECOVERY handling) which updatePassword() then upgrades to a
// normal one — AuthGate swaps this screen out for the real app as soon as
// isPasswordRecovery clears.
export default function ResetPasswordScreen() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err.message || "Couldn't update your password");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You're all set">
        <div style={noticeStyle}>Your password has been changed.</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>
          New password
          <input
            type="password"
            required
            minLength={8}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginTop: 6 }}
          />
        </label>
        {error && <div style={errorStyle}>{error}</div>}
        <button type="submit" disabled={submitting} style={primaryButtonStyle(submitting)}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}
