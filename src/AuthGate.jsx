import { useState } from "react";
import { useAuth } from "./lib/AuthProvider";
import { PARCHMENT, INK } from "./lib/brand";
import LoginScreen from "./screens/auth/LoginScreen";
import SignUpScreen from "./screens/auth/SignUpScreen";
import ForgotPasswordScreen from "./screens/auth/ForgotPasswordScreen";
import ResetPasswordScreen from "./screens/auth/ResetPasswordScreen";
import NorthstoneSystem from "./NorthstoneSystem";

function CenteredMessage({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: PARCHMENT,
        color: INK,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

export default function AuthGate() {
  const { session, profile, loading, isPasswordRecovery } = useAuth();
  const [authScreen, setAuthScreen] = useState("login"); // login | signup | forgot

  if (loading) return <CenteredMessage>Loading…</CenteredMessage>;

  if (isPasswordRecovery) return <ResetPasswordScreen />;

  if (!session) {
    if (authScreen === "signup") return <SignUpScreen onBack={() => setAuthScreen("login")} />;
    if (authScreen === "forgot") return <ForgotPasswordScreen onBack={() => setAuthScreen("login")} />;
    return <LoginScreen onSignUp={() => setAuthScreen("signup")} onForgot={() => setAuthScreen("forgot")} />;
  }

  // Signed in, but the profiles row (created by a DB trigger on signup)
  // hasn't loaded yet.
  if (!profile) return <CenteredMessage>Setting up your account…</CenteredMessage>;

  return <NorthstoneSystem />;
}
