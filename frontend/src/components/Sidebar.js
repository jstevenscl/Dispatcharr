import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Drawer,
  Toolbar,
  Box,
  Typography,
  Avatar,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ListOrdered,
  Play,
  Database,
  SlidersHorizontal,
  LayoutGrid,
  Settings as LucideSettings,
} from 'lucide-react';
import logo from '../images/logo.png';

const navItems = [
  { label: 'Channels', icon: <ListOrdered size={20} />, path: '/channels' },
  { label: 'M3U', icon: <Play size={20} />, path: '/m3u' },
  { label: 'EPG', icon: <Database size={20} />, path: '/epg' },
  { label: 'Stream Profiles', icon: <SlidersHorizontal size={20} />, path: '/stream-profiles' },
  { label: 'TV Guide', icon: <LayoutGrid size={20} />, path: '/guide' },
  { label: 'Settings', icon: <LucideSettings size={20} />, path: '/settings' },
];

const Sidebar = ({ open, drawerWidth, miniDrawerWidth, toggleDrawer }) => {
  const location = useLocation();
  const theme = useTheme();

  return (
    <Drawer
      variant="permanent"
      PaperProps={{
        sx: {
          width: open ? drawerWidth : miniDrawerWidth,
          overflowX: 'hidden',
          transition: 'width 0.3s',
          backgroundColor: theme.palette.background.default,
          color: 'text.primary',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'none',
          border: 'none',
        },
      }}
    >
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: open ? 'space-between' : 'center',
          minHeight: '64px !important',
          px: 2,
        }}
      >
        {open ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
            }}
            onClick={toggleDrawer}
          >
            <img
              src={logo}
              alt="Dispatcharr Logo"
              style={{ width: 28, height: 'auto' }}
            />
            <Typography variant="h6" noWrap sx={{ color: 'text.primary' }}>
              Dispatcharr
            </Typography>
          </Box>
        ) : (
          <img
            src={logo}
            alt="Dispatcharr Logo"
            style={{ width: 28, height: 'auto', cursor: 'pointer' }}
            onClick={toggleDrawer}
          />
        )}
      </Toolbar>

      <List disablePadding sx={{ pt: 0 }}>
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <ListItemButton
              key={item.path}
              component={Link}
              to={item.path}
              sx={{
                px: 2,
                py: 0.5,
                mx: 'auto',
                display: 'flex',
                justifyContent: 'center',
                color: 'inherit',
                width: '100%',
                '&:hover': { backgroundColor: 'unset !important' },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 1,
                  width: open ? '208px' : 'auto',
                  transition: 'all 0.2s ease',
                  bgcolor: isActive
                    ? theme.custom.sidebar.activeBackground
                    : 'transparent',
                  border: isActive
                    ? `1px solid ${theme.custom.sidebar.activeBorder}`
                    : '1px solid transparent',
                  color: 'text.primary',
                  px: 1,
                  py: 0.25,
                  '&:hover': {
                    bgcolor: theme.custom.sidebar.hoverBackground,
                    border: `1px solid ${theme.custom.sidebar.hoverBorder}`,
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: 'text.primary',
                    minWidth: 0,
                    mr: open ? 1 : 'auto',
                    justifyContent: 'center',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {open && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      sx: {
                        fontSize: '14px',
                        fontWeight: 400,
                        fontFamily: theme.custom.sidebar.fontFamily,
                        letterSpacing: '-0.3px',
                        // Keeping the text color as it is in your original
                        color: isActive ? '#d4d4d8' : '#d4d4d8',
                      },
                    }}
                  />
                )}
              </Box>
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ flexGrow: 1 }} />
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar
          alt="John Doe"
          src="/static/images/avatar.png"
          sx={{ width: 32, height: 32 }}
        />
        {open && (
          <Typography variant="body2" noWrap sx={{ color: 'text.primary' }}>
            John Doe
          </Typography>
        )}
      </Box>
    </Drawer>
  );
};

export default Sidebar;
