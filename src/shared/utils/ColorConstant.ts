//* constants/Colors.ts

export const Colors = {
  //* Brand Colors
  primary: '#76B82A', //* Growth Green (Buttons, Active Icons)
  secondary: '#1A4D6D', //* Tech Deep Blue (Header, Secondary Actions)
  accent: '#9CCB3B', //* Sprout Lime (Highlights)

  //* Backgrounds
  background: '#F9FBF9', //* Very light green tint
  cardBackground: '#FFFFFF', //* Pure white

  //* Text Colors
  textPrimary: '#003324', //* Forest Deep Green
  textSecondary: '#8A9597', //* Data Grey
  textInverted: '#FFFFFF', //* White

  //* Status Colors
  success: '#76B82A', //* Growth Green (Success)
  error: '#D32F2F', //* Red (Error)
  warning: '#FBC02D', //* Yellow (Warning)
  border: '#E0E4E5', //* Light grey
} as const;

//*  Create a type based on the object keys
export type ColorKeys = keyof typeof Colors;
