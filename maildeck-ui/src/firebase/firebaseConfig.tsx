import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
const firebaseApp = initializeApp({
  apiKey: 'AIzaSyDQhSoq1kB8q5iXXTSWQlFaZ5dh36buap4',
  projectId: 'maildeck-e3e14',
  messagingSenderId: '382498780419',
  appId: '1:382498780419:web:a42a0bdbad6b4c3ecde536',
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
export const messaging = getMessaging(firebaseApp);