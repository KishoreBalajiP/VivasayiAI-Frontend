# Tamil Nadu AI Farming Assistant (Frontend)

A React + Vite frontend application for Tamil Nadu farmers providing weather-aware farming assistance with bilingual support (English/Tamil).

## Core Features

- 🌏 Bilingual interface (English/Tamil)
- 🌤️ Real-time weather integration for Tamil Nadu districts
- 🔒 Secure authentication via Amazon Cognito
- 💬 AI-powered farming assistance chat
- 🎙️ Voice input support
- 📸 Image upload capabilities
- 📱 Responsive design for all devices

## Project Structure

```
src/
├── components/
│   ├── ChatInterface.tsx     # Main chat UI with voice/image support
│   ├── ChatSidebar.tsx      # Chat history management
│   ├── LanguageSelection.tsx # Language switcher
│   ├── LoginScreen.tsx      # Auth + Weather dashboard
│   ├── MessageBubble.tsx    # Chat message component
│   └── VoiceRecorder.tsx    # Speech-to-text handler
├── context/
│   └── AuthContext.tsx      # Authentication state management
├── services/
│   └── farmerWeatherService.ts # Weather API integration
├── config/
│   └── tamilnaduDistricts.ts   # District coordinates
├── types.ts                 # TypeScript interfaces
├── i18n.ts                 # Translations
├── api.ts                  # Backend API calls
└── config.ts               # Environment configuration
```

## Technical Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **State Management**: React Context
- **Authentication**: Amazon Cognito OAuth2
- **Internationalization**: i18next
- **APIs**: Weather (Open-Meteo), Custom Backend
- **Voice Input**: react-hook-speech-to-text
- **Notifications**: Sonner

## Environment Variables

Create a `.env` file with:

```env
VITE_API_URL=http://localhost:5000
VITE_COGNITO_DOMAIN=your-cognito-domain
VITE_COGNITO_CLIENT_ID=your-client-id
VITE_COGNITO_REDIRECT_URI=http://localhost:5173
```

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start development server:

   ```bash
   npm run dev
   ```

3. Build for production:

   ```bash
   npm run build
   ```

4. Preview production build:

   ```bash
   npm run preview
   ```

## Key Features Breakdown

### Weather Integration

- Real-time weather data for Tamil Nadu districts
- Automatic location detection
- Fallback to demo mode for users outside Tamil Nadu
- Farming-specific weather interpretations
- Soil moisture predictions

### Chat Features

- Persistent chat sessions
- Voice input with real-time transcription
- Image upload support
- Bilingual AI responses
- Chat history management
- Session restoration

### Authentication

- OAuth2 flow with Cognito
- Secure token management
- Persistent sessions
- Language preference saving

### Internationalization

- Complete English/Tamil support
- Context-aware translations
- Weather descriptions in both languages
- Farming terminology localization

## Development Guidelines

### TypeScript

- Strict type checking enabled
- Interfaces defined in `types.ts`
- Type-safe API responses

### State Management

- Context API for auth state
- Local state for UI components
- Persistent storage integration

### API Integration

- Centralized API calls in `api.ts`
- Error handling with fallbacks
- Response type validation

### Testing

   ```bash
   npm run typecheck  # Type checking
   npm run lint      # ESLint
   ```

## Future Enhancements

1. Offline support with service workers
2. Push notifications for weather alerts
3. Crop calendar integration
4. Market price integration
5. Community features for farmers
6. Analytics dashboard
7. Mobile app wrapper

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.