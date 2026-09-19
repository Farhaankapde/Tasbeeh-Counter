const colors = {
  light: {
    background: '#F4F1ED', foreground: '#211F1F', card: '#FFFCF8', cardForeground: '#211F1F', surface: '#ECE7E1', surfaceStrong: '#DDD6CF', primary: '#B71F2A', primaryBright: '#D92F3A', primaryForeground: '#FFFFFF', green: '#5C4A4A', greenSoft: '#8A6C6C', muted: '#746E6A', mutedForeground: '#8C8888', border: '#D8D0C8', lcd: '#D3D7CD', lcdDark: '#131715', silver: '#C6C8C8', shadow: '#6E6258', destructive: '#C9545B',
  },
  dark: {
    background: '#111110', foreground: '#F8F6F4', card: '#212120', cardForeground: '#F8F6F4', surface: '#2B2B2A', surfaceStrong: '#383837', primary: '#D51F2A', primaryBright: '#FF3944', primaryForeground: '#FFFFFF', green: '#472B2D', greenSoft: '#714043', muted: '#A9A5A4', mutedForeground: '#858180', border: '#3B3A39', lcd: '#CBD0C4', lcdDark: '#101411', silver: '#C8CBCB', shadow: '#000000', destructive: '#EF6A6F',
  },
  sandalwood: {
    light: {
      background: '#F0E1C8', foreground: '#2A1710', card: '#F8ECD8', cardForeground: '#2A1710', surface: '#E5CBA8', surfaceStrong: '#C6A274', primary: '#8D5B2A', primaryBright: '#B9823E', primaryForeground: '#FFF6E6', green: '#68492D', greenSoft: '#9B7346', muted: '#765C45', mutedForeground: '#92765A', border: '#B58B5B', lcd: '#C9D0BF', lcdDark: '#10120E', silver: '#B58A4A', shadow: '#4B2A18', destructive: '#9A4E3E',
    },
    dark: {
      background: '#160F0B', foreground: '#F7E8CD', card: '#2A1B13', cardForeground: '#F7E8CD', surface: '#3A261A', surfaceStrong: '#5A3A24', primary: '#B8843E', primaryBright: '#E0B15F', primaryForeground: '#201108', green: '#604127', greenSoft: '#8F6B3F', muted: '#C1A98B', mutedForeground: '#9B8064', border: '#76502F', lcd: '#C9D0BF', lcdDark: '#10120E', silver: '#B58A4A', shadow: '#000000', destructive: '#9A4E3E',
    },
  },
  accents: {
    red: { primary: '#D51F2A', primaryBright: '#FF3944', green: '#472B2D', greenSoft: '#714043' },
    green: { primary: '#117A49', primaryBright: '#2FBF78', green: '#153B2A', greenSoft: '#2D7251' },
    blue: { primary: '#1558C9', primaryBright: '#3B82F6', green: '#172E55', greenSoft: '#315D9E' },
    sandalwood: { primary: '#B8843E', primaryBright: '#E0B15F', green: '#604127', greenSoft: '#8F6B3F' },
  },
  radius: 24,
} as const;
export default colors;
