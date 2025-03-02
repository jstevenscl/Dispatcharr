// frontend/src/App.js
import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Channels from './pages/Channels';
import M3U from './pages/M3U';
import { ThemeProvider } from '@mui/material/styles';
import {
  Box,
  CssBaseline,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
} from '@mui/material';
import theme from './theme';
import EPG from './pages/EPG';
import Guide from './pages/Guide';
import Settings from './pages/Settings';
import StreamProfiles from './pages/StreamProfiles';
import useAuthStore from './store/auth';
import logo from './images/logo.png';

// NEW: import the floating PiP component
import FloatingVideo from './components/FloatingVideo';

const drawerWidth = 240;
const miniDrawerWidth = 60;

const defaultRoute = '/channels';

const App = () => {
  const [open, setOpen] = useState(true);
  const {
    isAuthenticated,
    setIsAuthenticated,
    logout,
    initData,
    initializeAuth,
  } = useAuthStore();

  const toggleDrawer = () => {
    setOpen(!open);
  };

  useEffect(() => {
    const checkAuth = async () => {
      const loggedIn = await initializeAuth();
      if (loggedIn) {
        await initData();
        setIsAuthenticated(true);
      } else {
        await logout();
      }
    };
    checkAuth();
  }, [initializeAuth, initData, setIsAuthenticated, logout]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Drawer
          variant="permanent"
          open={open}
          sx={{
            width: open ? drawerWidth : miniDrawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: open ? drawerWidth : miniDrawerWidth,
              transition: 'width 0.3s',
              overflowX: 'hidden',
            },
          }}
        >
          <List sx={{ backgroundColor: '#495057', color: 'white' }}>
            <ListItem disablePadding>
              <ListItemButton
                onClick={toggleDrawer}
                size="small"
                sx={{
                  pt: 0,
                  pb: 0,
                }}
              >
                <img src={logo} width="33x" alt="logo" />
                {open && (
                  <ListItemText primary="Dispatcharr" sx={{ paddingLeft: 3 }} />
                )}
              </ListItemButton>
            </ListItem>
          </List>

          <Divider />

          <Sidebar open />
        </Drawer>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            ml: `${open ? drawerWidth : miniDrawerWidth}px`,
            transition: 'width 0.3s, margin-left 0.3s',
            // height: '100vh',
            backgroundColor: '#495057',
          }}
        >
          <Box
            sx={{
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Routes>
              {isAuthenticated ? (
                <>
                  <Route path="/channels" element={<Channels />} />
                  <Route path="/m3u" element={<M3U />} />
                  <Route path="/epg" element={<EPG />} />
                  <Route path="/stream-profiles" element={<StreamProfiles />} />
                  <Route path="/guide" element={<Guide />} />
                  <Route path="/settings" element={<Settings />} />
                </>
              ) : (
                <Route path="/login" element={<Login />} />
              )}
              <Route
                path="*"
                element={
                  <Navigate
                    to={isAuthenticated ? defaultRoute : '/login'}
                    replace
                  />
                }
              />
            </Routes>
          </Box>
        </Box>
      </Router>

      {/* Always-available floating video; remains visible across page changes */}
      <FloatingVideo />
    </ThemeProvider>
  );
};

export default App;
