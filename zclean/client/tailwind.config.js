export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Inter: primary UI font — body, labels, tables, navigation
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        // Plus Jakarta Sans: brand/display — logos, hero titles, page headers
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        // serif slot also uses Plus Jakarta Sans (replaces Lora for section headings)
        serif:   ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Type scale: Small (12–16px) | Medium (18–24px) | Large (28–36px)
        'xs':   ['12px', { lineHeight: '16px' }],  // labels, badges, captions
        'sm':   ['13px', { lineHeight: '20px' }],  // nav, table cells, secondary
        'base': ['15px', { lineHeight: '24px' }],  // body text, card content
        'lg':   ['17px', { lineHeight: '26px' }],  // emphasized body
        'xl':   ['20px', { lineHeight: '28px' }],  // card titles (medium)
        '2xl':  ['24px', { lineHeight: '32px' }],  // section headers (medium)
        '3xl':  ['30px', { lineHeight: '38px' }],  // page titles (large)
        '4xl':  ['36px', { lineHeight: '44px' }],  // key metrics, hero (large)
      },
    },
  },
  plugins: [],
};
