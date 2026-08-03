import "./lib/storagePolyfill";
import { AuthProvider } from "./lib/AuthProvider";
import AuthGate from "./AuthGate";

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

export default App;
