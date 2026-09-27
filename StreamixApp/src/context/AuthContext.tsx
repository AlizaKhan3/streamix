import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../services/api';

type User = { user_id: string; email: string; role: string } | null;

type AuthContextType = {
  user: User;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('auth_user').then((raw) => {
      if (raw) setUser(JSON.parse(raw));
      setLoading(false);
    });
  }, []);

  const persist = async (token: string, u: User) => {
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(u));
    setUser(u);
  };

  const signIn = async (email: string, password: string) => {
    const { token, user: u } = await api.login(email, password);
    await persist(token, u);
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { token, user: u } = await api.register(email, password, fullName);
    await persist(token, u);
  };

  const signOut = async () => {
    await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
