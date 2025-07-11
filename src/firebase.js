// firebase.js
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDlT5sCVMBZSWqYTu9hhstp4Fr7N66SWss",
  authDomain: "faceattendancerealtime-fbdf2.firebaseapp.com",
  databaseURL: "https://faceattendancerealtime-fbdf2-default-rtdb.firebaseio.com",
  projectId: "faceattendancerealtime-fbdf2",
  storageBucket: "faceattendancerealtime-fbdf2.appspot.com",
  messagingSenderId: "338410759674",
  appId: "1:338410759674:web:c6820d269c0029128a3043",
  measurementId: "G-NQDD7MCT09"
};
const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
