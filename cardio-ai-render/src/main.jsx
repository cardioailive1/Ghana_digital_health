import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./context/AuthContext.jsx";
import { RBACProvider } from "./context/RBACContext.jsx";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <RBACProvider>
        <App />
      </RBACProvider>
    </AuthProvider>
  </React.StrictMode>
);
