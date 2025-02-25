// src/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import useAuthStore from './store/auth';
import Channels from './pages/Channels';
import M3U from './pages/M3U';
import { ThemeProvider } from '@mui/material/styles';  // Import theme tools
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
import theme from './theme'
import EPG from './pages/EPG';
import Guide from './pages/Guide';
import StreamProfiles from './pages/StreamProfiles';

const drawerWidth = 240;
const miniDrawerWidth = 60;

// Protected Route Component
const ProtectedRoute = ({ element, ...rest }) => {
  const { isAuthenticated } = useAuthStore();

  return isAuthenticated ? element : <Navigate to="/login" />;
};

const App = () => {
  const [open, setOpen] = useState(true);

  const toggleDrawer = () => {
    setOpen(!open);
  };

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
          {/* Drawer Toggle Button */}
          <List sx={{backgroundColor: '#495057', color: 'white'}}>
            <ListItem disablePadding>
              <ListItemButton onClick={toggleDrawer}>
                <img src="/images/logo.png" width="35x" />
                {open && <ListItemText primary="Dispatcharr" sx={{paddingLeft: 3}}/>}
              </ListItemButton>
            </ListItem>
          </List>

          <Divider />

          <Sidebar open />
        </Drawer>

        <Box sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          ml: `${open ? drawerWidth : miniDrawerWidth}px`,
          transition: 'width 0.3s, margin-left 0.3s',
          backgroundColor: '#495057',
        }}>
          {/* Fixed Header */}
          {/* <Box sx={{ height: '67px', backgroundColor: '#495057', color: '#fff', display: 'flex', alignItems: 'center', padding: '0 16px' }}>

          </Box> */}

          {/* Main Content Area between Header and Footer */}
          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route exact path="/channels" element={<ProtectedRoute element={<Channels />}/>} />
              <Route exact path="/m3u" element={<ProtectedRoute element={<M3U />}/>} />
              <Route exact path="/epg" element={<ProtectedRoute element={<EPG />}/>} />
              <Route exact path="/stream-profiles" element={<ProtectedRoute element={<StreamProfiles />}/>} />
              <Route exact path="/guide" element={<ProtectedRoute element={<Guide />}/>} />
            </Routes>
          </Box>
        </Box>
      </Router>
    </ThemeProvider>
  );
};

export default App;
