import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#495057',
      contrastText: '#ffffff', // Ensure text is visible on primary color
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          // textTransform: 'none', // Disable uppercase on buttons
        },
      },
    },
  },
});

export default theme;
