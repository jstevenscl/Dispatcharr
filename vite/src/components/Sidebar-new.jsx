import { Link, useLocation } from 'react-router-dom';
import {
  ListOrdered,
  Play,
  Database,
  SlidersHorizontal,
  LayoutGrid,
  Settings as LucideSettings,
} from 'lucide-react';
import {
  Avatar,
  AppShell,
  Group,
  Stack,
  Box,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useState } from 'react';
import headerLogo from '../images/dispatcharr.svg';
import logo from '../images/logo.png';

// Navigation Items
const navItems = [
  {
    label: 'Channels',
    icon: <ListOrdered size={20} />,
    path: '/channels',
    // badge: '(323)',
  },
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

const Sidebar = ({ collapsed, toggleDrawer, drawerWidth, miniDrawerWidth }) => {
  const location = useLocation();

  return (
    <AppShell.Navbar
      width={{ base: collapsed ? miniDrawerWidth : drawerWidth }}
      p="xs"
      style={{
        backgroundColor: '#1A1A1E',
        // transition: 'width 0.3s ease',
        borderRight: '1px solid #2A2A2E',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Brand - Click to Toggle */}
      <Group
        onClick={toggleDrawer}
        spacing="sm"
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 12px',
          fontSize: 18,
          fontWeight: 600,
          color: '#FFFFFF',
          justifyContent: collapsed ? 'center' : 'flex-start',
          whiteSpace: 'nowrap',
        }}
      >
        {/* <ListOrdered size={24} /> */}
        <img width={30} src={logo} />
        {!collapsed && (
          <Text
            sx={{
              opacity: collapsed ? 0 : 1,
              transition: 'opacity 0.2s ease-in-out',
              whiteSpace: 'nowrap', // Ensures text never wraps
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: collapsed ? 0 : 150, // Prevents reflow
            }}
          >
            Dispatcharr
          </Text>
        )}
      </Group>

      {/* Navigation Links */}
      <Stack spacing="sm" mt="lg">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <UnstyledButton
              key={item.path}
              component={Link}
              to={item.path}
              style={{
                display: 'flex',
                flexDirection: 'row', // Ensures horizontal layout
                flexWrap: 'nowrap',
                alignItems: 'center',
                gap: 12,
                padding: collapsed ? '5px 8px' : '10px 16px',
                borderRadius: 6,
                color: isActive ? '#FFFFFF' : '#D4D4D8',
                backgroundColor: isActive ? '#245043' : 'transparent',
                border: isActive
                  ? '1px solid #3BA882'
                  : '1px solid transparent',
                transition: 'all 0.3s ease',
                '&:hover': {
                  backgroundColor: isActive ? '#3A3A40' : '#2A2F34', // Gray hover effect when active
                  border: isActive ? '1px solid #3BA882' : '1px solid #3D3D42',
                },
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
            >
              {item.icon}
              {!collapsed && (
                <Text
                  sx={{
                    opacity: collapsed ? 0 : 1,
                    transition: 'opacity 0.2s ease-in-out',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: collapsed ? 0 : 150,
                  }}
                >
                  {item.label}
                </Text>
              )}
              {!collapsed && item.badge && (
                <Text
                  size="sm"
                  style={{ color: '#D4D4D8', whiteSpace: 'nowrap' }}
                >
                  {item.badge}
                </Text>
              )}
            </UnstyledButton>
          );
        })}
      </Stack>

      {/* Profile Section */}
      <Box
        style={{
          marginTop: 'auto',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderTop: '1px solid #2A2A2E',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <Avatar src="https://via.placeholder.com/40" radius="xl" />
        {!collapsed && (
          <Group
            style={{
              flex: 1,
              justifyContent: 'space-between',
              whiteSpace: 'nowrap',
            }}
          >
            <Text size="sm" color="white">
              John Doe
            </Text>
            <Text size="sm" color="white">
              •••
            </Text>
          </Group>
        )}
      </Box>
    </AppShell.Navbar>
  );
};

export default Sidebar;
