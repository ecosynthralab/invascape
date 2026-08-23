// FLORA-SE Nigeria — Firebase configuration
// -------------------------------------------------------------------
// Fill this in from: Firebase Console → tetfund-invasive-study →
// Project Settings (gear icon) → General tab → scroll to "Your apps"
// → if no web app exists yet, click the </> icon to create one →
// copy the firebaseConfig object it gives you and paste the values below.
// -------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCVlOq1SZs1LrF2-2EhgdSxfDzYqxmocns",
  authDomain: "invascape.firebaseapp.com",
  databaseURL: "https://invascape-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "invascape",
  storageBucket: "invascape.firebasestorage.app",
  messagingSenderId: "322884566855",
  appId: "1:322884566855:web:2b60f3a1722e041d851662"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const fbDb = firebase.database();
fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
