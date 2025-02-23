// src/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, Link } from 'react-router-dom';
import HeaderBar from './components/HeaderBar';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Login from './pages/Login';
import useAuthStore from './store/auth';
import Channels from './pages/Channels';
import M3U from './pages/M3U';
import { createTheme, ThemeProvider } from '@mui/material/styles';  // Import theme tools
import {
  Box,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import theme from './theme'

import {
  Menu as MenuIcon,
  Home as HomeIcon,
  Settings as SettingsIcon,
  Info as InfoIcon,
  Description as DescriptionIcon,
  Tv as TvIcon,
  CalendarMonth as CalendarMonthIcon,
} from '@mui/icons-material';
import EPG from './pages/EPG';

const drawerWidth = 240;
const miniDrawerWidth = 60;

const items = [
  { text: 'Channels', icon: <TvIcon />, route: "/channels" },
  { text: 'M3U', icon: <DescriptionIcon />, route: "/m3u" },
  { text: 'EPG', icon: <CalendarMonthIcon />, route: "/epg" },
];

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
            <List>
              <ListItem disablePadding>
                <ListItemButton onClick={toggleDrawer}>
                  <img src="/images/logo.png" width="35x" />
                  {open && <ListItemText primary="Dispatcharr" sx={{paddingLeft: 3}}/>}
                </ListItemButton>
              </ListItem>
            </List>

            <Divider />

            {/* Drawer Navigation Items */}
            <List>
              {items.map((item) => (
                <ListItem key={item.text} disablePadding>
                    <ListItemButton component={Link} to={item.route}>
                      <ListItemIcon>{item.icon}</ListItemIcon>
                      {open && <ListItemText primary={item.text} />}
                    </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Drawer>
        <Box sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          ml: `${open ? drawerWidth : miniDrawerWidth}px`,
          transition: 'width 0.3s, margin-left 0.3s',
        }}>
          {/* Fixed Header */}
          <Box sx={{ height: '67px', backgroundColor: '#495057', color: '#fff', display: 'flex', alignItems: 'center', padding: '0 16px' }}>

          </Box>

          {/* Main Content Area between Header and Footer */}
          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route exact path="/channels" element={<ProtectedRoute element={<Channels />}/>} />
              <Route exact path="/m3u" element={<ProtectedRoute element={<M3U />}/>} />
              <Route exact path="/epg" element={<ProtectedRoute element={<EPG />}/>} />
            </Routes>
          </Box>
      </Box>
      </Router>
    </ThemeProvider>
  );
};

export default App;
