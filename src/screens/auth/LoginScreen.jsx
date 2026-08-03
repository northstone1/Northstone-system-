import { useState } from "react";
import { useAuth } from "../../lib/AuthProvider";
import { inputStyle } from "../../lib/brand";
import AuthShell, { labelStyle, errorStyle, primaryButtonStyle, linksRowStyle, linkButtonStyle } from "./AuthShell";

export default function LoginScreen({ onSignUp, onForgot }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message || "Couldn't sign in — check your email and password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Northstone Design & Build">
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
        <label style={{ ...labelStyle, marginTop: 14 }}>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginTop: 6 }}
          />
        </label>
        {error && <div style={errorStyle}>{error}</div>}
        <button type="submit" disabled={submitting} style={primaryButtonStyle(submitting)}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div style={linksRowStyle}>
        <button type="button" onClick={onForgot} style={linkButtonStyle}>
          Forgot password?
        </button>
        <button type="button" onClick={onSignUp} style={linkButtonStyle}>
          Client? Create an account
        </button>
      </div>
    </AuthShell>
  );
}
