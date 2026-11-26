import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginUser, fetchCurrentUser, invalidateApiCache } from '../api';

const AuthContext = createContext(null);

function sanitizeDisplayPrenom(raw) {
  if (!raw) return '';
  const cleaned = String(raw).trim();
  const norm = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (norm === 'maman' || norm.startsWith('maman ') || norm === 'elizabeth' || norm === 'elisabeth') {
    return 'Élisabeth';
  }
  if (norm === 'papa' || norm.startsWith('papa ')) {
    return 'Frédéric';
  }
  return cleaned;
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return null;
  }
}

function buildUnifiedUser(profile) {
  if (!profile) return null;
  const rawObj = typeof profile === 'object' ? profile : { prenom: String(profile) };
  const prenom = sanitizeDisplayPrenom(rawObj.prenom || (rawObj.name ? String(rawObj.name).split(' ')[0] : ''));
  const rawName = rawObj.name ? String(rawObj.name).replace(/Maman\s*\(\s*[ÉE]lisabeth\s*\)\s*Jamet/gi, 'Élisabeth Jamet').replace(/\bMaman\b/gi, 'Élisabeth').trim() : '';
  const name = rawName || (prenom ? `${prenom} Jamet` : '');
  return {
    ...rawObj,
    prenom: prenom || rawObj.prenom || '',
    name: name || rawObj.name || '',
    is_coordinator: Boolean(rawObj.is_coordinator),
    toString: () => prenom || name || 'Membre',
  };
}

function readInitialUser(initialToken) {
  if (!initialToken) return null;
  const payload = decodeJwtPayload(initialToken);
  const jwtId = payload?.user_id ?? payload?.member_id ?? payload?.id ?? null;
  const jwtPrenom = sanitizeDisplayPrenom(payload?.sub || payload?.prenom || '');

  try {
    const rawProfile = localStorage.getItem('sci_user_profile');
    if (rawProfile) {
      const parsed = JSON.parse(rawProfile);
      if (parsed && typeof parsed === 'object') {
        const idMatches = jwtId == null || parsed.id == null || Number(parsed.id) === Number(jwtId);
        if (idMatches) {
          return buildUnifiedUser({ ...parsed, id: parsed.id ?? (jwtId != null ? Number(jwtId) : undefined) });
        }
      }
    }
  } catch {
    // ignore corrupted cache
  }

  if (jwtId != null || jwtPrenom) {
    return buildUnifiedUser({
      id: jwtId != null ? Number(jwtId) : undefined,
      prenom: jwtPrenom || sanitizeDisplayPrenom(localStorage.getItem('sci_user') || ''),
    });
  }

  const stored = sanitizeDisplayPrenom(localStorage.getItem('sci_user') || '');
  return stored ? buildUnifiedUser({ prenom: stored }) : null;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('sci_token') || null);
  const [user, setUser] = useState(() => readInitialUser(localStorage.getItem('sci_token')));
  const [currentUser, setCurrentUser] = useState(() => readInitialUser(localStorage.getItem('sci_token')));
  const [isLoading, setIsLoading] = useState(true);

  const logout = () => {
    localStorage.removeItem('sci_token');
    localStorage.removeItem('sci_user');
    localStorage.removeItem('sci_user_profile');
    localStorage.removeItem('sci_user_email');
    invalidateApiCache();
    setToken(null);
    setUser(null);
    setCurrentUser(null);
  };

  // Initialize or restore session
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      if (token) {
        try {
          const profile = await fetchCurrentUser();
          if (isMounted) {
            const unified = buildUnifiedUser(profile);
            setUser(unified);
            setCurrentUser(unified);
            localStorage.setItem('sci_user', unified?.prenom || 'Membre');
            try {
              localStorage.setItem('sci_user_profile', JSON.stringify({
                id: unified?.id,
                prenom: unified?.prenom,
                name: unified?.name,
                email: unified?.email,
                role: unified?.role,
                is_coordinator: unified?.is_coordinator,
              }));
            } catch {
              // ignore quota error
            }
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

    const unified = buildUnifiedUser(resolvedUser);
    const userPrenom = unified?.prenom || unified?.name || 'Membre';

    if (newToken) {
      localStorage.setItem('sci_token', newToken);
    }
    if (userPrenom) {
      localStorage.setItem('sci_user', userPrenom);
    }
    try {
      localStorage.setItem('sci_user_profile', JSON.stringify({
        id: unified?.id,
        prenom: unified?.prenom,
        name: unified?.name,
        email: unified?.email,
        role: unified?.role,
        is_coordinator: unified?.is_coordinator,
      }));
    } catch {
      // ignore quota error
    }

    setToken(newToken);
    setUser(unified);
    setCurrentUser(unified);

    return { access_token: newToken, user: unified, member: unified };
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
