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
      personalizedWeatherAdvice: 'Get personalized farming advice based on your local weather',
      logout: 'Logout',

      // Authentication states & errors (Phase 1)
      loginFailed: 'Login failed. Please try again.',
      authExpired: 'Authentication expired. Please sign in again.',
      signingIn: 'Signing in...',
      authInvalidCallback: 'Sign-in could not be completed. Please try again.',
      authMisconfigured: 'Sign-in is not configured yet. Please contact support.',
      rateLimited: 'Too many requests. Please try again later.',
      notFound: 'Not found.',

      // Farm profile & onboarding (Phase 3)
      profileLoadFailed: 'Could not load your farm profile.',
      profileHeading: 'Let us set up your farm profile',
      profileDescription: 'Your farm details help us personalize farming advice. It only takes a moment.',
      district: 'District',
      districtRequired: 'Please select your district.',
      addCrops: 'Crops you grow',
      cropPlaceholder: 'Type a crop, e.g. Rice',
      add: 'Add',
      removeCrop: 'Remove {{crop}}',
      cropRequired: 'Add at least one crop.',
      cropLimit: 'You can add up to 20 crops.',
      acres: 'Farm size (acres)',
      acresPlaceholder: 'e.g. 2.5',
      acresRequired: 'Please enter your farm size in acres.',
      acresInvalid: 'Enter a valid size greater than 0.',
      preferredLanguage: 'Preferred language',
      saveProfile: 'Save & Continue',
      savingProfile: 'Saving...',
      saveFailed: 'Could not save your profile. Please try again.',
      retry: 'Retry',
      
      // Languages
      english: 'English',
      tamil: 'தமிழ்',
      changeLanguage: 'Change Language',

      // Location (device-based, session-level — separate from the farm profile district)
      locationRequesting: 'Detecting location…',
      detectLocation: 'Detect my location',
      locationDenied: 'Location permission denied',
      locationDeniedMessage: 'Allow location access to show local weather. You can still use the assistant.',
      locationUnavailable: 'Location unavailable',
      locationUnavailableMessage: 'Could not determine your location. Retry or use your farm district for weather.',
      locationUnsupported: 'Location not supported',
      locationUnsupportedMessage: 'Your browser does not support location. You can use your farm district for weather.',
      outsideTamilNadu: 'Outside Tamil Nadu',
      outsideTamilNaduMessage: 'Weather is available for Tamil Nadu districts. You can still use the farming assistant.',
      detectedLocation: 'Detected location',
      farmDistrictLabel: 'Farm district',
      useFarmDistrict: 'Use farm district ({{district}}) for weather',
      locationFailed: 'Location unavailable',

      // Weather / farming insight (derived ONLY from backend-returned weather fields)
      farmingInsight: "Today's Farming Insight",
      insightRainToday: 'Rain expected today: {{mm}} mm',
      insightRainTomorrow: 'Rain expected tomorrow: {{mm}} mm',
      insightTempRange: 'Today ranges from {{min}}°C to {{max}}°C',
      insightConditions: 'Now: {{condition}}',

      // Navbar / greeting
      goodMorning: 'Good morning, {{name}}',
      goodAfternoon: 'Good afternoon, {{name}}',
      goodEvening: 'Good evening, {{name}}',
      askVivasayi: 'Ask Vivasayi AI',
      setupProfile: 'Set up farm profile',
      continueWithoutProfile: 'Continue without a profile',
      profileIncomplete: 'Set up your farm profile to personalize farming advice.',
      profileAfter: 'You can set up your farm profile any time from the top menu.',
      locationYourDistrict: 'Your district: {{district}}',
      placeContext: 'You are in {{place}}',
      coordsTitle: 'Coordinates: {{lat}}, {{lon}}',
      mapAttribution: 'Map data © OpenStreetMap',

      // Public landing page (two-panel, never an empty screen)
      landingKicker: 'AI Farming Assistant',
      heroHeadline: 'Your AI farming assistant',
      heroSubline: 'Weather-aware advice, crop guidance and image-based diagnosis — in Tamil and English.',
      featureWeather: 'Weather-aware farming advice',
      featureCrop: 'Crop guidance',
      featureDiagnosis: 'Image-based crop diagnosis',
      featurePersonalized: 'Advice built around your farm',
      landingContextTitle: 'Local context',
      locationExplain: 'With your permission we use your device location to show local context.',
      allowLocationCta: 'Use my location',
      refreshingLocation: 'Refreshing…',
      signInForWeather: 'Sign in to see live weather and farming insight.',
      tipHeading: 'You can ask Vivasayi about',
      signInTitle: 'Welcome back',
      signInSubtitle: 'Sign in to continue with Vivasayi AI',
      secureSignIn: 'Secure Google sign-in',
      landingFooterNote: 'Made for the farmers of Tamil Nadu',
      
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
      loadingChats: 'Loading chats...',
      chatListLoadFailed: 'Could not load your chats.',
      chatEmptyState: 'How can I help your farm today? Ask a question below or attach a photo of your crop.',
      deleteChat: 'Delete chat',
      clearAllChats: 'Clear All Chats',
      chat: 'Chat',
      openSidebar: 'Open chat history',
      closeSidebar: 'Close chat history',
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
      confirmDeleteChat: 'Delete this chat?',
      confirmDeleteChatHint: 'The chat and its messages will be removed.',
      confirmClearAll: 'Delete all chats?',
      confirmClearAllHint: 'Every chat will be removed. This cannot be undone.',
      yesDelete: 'Yes, delete',

      // Message deletion (contextual menu — honest capability note)
      messageMenu: 'Message options',
      deleteMessage: 'Delete message',
      messageDeleteUnsupportedTitle: 'Deleting a message is not available yet',
      messageDeleteUnsupportedBody: 'One message cannot be deleted on its own yet. You can delete the entire chat instead.',
      deleteThisChat: 'Delete this chat',
      
      // System Messages
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

      // Weather Panel
      weatherUnavailable: 'Weather unavailable',
      wind: 'Wind',

      // Image Diagnosis (Phase 5)
      attachImage: 'Attach image',
      removeImage: 'Remove image',
      uploadedImage: 'Uploaded image',
      photoAttached: 'Photo attached',
      imageUnavailable: 'Image unavailable',
      uploadingImage: 'Uploading image...',
      analyzingImage: 'Analyzing image...',
      imageOnlyPrompt: 'Please analyze this image of my crop and advise me.',
      imageUploadFailed: 'We couldn\'t process this image. Please try another image.',
      diagnosisUnavailable: 'A crop diagnosis is not available for this image.',
      diagnosisUncertain: 'This diagnosis is uncertain. Please verify with your local agricultural officer.',
      unsupportedImage: 'Please attach a valid image up to 5 MB.',
      imageTooLarge: 'Image is too large. Maximum size is 5 MB.',
      imageDiagnosis: 'Image Diagnosis',
      crop: 'Crop',
      symptoms: 'Observed symptoms',
      likelyIssues: 'Likely concerns',
      issueUnnamed: 'Unidentified concern',
      confHigh: 'High',
      confMedium: 'Medium',
      confLow: 'Low',
      
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
      personalizedWeatherAdvice: 'உங்கள் பிராந்திய வானிலை அடிப்படையில் தனிப்பட்ட விவசாய ஆலோசனைகளைப் பெறுங்கள்',
      logout: 'வெளியேறு',

      // Authentication states & errors (Phase 1)
      loginFailed: 'உள்நுழைவு தோல்வி. மீண்டும் முயற்சிக்கவும்.',
      authExpired: 'அங்கீகாரம் காலாவதியானது. மீண்டும் உள்நுழைக.',
      signingIn: 'உள்நுழைகிறது...',
      authInvalidCallback: 'உள்நுழைவை முடிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
      authMisconfigured: 'உள்நுழைவு இன்னும் கட்டமைக்கப்படவில்லை. ஆதரவை தொடர்பு கொள்ளவும்.',
      rateLimited: 'அதிக கோரிக்கைகள். சிறிது நேரம் கழித்து முயற்சிக்கவும்.',
      notFound: 'கிடைக்கவில்லை.',

      // Farm profile & onboarding (Phase 3)
      profileLoadFailed: 'உங்கள் பண்ணை சுயவிவரத்தை ஏற்ற முடியவில்லை.',
      profileHeading: 'உங்கள் பண்ணை சுயவிவரத்தை அமைப்போம்',
      profileDescription: 'உங்கள் பண்ணை விவரங்கள் விவசாய ஆலோசனைகளை தனிப்பயனாக்க உதவுகிறது. ஒரு கணம் மட்டுமே ஆகும்.',
      district: 'மாவட்டம்',
      districtRequired: 'உங்கள் மாவட்டத்தை தேர்வு செய்யவும்.',
      addCrops: 'நீங்கள் பயிரிடும் பயிர்கள்',
      cropPlaceholder: 'பயிரை உள்ளிடவும், எ.கா. நெல்',
      add: 'சேர்',
      removeCrop: '{{crop}} ஐ நீக்கு',
      cropRequired: 'குறைந்தது ஒரு பயிரை சேர்க்கவும்.',
      cropLimit: 'அதிகபட்சம் 20 பயிர்கள் வரை சேர்க்கலாம்.',
      acres: 'பண்ணை அளவு (ஏக்கர்)',
      acresPlaceholder: 'உ.ம். 2.5',
      acresRequired: 'உங்கள் பண்ணை அளவை ஏக்கரில் உள்ளிடவும்.',
      acresInvalid: '0-விட அதிகமான சரியான எண்ணை உள்ளிடவும்.',
      preferredLanguage: 'விருப்ப மொழி',
      saveProfile: 'சேமித்து தொடரவும்',
      savingProfile: 'சேமிக்கிறது...',
      saveFailed: 'உங்கள் சுயவிவரத்தை சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
      retry: 'மீண்டும் முயற்சி',
      
      // Languages
      english: 'English',
      tamil: 'தமிழ்',
      changeLanguage: 'மொழியை மாற்று',

      // Location (device-based, session-level — separate from the farm profile district)
      locationRequesting: 'இருப்பிடம் கண்டறியப்படுகிறது…',
      detectLocation: 'என் இருப்பிடத்தை கண்டறி',
      locationDenied: 'இருப்பிட அனுமதி மறுக்கப்பட்டது',
      locationDeniedMessage: 'உள்ளூர் வானிலையைக் காட்ட இருப்பிட அனுமதி தேவை. இருப்பினும் உதவியாளரைப் பயன்படுத்தலாம்.',
      locationUnavailable: 'இருப்பிடம் கிடைக்கவில்லை',
      locationUnavailableMessage: 'உங்கள் இருப்பிடத்தை கண்டறிய முடியவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது வானிலைக்கு உங்கள் பண்ணை மாவட்டத்தை பயன்படுத்தவும்.',
      locationUnsupported: 'இருப்பிடம் ஆதரிக்கப்படவில்லை',
      locationUnsupportedMessage: 'உங்கள் உலாவி இருப்பிடத்தை ஆதரிக்கவில்லை. வானிலைக்கு உங்கள் பண்ணை மாவட்டத்தை பயன்படுத்தலாம்.',
      outsideTamilNadu: 'தமிழ்நாட்டிற்கு வெளியே',
      outsideTamilNaduMessage: 'வானிலை தமிழ்நாடு மாவட்டங்களுக்கு மட்டுமே. இருப்பினும் விவசாய உதவியாளரைப் பயன்படுத்தலாம்.',
      detectedLocation: 'கண்டறியப்பட்ட இருப்பிடம்',
      farmDistrictLabel: 'பண்ணை மாவட்டம்',
      useFarmDistrict: 'வானிலைக்கு பண்ணை மாவட்டத்தை ({{district}}) பயன்படுத்து',
      locationFailed: 'இருப்பிடம் கிடைக்கவில்லை',

      // Weather / farming insight (derived ONLY from backend-returned weather fields)
      farmingInsight: 'இன்றைய விவசாய கணிப்பு',
      insightRainToday: 'இன்று மழை எதிர்பார்க்கப்படுகிறது: {{mm}} மிமீ',
      insightRainTomorrow: 'நாளை மழை எதிர்பார்க்கப்படுகிறது: {{mm}} மிமீ',
      insightTempRange: 'இன்று {{min}}°C முதல் {{max}}°C வரை',
      insightConditions: 'இப்போது: {{condition}}',

      // Navbar / greeting
      goodMorning: 'காலை வணக்கம், {{name}}',
      goodAfternoon: 'மதிய வணக்கம், {{name}}',
      goodEvening: 'மாலை வணக்கம், {{name}}',
      askVivasayi: 'விவசாயியிடம் கேளுங்கள்',
      setupProfile: 'பண்ணை சுயவிவரம் அமைக்கவும்',
      continueWithoutProfile: 'சுயவிவரம் இல்லாமல் தொடரவும்',
      profileIncomplete: 'விவசாய ஆலோசனைகளை தனிப்பயனாக்க உங்கள் பண்ணை சுயவிவரத்தை அமைக்கவும்.',
      profileAfter: 'மேலே உள்ள மெனுவிலிருந்து எப்போது வேண்டுமானாலும் பண்ணை சுயவிவரத்தை அமைக்கலாம்.',
      locationYourDistrict: 'உங்கள் மாவட்டம்: {{district}}',
      placeContext: 'நீங்கள் இப்போது {{place}}-இல் உள்ளீர்கள்',
      coordsTitle: 'ஆயங்கள்: {{lat}}, {{lon}}',
      mapAttribution: 'வரைபடம் © OpenStreetMap',

      // Public landing page (two-panel, never an empty screen)
      landingKicker: 'AI விவசாய உதவியாளர்',
      heroHeadline: 'உங்கள் AI விவசாய உதவியாளர்',
      heroSubline: 'வானிலை அடிப்படையிலான ஆலோசனை, பயிர் வழிகாட்டுதல், பட கண்டறிதல் — தமிழ் மற்றும் ஆங்கிலத்தில்.',
      featureWeather: 'வானிலை அடிப்படையிலான விவசாய ஆலோசனை',
      featureCrop: 'பயிர் வழிகாட்டுதல்',
      featureDiagnosis: 'பட அடிப்படையிலான பயிர் கண்டறிதல்',
      featurePersonalized: 'உங்கள் பண்ணைக்காக அமைக்கப்பட்ட ஆலோசனை',
      landingContextTitle: 'உள்ளூர் சூழல்',
      locationExplain: 'உங்கள் அனுமதியுடன், உள்ளூர் சூழலைக் காட்ட உங்கள் சாதன இருப்பிடத்தைப் பயன்படுத்துகிறோம்.',
      allowLocationCta: 'என் இருப்பிடத்தைப் பயன்படுத்து',
      refreshingLocation: 'புதுப்பிக்கிறது…',
      signInForWeather: 'வானிலை மற்றும் விவசாய கணிப்பைக் காண உள்நுழைக.',
      tipHeading: 'இதுபற்றி Vivasayi-யிடம் கேட்கலாம்',
      signInTitle: 'மீண்டும் வரவேற்கிறோம்',
      signInSubtitle: 'Vivasayi AI-ஐத் தொடர உள்நுழைக',
      secureSignIn: 'பாதுகாப்பான Google உள்நுழைவு',
      landingFooterNote: 'தமிழ்நாட்டு விவசாயிகளுக்காக',

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
      loadingChats: 'உரையாடல்கள் ஏற்றப்படுகின்றன...',
      chatListLoadFailed: 'உங்கள் உரையாடல்களை ஏற்ற முடியவில்லை.',
      chatEmptyState: 'இன்று உங்கள் பண்ணைக்கு நான் எவ்வாறு உதவ முடியும்? கீழே ஒரு கேள்வியை விசாரியுங்கள் அல்லது உங்கள் பயிரின் படத்தை இணைக்கவும்.',
      deleteChat: 'உரையாடலை நீக்கு',
      clearAllChats: 'அனைத்து உரையாடல்களையும் நீக்கு',
      chat: 'உரையாடல்',
      openSidebar: 'உரையாடல் வரலாற்றை திற',
      closeSidebar: 'உரையாடல் வரலாற்றை மூடு',
      appTitle: 'தமிழ்நாடு விவசாய உதவியாளர்',
