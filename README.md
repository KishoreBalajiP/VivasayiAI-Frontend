# Tamil Nadu AI Farming Assistant (Frontend)

Lightweight React + Vite frontend for the Tamil Nadu AI Farming Assistant.

## Repository structure
- src/
  - components/
    - ChatInterface.tsx — main chat UI ([src/components/ChatInterface.tsx](src/components/ChatInterface.tsx))
    - MessageBubble.tsx — message UI ([src/components/MessageBubble.tsx](src/components/MessageBubble.tsx))
    - LoginScreen.tsx — Google/Cognito login UI ([src/components/LoginScreen.tsx](src/components/LoginScreen.tsx))
    - LanguageSelection.tsx — initial language chooser ([src/components/LanguageSelection.tsx](src/components/LanguageSelection.tsx))
  - context/
    - AuthContext.tsx — OAuth2 code flow with Cognito + localStorage ([src/context/AuthContext.tsx](src/context/AuthContext.tsx))
  - i18n.ts — translations and i18next setup ([src/i18n.ts](src/i18n.ts))
  - types.ts — shared types (e.g. [`User`](src/types.ts), `Message`, `Language`) ([src/types.ts](src/types.ts))
  - main.tsx, App.tsx, index.css, vite-env.d.ts
- vite.config.ts — Vite configuration ([vite.config.ts](vite.config.ts))
- tailwind.config.js, postcss.config.js — Tailwind setup
- package.json — scripts and dependencies
- tsconfig.*.json — TypeScript configs

## Key features
- OAuth2 login with Amazon Cognito (authorization code flow) handled in [src/context/AuthContext.tsx](src/context/AuthContext.tsx)
- Multilingual UI (English / Tamil) using i18next ([src/i18n.ts](src/i18n.ts))
- Chat interface supporting:
  - Text input
  - Image upload (client-side preview)
  - Voice recording toggle UI (placeholder)
  - Message bubbles with audio playback support ([src/components/MessageBubble.tsx](src/components/MessageBubble.tsx))
- Tailwind CSS for styling
- Simple local storage persistence for user and selected language

## Quick start (Windows)
1. Install dependencies
   - Open a terminal (PowerShell/CMD) in the project folder:
     npm install

2. Create a local .env file (optional) and add runtime variables:
   - Example: create `.env` at project root
     VITE_API_URL=http://localhost:5000
     VITE_COGNITO_DOMAIN=your-cognito-domain
     VITE_COGNITO_CLIENT_ID=your-client-id
     VITE_COGNITO_REDIRECT_URI=http://localhost:5173

   Note: Vite exposes env vars prefixed with `VITE_` to the client. The frontend reads these in [src/config.ts](src/config.ts).

3. Run the dev server:
   npm run dev
   - Open the URL printed by Vite (usually http://localhost:5173)

4. Build for production:
   npm run build
   npm run preview

5. Lint / Type-check:
   npm run lint
   npm run typecheck

## Authentication details
- The app uses Cognito OAuth2 authorization code flow. Configuration lives in [src/config.ts](src/config.ts) and is read from env vars:
  - VITE_COGNITO_DOMAIN
  - VITE_COGNITO_CLIENT_ID
  - VITE_COGNITO_REDIRECT_URI
- The exchange for tokens happens client-side in [src/context/AuthContext.tsx](src/context/AuthContext.tsx). For production consider moving token exchange to a secure backend.

## Important files to review
- [src/context/AuthContext.tsx](src/context/AuthContext.tsx) — login/logout, token handling, localStorage usage
- [src/i18n.ts](src/i18n.ts) — translation strings and language keys
- [src/components/ChatInterface.tsx](src/components/ChatInterface.tsx) — UI interactions and mock AI response
- [src/types.ts](src/types.ts) — shared type definitions (e.g. [`User`](src/types.ts))

## Notes & TODOs
- Replace the placeholder AI response in [src/components/ChatInterface.tsx](src/components/ChatInterface.tsx) with backend integration to your AI service.
- Voice recording currently only toggles UI state; implement recording/upload if needed.
- Consider moving the OAuth token exchange to a backend for improved security (do not expose client secrets in the browser).
- Add automated tests and CI if required.

If you want, I can:
- Add a sample `.env.local` file
- Add a short CONTRIBUTING.md
- Implement audio recording or backend token-exchange scaffold