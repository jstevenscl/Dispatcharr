// frontend/src/theme.js
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#2B2C30', // Dark background
      paper: '#333539',   // Slightly lighter panel background
    },
    primary: {
      // Adjust accent color if your Figma calls for a different highlight
      main: '#4A90E2',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#F5A623',
      contrastText: '#FFFFFF',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#C3C3C3',
    },
  },
  typography: {
    fontFamily: ['Roboto', 'Helvetica', 'Arial', 'sans-serif'].join(','),
    // Example typography tweaks
    h6: {
      fontWeight: 500,
      fontSize: '0.95rem',
    },
    body1: {
      fontSize: '0.875rem',
    },
  },
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
          backgroundColor: '#333539',
          color: '#FFFFFF',
        },
      },
    },
    // We remove the AppBar override since we won't be using it in App.js anymore
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#2B2C30',
        },
      },
    },
    // Feel free to override more MUI components as needed...
  },
});

export default theme;
