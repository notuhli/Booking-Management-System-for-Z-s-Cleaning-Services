import { useState, useEffect } from 'react';

export function useDarkMode() {
  const [dark, setDark] = useState(() => localStorage.getItem('zclean_dark') === 'true');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('zclean_dark', dark);
  }, [dark]);

  return [dark, setDark];
}
