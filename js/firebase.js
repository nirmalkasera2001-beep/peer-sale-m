const firebaseConfig = {
  apiKey: "AIzaSyAY71rgWRT7mOFaeJqVSUgis_iom8ITwuU",
  authDomain: "hostel-stuff-72cd3.firebaseapp.com",
  databaseURL: "https://hostel-stuff-72cd3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "hostel-stuff-72cd3",
  storageBucket: "hostel-stuff-72cd3.firebasestorage.app",
  messagingSenderId: "620499637183",
  appId: "1:620499637183:web:925ec1d5035191947e070a"
};

let db = null;
let isFirebaseActive = false;

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  isFirebaseActive = true;
  console.log("Firebase initialized from firebase.js");
} catch (err) {
  console.error("Firebase init error:", err);
}