speak: 'பேசவும்',
stop: 'நிறுத்தவும்',
micError: 'மைக்ரோஃபோன் பிழை',
      
      // Confirmation Dialogs
      deleteConfirm: 'இந்த உரையாடலை நீக்க விரும்புகிறீர்களா?',
      deleteAllConfirm: 'அனைத்து உரையாடல்களையும் நீக்க விரும்புகிறீர்களா? இந்த செயலை திரும்ப பெற முடியாது.',
      allDeletedConfirm: 'அனைத்து உரையாடல்களும் வெற்றிகரமாக நீக்கப்பட்டன!',
      deleteFailed: 'அனைத்து உரையாடல்களையும் நீக்க முடியவில்லை. தயவு செய்து மீண்டும் முயற்சிக்கவும்.',
      confirmDeleteChat: 'இந்த உரையாடலை நீக்கவா?',
      confirmDeleteChatHint: 'உரையாடலும் அதன் செய்திகளும் அகற்றப்படும்.',
      confirmClearAll: 'அனைத்து உரையாடல்களையும் நீக்கவா?',
      confirmClearAllHint: 'இது அனைத்து உரையாடல்களையும் நீக்கும். இதை மீட்டெடுக்க முடியாது.',
      yesDelete: 'ஆம், நீக்கு',

      // Message deletion (contextual menu — honest capability note)
      messageMenu: 'செய்தி விருப்பங்கள்',
      deleteMessage: 'செய்தியை நீக்கு',
      messageDeleteUnsupportedTitle: 'ஒரு செய்தியை நீக்குவது இன்னும் கிடைக்கவில்லை',
      messageDeleteUnsupportedBody: 'ஒற்றை செய்தியை மட்டும் இன்னும் நீக்க முடியாது. அதற்கு பதிலாக முழு உரையாடலையும் நீக்கலாம்.',
      deleteThisChat: 'இந்த உரையாடலை நீக்கு',
      
      // System Messages
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

      // Weather Panel
      weatherUnavailable: 'வானிலை தகவல் இல்லை',
      wind: 'காற்று',

      // Image Diagnosis (Phase 5)
      attachImage: 'படத்தை இணைக்கவும்',
      removeImage: 'படத்தை அகற்று',
      uploadedImage: 'பதிவேற்றிய படம்',
      photoAttached: 'படம் இணைக்கப்பட்டது',
      imageUnavailable: 'படம் கிடைக்கவில்லை',
      uploadingImage: 'படம் பதிவேற்றுகிறது...',
      analyzingImage: 'படத்தை பகுப்பாய்வு செய்கிறது...',
      imageOnlyPrompt: 'என் பயிரின் இந்தப் படத்தைப் பகுப்பாய்வு செய்து எனக்கு ஆலோசனை வழங்குங்கள்.',
      imageUploadFailed: 'இந்தப் படத்தைச் செயலாக்க முடியவில்லை. வேறொரு படத்தை முயற்சிக்கவும்.',
      diagnosisUnavailable: 'இந்த படத்திற்கு பயிர் கண்டறிதல் கிடைக்கவில்லை.',
      diagnosisUncertain: 'இந்த கண்டறிதல் நிச்சயமற்றது. உங்கள் அருகிலுள்ள வேளாண்மை அலுவலரிடம் சரிபார்க்கவும்.',
      unsupportedImage: 'சரியான படத்தை இணைக்கவும் (அதிகபட்சம் 5 MB).',
      imageTooLarge: 'படம் மிகப் பெரியது. அதிகபட்ச அளவு 5 MB.',
      imageDiagnosis: 'பட கண்டறிதல்',
      crop: 'பயிர்',
      symptoms: 'காணப்பட்ட அறிகுறிகள்',
      likelyIssues: 'சாத்தியமான பிரச்சனைகள்',
      issueUnnamed: 'அடையாளம் காணப்படாத பிரச்சனை',
      confHigh: 'அதிகம்',
      confMedium: 'நடுத்தரம்',
      confLow: 'குறைவு',
      
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