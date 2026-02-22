import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

// The firebase config from the project
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyB-fake-key", // The SDK doesn't strictly need a real API key just to list docs if auth is bypassed, but we'll try to load from process.env if possible. Wait, local Node doesn't have VITE_.
    projectId: "divit-6d217",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkBalances() {
    console.log("Checking friend_balances...");
    try {
        const snap = await getDocs(collection(db, "friend_balances"));
        if (snap.empty) {
            console.log("Collection is EMPTY.");
        } else {
            console.log(`Found ${snap.size} documents:`);
            snap.forEach(doc => {
                console.log(doc.id, "=>", doc.data());
            });
        }
    } catch (error) {
        console.error("Error fetching friend_balances:", error);
    }
}

checkBalances().then(() => process.exit(0));
