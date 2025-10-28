export interface User {
  _id?: string;
  name: string;
  email: string;
  language?: string;
  createdAt?: Date;
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  audioUrl?: string;
  imageUrl?: string;
}

export interface ChatSession {
  _id: string;
  title: string;
  userEmail: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export type Language = 'en' | 'ta';
