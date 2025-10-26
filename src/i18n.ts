import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      welcome: 'Welcome to Tamil Nadu Farming Assistant',
      selectLanguage: 'Choose Your Language',
      english: 'English',
      tamil: 'தமிழ்',
      loginWithGoogle: 'Login with Google',
      typeMessage: 'Type your farming question...',
      send: 'Send',
      recording: 'Recording...',
      tapToSpeak: 'Tap to Speak',
      uploadImage: 'Upload Image',
      askQuestion: 'Ask me anything about farming',
      logout: 'Logout',
      changeLanguage: 'Change Language',
      listening: 'Listening...',
      processing: 'Processing...',
    }
  },
  ta: {
    translation: {
      welcome: 'தமிழ்நாடு விவசாய உதவியாளருக்கு வரவேற்கிறோம்',
      selectLanguage: 'உங்கள் மொழியை தேர்வு செய்யுங்கள்',
      english: 'English',
      tamil: 'தமிழ்',
      loginWithGoogle: 'Google மூலம் உள்நுழைக',
      typeMessage: 'உங்கள் விவசாய கேள்வியை உள்ளிடவும்...',
      send: 'அனுப்பு',
      recording: 'பதிவு செய்கிறது...',
      tapToSpeak: 'பேச தட்டவும்',
      uploadImage: 'படத்தை பதிவேற்று',
      askQuestion: 'விவசாயம் பற்றி என்னிடம் கேளுங்கள்',
      logout: 'வெளியேறு',
      changeLanguage: 'மொழியை மாற்று',
      listening: 'கேட்கிறது...',
      processing: 'செயல்படுத்துகிறது...',
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
