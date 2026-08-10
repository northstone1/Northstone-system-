import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { inputStyle } from "../../lib/brand";
import AuthShell, { labelStyle, errorStyle, noticeStyle, primaryButtonStyle } from "./AuthShell";

// Reached via the link in a client's invite email — NOT the automatic
// detectSessionInUrl flow the rest of the app relies on (see AuthProvider's
// PASSWORD_RECOVERY handling for that one). This route reads token_hash +
// type as plain query params and only calls verifyOtp() on an explicit tap,
// which only works if the Supabase "Invite user" email template links here
// directly with those params rather than the default {{ .ConfirmationURL }}
// (which verifies server-side and redirects with tokens already exchanged).
// See README's "Deploying the invite-client Edge Function" section.
export default function ConfirmInviteScreen() {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  const [stage, setStage] = useState(tokenHash && type ? "confirm" : "invalid"); // invalid | confirm | verifying | setPassword | success
  const [verifyError, setVerifyError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setStage("verifying");
    setVerifyError("");
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      setVerifyError(error.message || "This link has expired or already been used — ask Northstone to send you a new invite.");
      setStage("confirm");
      return;
    }
    setStage("setPassword");
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setPasswordError("");
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setPasswordError(error.message || "Couldn't set your password — try again");
      return;
    }
    setStage("success");
    setTimeout(() => {
      window.location.href = "/";
    }, 1800);
  };

  if (stage === "invalid") {
    return (
      <AuthShell title="Invalid link" subtitle="Northstone client portal">
        <div style={errorStyle}>
          This link looks incomplete — make sure you opened the full link from your invite email rather than a
          shortened or partial copy of it.
        </div>
        <a
          href="/"
          style={{ ...primaryButtonStyle(false), display: "block", boxSizing: "border-box", textAlign: "center", textDecoration: "none" }}
        >
          Back to sign in
        </a>
      </AuthShell>
    );
  }

  if (stage === "success") {
    return (
      <AuthShell title="You're all set" subtitle="Northstone client portal">
        <div style={noticeStyle}>Your password is set — taking you to your portal…</div>
      </AuthShell>
    );
  }

  if (stage === "setPassword") {
    return (
      <AuthShell title="Set your password" subtitle="Almost done — choose a password for your account">
        <form onSubmit={handleSetPassword}>
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
          <label style={{ ...labelStyle, marginTop: 14 }}>
            Confirm password
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ ...inputStyle, width: "100%", marginTop: 6 }}
            />
          </label>
          {passwordError && <div style={errorStyle}>{passwordError}</div>}
          <button type="submit" disabled={submitting} style={primaryButtonStyle(submitting)}>
            {submitting ? "Setting password…" : "Set password & continue"}
          </button>
        </form>
      </AuthShell>
    );
  }

  // stage === "confirm" | "verifying"
  return (
    <AuthShell title="Welcome to Northstone" subtitle="You've been invited to your project portal">
      <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
        Tap below to confirm this invite and set up your account.
      </div>
      {verifyError && <div style={errorStyle}>{verifyError}</div>}
      <button type="button" disabled={stage === "verifying"} onClick={handleConfirm} style={primaryButtonStyle(stage === "verifying")}>
        {stage === "verifying" ? "Confirming…" : "Set up my account"}
      </button>
    </AuthShell>
  );
}
