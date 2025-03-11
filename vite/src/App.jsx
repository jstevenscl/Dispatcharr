// frontend/src/App.js
import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from 'react-router-dom';
// import Sidebar from './components/Sidebar';
import Sidebar from './components/Sidebar-new';
import Login from './pages/Login';
import Channels from './pages/Channels';
import M3U from './pages/M3U';
import { ThemeProvider } from '@mui/material/styles';
import { Box, CssBaseline, GlobalStyles } from '@mui/material';
import theme from './theme';
import EPG from './pages/EPG';
import Guide from './pages/Guide';
import Settings from './pages/Settings';
import StreamProfiles from './pages/StreamProfiles';
import useAuthStore from './store/auth';
import Alert from './components/Alert';
import FloatingVideo from './components/FloatingVideo';
import SuperuserForm from './components/forms/SuperuserForm';
import { WebsocketProvider } from './WebSocket';
import { AppShell, MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css'; // Ensure Mantine global styles load
import 'mantine-react-table/styles.css';
import mantineTheme from './mantineTheme';

const drawerWidth = 240;
const miniDrawerWidth = 60;
const defaultRoute = '/channels';

const App = () => {
  const [open, setOpen] = useState(true);
  const [needsSuperuser, setNeedsSuperuser] = useState(false);
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

  // Check if a superuser exists on first load.
  useEffect(() => {
    async function checkSuperuser() {
      try {
        const response = await fetch('/api/accounts/initialize-superuser/');
        const res = await response.json();
        if (!res.data.superuser_exists) {
          setNeedsSuperuser(true);
        }
      } catch (error) {
        console.error('Error checking superuser status:', error);
      }
    }
    checkSuperuser();
  }, []);

  // Authentication check
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

  // If no superuser exists, show the initialization form
  if (needsSuperuser) {
    return <SuperuserForm onSuccess={() => setNeedsSuperuser(false)} />;
  }

  return (
    <MantineProvider
      defaultColorScheme="dark"
      theme={mantineTheme}
      withGlobalStyles
      withNormalizeCSS
    >
      <ThemeProvider theme={theme}>
        <GlobalStyles
          styles={{
            '.Mui-TableHeadCell-Content': {
              height: '100%',
              alignItems: 'flex-end !important',
            },
          }}
        />
        <WebsocketProvider>
          <Router>
            <AppShell
              header={{
                height: 0,
              }}
              navbar={{
                width: open ? drawerWidth : miniDrawerWidth,
              }}
            >
              <Sidebar
                drawerWidth
                miniDrawerWidth
                collapsed={!open}
                toggleDrawer={toggleDrawer}
              />

              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  ml: `${open ? drawerWidth : miniDrawerWidth}px`,
                  // transition: 'margin-left 0.3s',
                  backgroundColor: 'background.default',
                  minHeight: '100vh',
                  color: 'text.primary',
                }}
              >
                <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
                  <Routes>
                    {isAuthenticated ? (
                      <>
                        <Route path="/channels" element={<Channels />} />
                        <Route path="/m3u" element={<M3U />} />
                        <Route path="/epg" element={<EPG />} />
                        <Route
                          path="/stream-profiles"
                          element={<StreamProfiles />}
                        />
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
            </AppShell>
          </Router>

          <Alert />
          <FloatingVideo />
        </WebsocketProvider>
      </ThemeProvider>
    </MantineProvider>
  );
};

export default App;
