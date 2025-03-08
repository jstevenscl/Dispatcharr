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
  {
    label: 'Stream Profiles',
    icon: <SlidersHorizontal size={20} />,
    path: '/stream-profiles',
  },
  { label: 'TV Guide', icon: <LayoutGrid size={20} />, path: '/guide' },
  { label: 'Settings', icon: <LucideSettings size={20} />, path: '/settings' },
];

const Sidebar = ({ open, drawerWidth, miniDrawerWidth, toggleDrawer }) => {
  const location = useLocation();

  return (
    <Drawer
      variant="permanent"
      PaperProps={{
        sx: {
          width: open ? drawerWidth : miniDrawerWidth,
          overflowX: 'hidden',
          transition: 'width 0.3s',
          backgroundColor: '#18181b',
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
                  bgcolor: isActive ? 'rgba(21, 69, 62, 0.67)' : 'transparent',
                  border: isActive
                    ? '1px solid #14917e'
                    : '1px solid transparent',
                  color: 'text.primary',
                  px: 1,
                  py: 0.25,
                  '&:hover': {
                    bgcolor: '#27272a',
                    border: '1px solid #3f3f46',
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
                        color: isActive ? '##d4d4d8' : '##d4d4d8',
                        fontFamily: 'Inter, sans-serif',
                        letterSpacing: '-0.3px',
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
