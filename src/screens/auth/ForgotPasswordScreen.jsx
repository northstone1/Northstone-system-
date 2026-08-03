import { useState } from "react";
import { useAuth } from "../../lib/AuthProvider";
import { inputStyle } from "../../lib/brand";
import AuthShell, { labelStyle, errorStyle, noticeStyle, primaryButtonStyle, linksRowStyle, linkButtonStyle } from "./AuthShell";

export default function ForgotPasswordScreen({ onBack }) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || "Couldn't send that reset email");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle="Password reset">
        <div style={noticeStyle}>If an account exists for that email, a reset link is on its way.</div>
        <button type="button" onClick={onBack} style={primaryButtonStyle(false)}>
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a reset link">
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>
          Email
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginTop: 6 }}
          />
        </label>
        {error && <div style={errorStyle}>{error}</div>}
        <button type="submit" disabled={submitting} style={primaryButtonStyle(submitting)}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <div style={linksRowStyle}>
        <button type="button" onClick={onBack} style={linkButtonStyle}>
          Back to sign in
        </button>
      </div>
    </AuthShell>
  );
}
