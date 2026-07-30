// Copy this file to config.js and fill in your own values.
// config.js is gitignored — it's local per-deployment config, never committed
// (same reasoning as .env for the backend, see README).
window.APP_CONFIG = {
  // Firebase project config from Firebase Console > Project Settings > General
  // > Your apps > SDK setup and configuration.
  firebase: {
    apiKey: "REPLACE_ME",
    authDomain: "REPLACE_ME.firebaseapp.com",
    projectId: "REPLACE_ME",
    storageBucket: "REPLACE_ME.appspot.com",
    messagingSenderId: "REPLACE_ME",
    appId: "REPLACE_ME",
  },
  // Firebase Console > App Check > Apps > (your web app) > reCAPTCHA v3 site key.
  // Placeholder until App Check is provisioned — see README "App Check setup".
  appCheckSiteKey: "REPLACE_ME_RECAPTCHA_V3_SITE_KEY",
  // Leave empty ("") to call same-origin (Firebase Hosting rewrites handle
  // /directorio, /coverage, /correcciones). Only set this if testing against
  // the local emulator directly without Hosting in front, e.g.:
  // "http://127.0.0.1:5001/<project-id>/us-central1"
  apiBaseUrl: "",
};
