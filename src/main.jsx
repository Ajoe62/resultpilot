import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import FirebaseSetupPage from "./components/FirebaseSetupPage";
import { AuthProvider } from "./context/AuthContext";
import { ExamSessionProvider } from "./context/ExamSessionContext";
import { getFirebaseEnvIssues, hasValidFirebaseEnv } from "./lib/env";
import "./index.css";

const firebaseEnvIssues = getFirebaseEnvIssues();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {hasValidFirebaseEnv() ? (
      <BrowserRouter>
        <AuthProvider>
          <ExamSessionProvider>
            <App />
          </ExamSessionProvider>
        </AuthProvider>
      </BrowserRouter>
    ) : (
      <FirebaseSetupPage issues={firebaseEnvIssues} />
    )}
  </React.StrictMode>,
);
