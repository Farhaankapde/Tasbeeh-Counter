const colors = {
  light: {
    background: '#F4F1ED', foreground: '#211F1F', card: '#FFFCF8', cardForeground: '#211F1F', surface: '#ECE7E1', surfaceStrong: '#DDD6CF', primary: '#B71F2A', primaryBright: '#D92F3A', primaryForeground: '#FFFFFF', green: '#5C4A4A', greenSoft: '#8A6C6C', muted: '#746E6A', mutedForeground: '#8C8888', border: '#D8D0C8', lcd: '#D3D7CD', lcdDark: '#131715', silver: '#C6C8C8', shadow: '#6E6258', destructive: '#C9545B',
  },
  dark: {
    background: '#111110', foreground: '#F8F6F4', card: '#212120', cardForeground: '#F8F6F4', surface: '#2B2B2A', surfaceStrong: '#383837', primary: '#D51F2A', primaryBright: '#FF3944', primaryForeground: '#FFFFFF', green: '#472B2D', greenSoft: '#714043', muted: '#A9A5A4', mutedForeground: '#858180', border: '#3B3A39', lcd: '#CBD0C4', lcdDark: '#101411', silver: '#C8CBCB', shadow: '#000000', destructive: '#EF6A6F',
  },
  accents: {
    red: { primary: '#D51F2A', primaryBright: '#FF3944', green: '#472B2D', greenSoft: '#714043' },
    green: { primary: '#117A49', primaryBright: '#2FBF78', green: '#153B2A', greenSoft: '#2D7251' },
    blue: { primary: '#1558C9', primaryBright: '#3B82F6', green: '#172E55', greenSoft: '#315D9E' },
  },
  radius: 24,
} as const;
export default colors;
