import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCElkgTv9krB-cFleFV5ySuS_F45cVqao0",
  authDomain: "sterling-mutual-insurance.firebaseapp.com",
  projectId: "sterling-mutual-insurance",
  storageBucket: "sterling-mutual-insurance.firebasestorage.app",
  messagingSenderId: "863681721493",
  appId: "1:863681721493:web:fbe3ee5909599f146d179c"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
