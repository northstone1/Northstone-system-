import { AuthProvider } from "./lib/AuthProvider";
import AuthGate from "./AuthGate";
import ConfirmInviteScreen from "./screens/auth/ConfirmInviteScreen";

function App() {
  // Static path check, not a router — this is the one route in the app
  // that has to exist before we know who's signed in (it's how a brand
  // new client establishes their session in the first place).
  if (window.location.pathname === "/auth/confirm") {
    return <ConfirmInviteScreen />;
  }

  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

export default App;
