import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      // Authentication & Welcome
      welcome: 'Welcome to Tamil Nadu Farming Assistant',
      selectLanguage: 'Choose Your Language',
      loginWithGoogle: 'Login with Google',
      askQuestion: 'Ask me anything about farming',
      logout: 'Logout',
      
      // Languages
      english: 'English',
      tamil: 'தமிழ்',
      changeLanguage: 'Change Language',
      
      // Chat Interface
      typeMessage: 'Type your farming question...',
      send: 'Send',
      recording: 'Recording...',
      tapToSpeak: 'Tap to Speak',
      uploadImage: 'Upload Image',
      listening: 'Listening...',
      processing: 'Processing...',
      newChat: 'New Chat',
      noChats: 'No chats yet',
      deleteChat: 'Delete chat',
      clearAllChats: 'Clear All Chats',
      chat: 'Chat',
      appTitle: 'Tamil Nadu Farming Assistant',
speak: 'Speak',
stop: 'Stop',
micError: 'Microphone error',

      // Add to English section - Toast Messages
chatCreated: 'New chat created successfully!',
chatCreateFailed: 'Failed to create new chat',
chatDeleted: 'Chat deleted successfully!',
allDeleted: 'All chats cleared successfully!',
      
      // Confirmation Dialogs
      deleteConfirm: 'Are you sure you want to delete this chat?',
      deleteAllConfirm: 'Are you sure you want to delete ALL chats? This action cannot be undone.',
      allDeletedConfirm: 'All chats have been deleted successfully!',
      deleteFailed: 'Failed to delete all chats. Please try again.',
      
      // System Messages
      imageUploaded: 'Image uploaded',
      playAudio: 'Play audio',
      serverError: 'Server error. Please try again.',
      networkError: 'Network error. Please check your connection.',
      noResponse: 'No response received from server.',
      
      // Common Farming Questions (for suggestions)
      cropSuggestions: 'What crops are suitable for this season?',
      pestControl: 'How to control pests in paddy fields?',
      fertilizerQuestion: 'What fertilizer should I use for vegetables?', // CHANGED: Added "Question"
      irrigationQuestion: 'What is the best irrigation method?', // CHANGED: Added "Question"
      weather: 'How will the weather affect my crops?',
      soilTesting: 'How to test soil quality?',
      organicFarming: 'Tell me about organic farming methods',
      marketPrices: 'What are the current market prices?',
      
      // Button Labels
      continue: 'Continue',
      cancel: 'Cancel',
      confirm: 'Confirm',
      delete: 'Delete',
      save: 'Save',
      edit: 'Edit',
      search: 'Search',
      filter: 'Filter',
      refresh: 'Refresh',
      loading: 'Loading...',
      
      // Navigation
      home: 'Home',
      profile: 'Profile',
      settings: 'Settings',
      history: 'Chat History',
      help: 'Help',
      about: 'About',
      
      // Error Messages
      error: 'Error',
      tryAgain: 'Please try again',
      connectionError: 'Connection error',
      authenticationError: 'Authentication failed',
      
      // Success Messages
      success: 'Success',
      saved: 'Saved successfully',
      updated: 'Updated successfully',
      deleted: 'Deleted successfully',
      
      // Placeholders
      searchPlaceholder: 'Search farming topics...',
      namePlaceholder: 'Enter your name',
      emailPlaceholder: 'Enter your email',
      
      // Time & Date
      today: 'Today',
      yesterday: 'Yesterday',
      lastWeek: 'Last Week',
      older: 'Older',
      
      // Chat Status
      online: 'Online',
      offline: 'Offline',
      typing: 'Typing...',
      
      // Farming Specific Terms
      crops: 'Crops',
      vegetables: 'Vegetables',
      fruits: 'Fruits',
      grains: 'Grains',
      livestock: 'Livestock',
      poultry: 'Poultry',
      irrigation: 'Irrigation', // KEEP ONLY ONE
      harvest: 'Harvest',
      sowing: 'Sowing',
      planting: 'Planting',
      fertilizer: 'Fertilizer', // KEEP ONLY ONE
      pesticide: 'Pesticide',
      organic: 'Organic',
      soil: 'Soil',
      water: 'Water',
      climate: 'Climate',
      
      // Months & Seasons
      january: 'January',
      february: 'February',
      march: 'March',
      april: 'April',
      may: 'May',
      june: 'June',
      july: 'July',
      august: 'August',
      september: 'September',
      october: 'October',
      november: 'November',
      december: 'December',
      summer: 'Summer',
      winter: 'Winter',
      monsoon: 'Monsoon',
      spring: 'Spring',
      
      // Measurements
      acre: 'Acre',
      hectare: 'Hectare',
      kilogram: 'Kilogram',
      quintal: 'Quintal',
      liter: 'Liter',
      
      // AI Responses (Common phrases)
      greeting: 'Hello! I am your farming assistant. How can I help you today?',
      thanks: 'Thank you for using our farming assistant!',
      followUp: 'Do you have any other farming questions?',
      notUnderstood: 'I am not sure I understand. Could you please rephrase your question?',
      specificQuestion: 'Could you please be more specific about your farming issue?',
      
      // Emergency/Urgent
      emergency: 'Emergency',
      urgent: 'Urgent',
      contactExpert: 'Contact Agriculture Expert',
      
      // Weather Terms
      sunny: 'Sunny',
      rainy: 'Rainy',
      cloudy: 'Cloudy',
      humid: 'Humid',
      dry: 'Dry',
      
      // Soil Types
      claySoil: 'Clay Soil',
      sandySoil: 'Sandy Soil',
      loamySoil: 'Loamy Soil',
      redSoil: 'Red Soil',
      blackSoil: 'Black Soil'
    }
  },
  ta: {
    translation: {
      // Authentication & Welcome
      welcome: 'தமிழ்நாடு விவசாய உதவியாளருக்கு வரவேற்கிறோம்',
      selectLanguage: 'உங்கள் மொழியை தேர்வு செய்யுங்கள்',
      loginWithGoogle: 'Google மூலம் உள்நுழைக',
      askQuestion: 'விவசாயம் பற்றி என்னிடம் கேளுங்கள்',
      logout: 'வெளியேறு',
      
      // Languages
      english: 'English',
      tamil: 'தமிழ்',
      changeLanguage: 'மொழியை மாற்று',

      // Add to Tamil section - Toast Messages  
chatCreated: 'புதிய உரையாடல் வெற்றிகரமாக உருவாக்கப்பட்டது!',
chatCreateFailed: 'புதிய உரையாடலை உருவாக்க முடியவில்லை',
chatDeleted: 'உரையாடல் வெற்றிகரமாக நீக்கப்பட்டது!',
allDeleted: 'அனைத்து உரையாடல்களும் வெற்றிகரமாக நீக்கப்பட்டன!',
      
      // Chat Interface
      typeMessage: 'உங்கள் விவசாய கேள்வியை உள்ளிடவும்...',
      send: 'அனுப்பு',
      recording: 'பதிவு செய்கிறது...',
      tapToSpeak: 'பேச தட்டவும்',
      uploadImage: 'படத்தை பதிவேற்று',
      listening: 'கேட்கிறது...',
      processing: 'செயல்படுத்துகிறது...',
      newChat: 'புதிய உரையாடல்',
      noChats: 'இன்னும் உரையாடல்கள் இல்லை',
      deleteChat: 'உரையாடலை நீக்கு',
      clearAllChats: 'அனைத்து உரையாடல்களையும் நீக்கு',
      chat: 'உரையாடல்',
      appTitle: 'தமிழ்நாடு விவசாய உதவியாளர்',
speak: 'பேசவும்',
stop: 'நிறுத்தவும்',
micError: 'மைக்ரோஃபோன் பிழை',
      
      // Confirmation Dialogs
      deleteConfirm: 'இந்த உரையாடலை நீக்க விரும்புகிறீர்களா?',
      deleteAllConfirm: 'அனைத்து உரையாடல்களையும் நீக்க விரும்புகிறீர்களா? இந்த செயலை திரும்ப பெற முடியாது.',
      allDeletedConfirm: 'அனைத்து உரையாடல்களும் வெற்றிகரமாக நீக்கப்பட்டன!',
      deleteFailed: 'அனைத்து உரையாடல்களையும் நீக்க முடியவில்லை. தயவு செய்து மீண்டும் முயற்சிக்கவும்.',
      
      // System Messages
      imageUploaded: 'படம் பதிவேற்றப்பட்டது',
      playAudio: 'ஒலியை இயக்கு',
      serverError: 'சேவையக பிழை. தயவு செய்து மீண்டும் முயற்சிக்கவும்.',
      networkError: 'பிணைய பிழை. உங்கள் இணைப்பை சரிபார்க்கவும்.',
      noResponse: 'சேவையகத்திலிருந்து பதில் பெறப்படவில்லை.',
      
      // Common Farming Questions (for suggestions)
      cropSuggestions: 'இந்த பருவத்திற்கு ஏற்ற பயிர்கள் எவை?',
      pestControl: 'நெல் வயல்களில் பூச்சிகளை எவ்வாறு கட்டுப்படுத்துவது?',
      fertilizerQuestion: 'காய்கறிகளுக்கு என்ன உரம் பயன்படுத்த வேண்டும்?', // CHANGED: Added "Question"
      irrigationQuestion: 'சிறந்த நீர்ப்பாசன முறை எது?', // CHANGED: Added "Question"
      weather: 'வானிலை எவ்வாறு என் பயிர்களை பாதிக்கும்?',
      soilTesting: 'மண்ணின் தரத்தை எவ்வாறு சோதிப்பது?',
      organicFarming: 'கரிம விவசாய முறைகள் பற்றி சொல்லுங்கள்',
      marketPrices: 'தற்போதைய சந்தை விலைகள் என்ன?',
      
      // Button Labels
      continue: 'தொடரவும்',
      cancel: 'ரத்து செய்',
      confirm: 'உறுதிப்படுத்து',
      delete: 'நீக்கு',
      save: 'சேமிக்கவும்',
      edit: 'திருத்து',
      search: 'தேடு',
      filter: 'வடிகட்டு',
      refresh: 'புதுப்பிக்கவும்',
      loading: 'ஏற்றுகிறது...',
      
      // Navigation
      home: 'முகப்பு',
      profile: 'சுயவிவரம்',
      settings: 'அமைப்புகள்',
      history: 'உரையாடல் வரலாறு',
      help: 'உதவி',
      about: 'பற்றி',
      
      // Error Messages
      error: 'பிழை',
      tryAgain: 'தயவு செய்து மீண்டும் முயற்சிக்கவும்',
      connectionError: 'இணைப்பு பிழை',
      authenticationError: 'அங்கீகாரம் தோல்வியடைந்தது',
      
      // Success Messages
      success: 'வெற்றி',
      saved: 'வெற்றிகரமாக சேமிக்கப்பட்டது',
      updated: 'வெற்றிகரமாக புதுப்பிக்கப்பட்டது',
      deleted: 'வெற்றிகரமாக நீக்கப்பட்டது',
      
      // Placeholders
      searchPlaceholder: 'விவசாய தலைப்புகளை தேடுங்கள்...',
      namePlaceholder: 'உங்கள் பெயரை உள்ளிடவும்',
      emailPlaceholder: 'உங்கள் மின்னஞ்சலை உள்ளிடவும்',
      
      // Time & Date
      today: 'இன்று',
      yesterday: 'நேற்று',
      lastWeek: 'கடந்த வாரம்',
      older: 'பழையது',
      
      // Chat Status
      online: 'ஆன்லைன்',
      offline: 'ஆஃப்லைன்',
      typing: 'தட்டச்சு செய்கிறது...',
      
      // Farming Specific Terms
      crops: 'பயிர்கள்',
      vegetables: 'காய்கறிகள்',
      fruits: 'பழங்கள்',
      grains: 'தானியங்கள்',
      livestock: 'கால்நடை',
      poultry: 'கோழி வளர்ப்பு',
      irrigation: 'நீர்ப்பாசனம்', // KEEP ONLY ONE
      harvest: 'அறுவடை',
      sowing: 'விதைத்தல்',
      planting: 'நடவு',
      fertilizer: 'உரம்', // KEEP ONLY ONE
      pesticide: 'பூச்சிக்கொல்லி',
      organic: 'கரிம',
      soil: 'மண்',
      water: 'நீர்',
      climate: 'காலநிலை',
      
      // Months & Seasons
      january: 'ஜனவரி',
      february: 'பிப்ரவரி',
      march: 'மார்ச்',
      april: 'ஏப்ரல்',
      may: 'மே',
      june: 'ஜூன்',
      july: 'ஜூலை',
      august: 'ஆகஸ்ட்',
      september: 'செப்டம்பர்',
      october: 'அக்டோபர்',
      november: 'நவம்பர்',
      december: 'டிசம்பர்',
      summer: 'கோடை',
      winter: 'குளிர்காலம்',
      monsoon: 'மழைக்காலம்',
      spring: 'வசந்த காலம்',
      
      // Measurements
      acre: 'ஏக்கர்',
      hectare: 'ஹெக்டேர்',
      kilogram: 'கிலோகிராம்',
      quintal: 'குவிண்டால்',
      liter: 'லிட்டர்',
      
      // AI Responses (Common phrases)
      greeting: 'வணக்கம்! நான் உங்கள் விவசாய உதவியாளர். இன்று நான் உங்களுக்கு எவ்வாறு உதவ முடியும்?',
      thanks: 'எங்கள் விவசாய உதவியாளரைப் பயன்படுத்தியதற்கு நன்றி!',
      followUp: 'விவசாயம் தொடர்பான வேறு கேள்விகள் உள்ளனவா?',
      notUnderstood: 'நான் புரிந்து கொள்ளவில்லை. தயவு செய்து உங்கள் கேள்வியை மீண்டும் கூற முடியுமா?',
      specificQuestion: 'தயவு செய்து உங்கள் விவசாய பிரச்சனை பற்றி குறிப்பாக கூற முடியுமா?',
      
      // Emergency/Urgent
      emergency: 'அவசரம்',
      urgent: 'அவசர',
      contactExpert: 'விவசாய நிபுணரை தொடர்பு கொள்ளவும்',
      
      // Weather Terms
      sunny: 'வெயில்',
      rainy: 'மழை',
      cloudy: 'மேகமூட்டம்',
      humid: 'ஈரப்பதம்',
      dry: 'வறண்ட',
      
      // Soil Types
      claySoil: 'களிமண் மண்',
      sandySoil: 'மணல் மண்',
      loamySoil: 'வண்டல் மண்',
      redSoil: 'செங்கல் மண்',
      blackSoil: 'கருமண்'
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