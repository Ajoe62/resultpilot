const REQUIRED_FIREBASE_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const PLACEHOLDER_VALUES = new Set([
  "your-api-key",
  "your-project.firebaseapp.com",
  "your-project-id",
  "your-project.firebasestorage.app",
  "your-messaging-sender-id",
  "your-app-id",
]);

export function getFirebaseEnvIssues(env = import.meta.env) {
  return REQUIRED_FIREBASE_ENV_KEYS.filter((key) => {
    const value = env[key];

    return !value || PLACEHOLDER_VALUES.has(value.trim());
  });
}

export function hasValidFirebaseEnv(env = import.meta.env) {
  return getFirebaseEnvIssues(env).length === 0;
}

export { REQUIRED_FIREBASE_ENV_KEYS };
