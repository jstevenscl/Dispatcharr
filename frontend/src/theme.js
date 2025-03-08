// src/theme.js
import { createTheme } from '@mui/material/styles';

const sharedColors = {
  primary: '#4A90E2',
  secondary: '#F5A623',
  background: '#18181b', // Global background color on every page
  paper: '#333539',
  textPrimary: '#FFFFFF',
  textSecondary: '#C3C3C3',
};

const sharedTypography = {
  fontFamily: ['Roboto', 'Helvetica', 'Arial', 'sans-serif'].join(','),
  h1: { fontSize: '2.5rem', fontWeight: 700 },
  h2: { fontSize: '2rem', fontWeight: 700 },
  body1: { fontSize: '1rem' },
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: sharedColors.background, // This is now #18181b
      paper: sharedColors.paper,
    },
    primary: {
      main: sharedColors.primary,
      contrastText: sharedColors.textPrimary,
    },
    secondary: {
      main: sharedColors.secondary,
      contrastText: sharedColors.textPrimary,
    },
    text: {
      primary: sharedColors.textPrimary,
      secondary: sharedColors.textSecondary,
    },
  },
  typography: sharedTypography,
  spacing: 8,
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: sharedColors.paper,
          color: sharedColors.textPrimary,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: sharedColors.background,
        },
      },
    },
  },
  custom: {
    sidebar: {
      activeBackground: 'rgba(21, 69, 62, 0.67)',
      activeBorder: '#14917e',
      hoverBackground: '#27272a',
      hoverBorder: '#3f3f46',
      fontFamily: 'Inter, sans-serif',
    },
  },
});

export default theme;
