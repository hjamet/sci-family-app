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
            setUser(profile);
            const prenom = profile?.prenom || profile?.name || currentUser || 'Membre';
            setCurrentUser(prenom);
            localStorage.setItem('sci_user', prenom);
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
    let userPrenom;

    // Check if called directly with (userData, token)
    if (
      (typeof userOrPrenom === 'object' && userOrPrenom !== null) ||
      (typeof tokenOrPassword === 'string' && (tokenOrPassword.includes('.') || tokenOrPassword.length > 40))
    ) {
      newToken = tokenOrPassword;
      resolvedUser = userOrPrenom;
      userPrenom = typeof resolvedUser === 'string'
        ? resolvedUser
        : (resolvedUser?.prenom || resolvedUser?.name || 'Membre');
    } else {
      // Called with credentials (prenom, password)
      const data = await loginUser(userOrPrenom, tokenOrPassword);
      newToken = data.access_token || data.token;
      resolvedUser = data.user || data.member || { prenom: userOrPrenom };
      userPrenom = typeof resolvedUser === 'string'
        ? resolvedUser
        : (resolvedUser?.prenom || resolvedUser?.name || userOrPrenom);
    }

    if (newToken) {
      localStorage.setItem('sci_token', newToken);
    }
    if (userPrenom) {
      localStorage.setItem('sci_user', userPrenom);
    }

    setToken(newToken);
    setUser(resolvedUser);
    setCurrentUser(userPrenom);

    return { access_token: newToken, user: resolvedUser, member: resolvedUser };
  };

  const logout = () => {
    localStorage.removeItem('sci_token');
    localStorage.removeItem('sci_user');
    setToken(null);
    setUser(null);
    setCurrentUser(null);
  };

  // Henri and Joséphine are coordinators
  const isCoordinator = () => {
    const name = (currentUser || user?.prenom || '').toLowerCase();
    return name.includes('henri') || name.includes('joséphine') || name.includes('josephine');
  };

  const value = {
    token,
    user,
    currentUser,
    isAuthenticated: Boolean(token),
    isLoading,
    isCoordinator: isCoordinator(),
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
