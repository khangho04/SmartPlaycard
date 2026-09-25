import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCMQP6u3PanNEZCzhFMMw5AwukFmW-Iq6w",
  authDomain: "rfid-001-270d9.firebaseapp.com",
  databaseURL:
    "https://rfid-001-270d9-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rfid-001-270d9",
  storageBucket: "rfid-001-270d9.firebasestorage.app",
  messagingSenderId: "865185690695",
  appId: "1:865185690695:web:73160086c7a4898ed26d62",
};

const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const database = getDatabase(app);

export default app;