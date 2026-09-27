import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginUser, fetchCurrentUser } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('sci_token') || null);
  const [user, setUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('sci_user') || null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize or restore session
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      if (token) {
        try {
          const profile = await fetchCurrentUser();
          if (isMounted) {
            const unified = {
              ...profile,
              is_coordinator: Boolean(profile?.is_coordinator),
              toString: () => profile?.prenom || profile?.name || 'Membre'
            };
            setUser(unified);
            setCurrentUser(unified);
            localStorage.setItem('sci_user', profile?.prenom || 'Membre');
          }
        } catch (err) {
          console.warn('Session expiré ou invalide:', err);
          // Only clear if 401
          if (err.message && (err.message.includes('401') || err.message.includes('Jeton') || err.message.includes('unauthorized'))) {
            logout();
          }
        }
      }
      if (isMounted) {
        setIsLoading(false);
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const login = async (userOrPrenom, tokenOrPassword) => {
    let newToken;
    let resolvedUser;

    // Check if called directly with (userData, token)
    if (
      (typeof userOrPrenom === 'object' && userOrPrenom !== null) ||
      (typeof tokenOrPassword === 'string' && (tokenOrPassword.includes('.') || tokenOrPassword.length > 40))
    ) {
      newToken = tokenOrPassword;
      resolvedUser = userOrPrenom;
    } else {
      // Called with credentials (prenom, password)
      const data = await loginUser(userOrPrenom, tokenOrPassword);
      newToken = data.access_token || data.token;
      resolvedUser = data.user || data.member || { prenom: userOrPrenom, is_coordinator: data.is_coordinator };
    }

    const unified = {
      ...(typeof resolvedUser === 'object' ? resolvedUser : { prenom: resolvedUser }),
      is_coordinator: Boolean(resolvedUser?.is_coordinator),
      toString: () => (typeof resolvedUser === 'object' ? resolvedUser?.prenom || resolvedUser?.name : resolvedUser) || 'Membre'
    };

    const userPrenom = unified.prenom || unified.name || 'Membre';

    if (newToken) {
      localStorage.setItem('sci_token', newToken);
    }
    if (userPrenom) {
      localStorage.setItem('sci_user', userPrenom);
    }

    setToken(newToken);
    setUser(unified);
    setCurrentUser(unified);

    return { access_token: newToken, user: unified, member: unified };
  };

  const logout = () => {
    localStorage.removeItem('sci_token');
    localStorage.removeItem('sci_user');
    setToken(null);
    setUser(null);
    setCurrentUser(null);
  };

  // Unification du rôle coordinateur / coordinatrice adjointe
  const isCoordinator = Boolean(user?.is_coordinator || currentUser?.is_coordinator);

  const value = {
    token,
    user,
    currentUser,
    isAuthenticated: Boolean(token),
    isLoading,
    isCoordinator,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
