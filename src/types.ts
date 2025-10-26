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

export type Language = 'en' | 'ta';
