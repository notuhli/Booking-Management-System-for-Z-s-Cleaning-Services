import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('zclean_user');
    const token  = localStorage.getItem('zclean_token');
    if (stored && token) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    setReady(true);
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('zclean_token', token);
    localStorage.setItem('zclean_user',  JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('zclean_token');
    localStorage.removeItem('zclean_user');
    setUser(null);
  };

  const updateUser = (data) => {
    const updated = { ...user, ...data };
    localStorage.setItem('zclean_user', JSON.stringify(updated));
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
