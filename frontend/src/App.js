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
import { ThemeProvider } from '@mui/material/styles'; // Import theme tools
import {
  AppBar,
  Toolbar,
  Typography,
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
import StreamProfiles from './pages/StreamProfiles';
import useAuthStore from './store/auth';
import API from './api';

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
        {/* <AppBar
          position="fixed"
          sx={{
            zIndex: (theme) => theme.zIndex.drawer + 1,
            width: `calc(100% - ${open ? drawerWidth : miniDrawerWidth}px)`,
            ml: `${open ? drawerWidth : miniDrawerWidth}px`,
            transition: 'width 0.3s, margin-left 0.3s',
          }}
        >
          <Toolbar variant="dense"></Toolbar>
        </AppBar> */}

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
          {/* Drawer Toggle Button */}
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
                <img src="/images/logo.png" width="33x" />
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
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            ml: `${open ? drawerWidth : miniDrawerWidth}px`,
            transition: 'width 0.3s, margin-left 0.3s',
            backgroundColor: '#495057',
            // pt: '64px',
          }}
        >
          {/* Fixed Header */}
          {/* <Box sx={{ height: '67px', backgroundColor: '#495057', color: '#fff', display: 'flex', alignItems: 'center', padding: '0 16px' }}>

          </Box> */}

          {/* Main Content Area between Header and Footer */}
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
                  <Route exact path="/channels" element={<Channels />} />
                  <Route exact path="/m3u" element={<M3U />} />
                  <Route exact path="/epg" element={<EPG />} />
                  <Route
                    exact
                    path="/stream-profiles"
                    element={<StreamProfiles />}
                  />
                  <Route exact path="/guide" element={<Guide />} />
                </>
              ) : (
                <Route path="/login" element={<Login />} />
              )}
              {/* Redirect if no match */}
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
    </ThemeProvider>
  );
};

export default App;
