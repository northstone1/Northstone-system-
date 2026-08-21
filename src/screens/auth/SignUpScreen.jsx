import { useState } from "react";
import { useAuth } from "../../lib/AuthProvider";
import { inputStyle, FOREST } from "../../lib/brand";
import AuthShell, { labelStyle, errorStyle, noticeStyle, primaryButtonStyle, linksRowStyle, linkButtonStyle } from "./AuthShell";

export default function SignUpScreen({ onBack }) {
  const { signUpClient } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!consent) {
      setError("Please confirm you agree to Northstone storing your details before continuing");
      return;
    }
    setSubmitting(true);
    try {
      const result = await signUpClient(email.trim(), password, fullName.trim());
      setDone(result);
    } catch (err) {
      setError(err.message || "Couldn't create your account");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Check your email" subtitle="Northstone client portal">
        <div style={noticeStyle}>
          {done.needsEmailConfirmation
            ? "We've sent a confirmation link to your email. Click it, then sign in below."
            : "Account created — you can sign in now."}
        </div>
        <button type="button" onClick={onBack} style={primaryButtonStyle(false)}>
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="For clients tracking a Northstone project">
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>
          Full name
          <input
            required
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginTop: 6 }}
          />
        </label>
        <label style={{ ...labelStyle, marginTop: 14 }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginTop: 6 }}
          />
        </label>
        <label style={{ ...labelStyle, marginTop: 14 }}>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginTop: 6 }}
          />
        </label>
        <div style={{ marginTop: 16, padding: "10px 12px", background: "#f6f4ee", borderRadius: 7, fontSize: 11.5, color: "#6b6a63", lineHeight: 1.5 }}>
          We store your name, email, address, project details and any project photos so we can manage and deliver
          your project. This information is only used for that purpose and isn't shared with third parties.
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, accentColor: FOREST, flexShrink: 0 }}
          />
          <span style={{ fontSize: 12.5, color: "#333", lineHeight: 1.4 }}>
            I agree to Northstone Design & Build storing my details to manage my project
          </span>
        </label>
        {error && <div style={errorStyle}>{error}</div>}
        <button type="submit" disabled={submitting || !consent} style={primaryButtonStyle(submitting || !consent)}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <div style={linksRowStyle}>
        <button type="button" onClick={onBack} style={linkButtonStyle}>
          Already have an account? Sign in
        </button>
      </div>
      <div style={{ fontSize: 11, color: "#8a887f", marginTop: 16, lineHeight: 1.5 }}>
        Once you've signed up, let your Northstone contact know so they can link your account to your project.
      </div>
    </AuthShell>
  );
}
