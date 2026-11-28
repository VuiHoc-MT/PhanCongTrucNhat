import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, update, get, onValue, push, remove, query, orderByChild, limitToLast, serverTimestamp, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInAnonymously, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDeO2BkAXLVRUG5tW2uOX1aQ3VIPSAmobE",
  authDomain: "web-lop-35a2d.firebaseapp.com",
  databaseURL: "https://web-lop-35a2d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "web-lop-35a2d",
  storageBucket: "web-lop-35a2d.appspot.com",
  messagingSenderId: "977812003616",
  appId: "1:977812003616:web:56a37856a1745a55891545"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

export const classesRef = ref(db, "trucNhatLop/classes");
export const currentClassRef = ref(db, "trucNhatLop/currentClassId");
export const chatRef = ref(db, "trucNhatLop/chatMessages");
export const guestsRef = ref(db, "trucNhatLop/guests");
export const postsRef = ref(db, "trucNhatLop/posts");
export const accessRequestsRef = ref(db, "accessRequests");

export {
  ref, set, update, get, onValue, push, remove, query, orderByChild, limitToLast, serverTimestamp, onDisconnect,
  signInWithPopup, signInWithRedirect, getRedirectResult, signInAnonymously, signOut, onAuthStateChanged
};
