# Bill Split

A smart bill-splitting app that uses AI to analyze receipts and fairly distribute costs among friends.

🔗 **Live Demo:** [https://bill-split-lemon.vercel.app](https://bill-split-lemon.vercel.app)

## Features

- 🤖 **AI-Powered Receipt Analysis** - Upload a receipt photo and let Gemini AI extract items, tax, and tip automatically
  - Automatic image compression for faster processing (60-70% faster)
  - Optimized for mobile devices with lower data usage
  - Powered by Gemini 2.5 Flash-Lite for cost-efficient analysis
- ✍️ **Manual Bill Creation** - Create and manage bills from scratch without a receipt
- 👥 **Smart Splitting** - Assign items to people with proportional tax and tip distribution
- 💸 **Venmo Integration** - Generate Venmo payment requests with detailed item breakdowns
- 👤 **User Profiles** - Save your Venmo ID and manage a friends list for quick access
- 📱 **Responsive Design** - Optimized mobile and desktop experiences

## Tech Stack

### Frontend
- **React** with TypeScript
- **Vite** - Build tool and dev server
- **Capacitor** - Native iOS and Android app wrapper
- **TailwindCSS** - Styling
- **shadcn/ui** - UI component library
- **React Router** - Navigation

### Backend & Services
- **Firebase Cloud Functions** - Serverless backend for secure API calls
- **Firebase Authentication** - Google OAuth
- **Firebase Firestore** - User profiles and friends list storage
- **Google Gemini 2.5 Flash-Lite** - AI-powered receipt image analysis

### Platforms
- **Web** - Deployed on Vercel with continuous deployment
- **iOS** - Native iOS app via Capacitor
- **Android** - Native Android app via Capacitor

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (create `.env` file):
   ```
   VITE_GEMINI_API_KEY=your_gemini_api_key
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_sender_id
   VITE_FIREBASE_APP_ID=your_firebase_app_id
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

## Deployment

### Backend (Firebase Cloud Functions)

The backend uses Firebase Cloud Functions to securely handle Gemini AI API calls.

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Set up Gemini API Key as a secret**:
   ```bash
   firebase functions:secrets:set GEMINI_API_KEY
   ```
   Enter your Gemini API key when prompted.

4. **Deploy Cloud Functions**:
   ```bash
   cd functions
   npm install
   npm run deploy
   ```

   Or deploy just the `analyzeBill` function:
   ```bash
   firebase deploy --only functions:analyzeBill
   ```

5. **View logs** (optional):
   ```bash
   npm run logs
   ```

### Web Deployment

The web app is deployed on Vercel. Push to the main branch to trigger automatic deployment.

### iOS Build

**Prerequisites:**
- macOS with Xcode installed
- Apple Developer account
- CocoaPods installed (`sudo gem install cocoapods`)

**Build steps:**

1. **Build the web app**:
   ```bash
   npm run build
   ```

2. **Sync with Capacitor**:
   ```bash
   npx cap sync ios
   ```

3. **Open in Xcode**:
   ```bash
   npm run cap:ios
   ```
   Or manually:
   ```bash
   npx cap open ios
   ```

4. **Install native dependencies** (if needed):
   ```bash
   cd ios/App
   pod install
   cd ../..
   ```

5. **In Xcode**:
   - Select your development team
   - Update bundle identifier if needed
   - Select target device or simulator
   - Click "Run" to build and test
   - For App Store: Product → Archive → Distribute

**Quick build command:**
```bash
npm run ios
```

### Android Build

**Prerequisites:**
- Android Studio installed
- JDK 17 or higher
- Android SDK configured

**Build steps:**

1. **Build the web app**:
   ```bash
   npm run build
   ```

2. **Sync with Capacitor**:
   ```bash
   npx cap sync android
   ```

3. **Open in Android Studio**:
   ```bash
   npm run cap:android
   ```
   Or manually:
   ```bash
   npx cap open android
   ```

4. **In Android Studio**:
   - Wait for Gradle sync to complete
   - Select device/emulator
   - Click "Run" to build and test
   - For Play Store: Build → Generate Signed Bundle/APK

**Quick build command:**
```bash
npm run android
```

**Build APK for testing:**
In Android Studio:
- Build → Build Bundle(s) / APK(s) → Build APK(s)
- APK will be in `android/app/build/outputs/apk/debug/`

## How It Works

1. **Upload or Create** - Upload a receipt photo for AI analysis or manually create a bill
2. **Add People** - Add friends to the bill (with optional Venmo IDs)
3. **Assign Items** - Click on people badges to assign items (supports splitting items)
4. **View Split** - See exactly how much each person owes with tax and tip included
5. **Charge on Venmo** - Send payment requests directly through Venmo with itemized descriptions
