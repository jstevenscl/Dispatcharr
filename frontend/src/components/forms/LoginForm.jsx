import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/auth';
import { Paper, Title, TextInput, Button, Center, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import API from '../../api';
import useNotificationsStore from '../../store/notifications';
import useUpdatePromptStore from '../../store/updatePrompt';

const LoginForm = () => {
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initData = useAuthStore((s) => s.initData);

  const navigate = useNavigate(); // Hook to navigate to other routes
  const [formData, setFormData] = useState({ username: '', password: '' });
  const notifStore = useNotificationsStore();
  const openUpdatePrompt = useUpdatePromptStore((s) => s.openWith);

  // useEffect(() => {
  //   if (isAuthenticated) {
  //     navigate('/channels');
  //   }
  // }, [isAuthenticated, navigate]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await login(formData);

    try {
      await initData();
      // After successful login and data init, check for updates per user prefs
      try {
        const latest = await API.getLatestRelease();
        if (latest && latest.is_newer) {
          const prefs = notifStore.prefs?.notifications || {};
          const updates = prefs.updates || {};
          const ignored = new Set(updates.ignored_versions || []);
          const policy = updates.policy || 'on_login';

          // Respect policy and ignored versions
          if (!ignored.has(latest.latest_version)) {
            const now = new Date();
            let allow = false;
            if (policy === 'never') allow = false;
            else if (policy === 'on_login') allow = true;
            else if (policy === 'daily' || policy === 'weekly') {
              const last = updates.last_shown_at ? new Date(updates.last_shown_at) : null;
              const diffMs = last ? now - last : Number.POSITIVE_INFINITY;
              const threshold = policy === 'daily' ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
              allow = diffMs >= threshold;
            } else allow = true;

            if (allow) {
              notifications.show({
                title: 'Update available',
                message: (
                  <span>
                    Dispatcharr {latest.latest_version} is available.{' '}
                    <a href={latest.latest_url} target="_blank" rel="noreferrer">
                      View on GitHub
                    </a>
                  </span>
                ),
                color: 'blue.5',
                autoClose: false,
                onClose: () => openUpdatePrompt(latest.latest_version, latest.latest_url),
              });
              // Record show time locally (persist on modal choice)
            }
          }
        }
      } catch (e) {
        // non-fatal
        console.warn('Update check failed:', e);
      }
      navigate('/channels');
    } catch (e) {
      console.log(`Failed to login: ${e}`);
    }
  };

  return (
    <Center
      style={{
        height: '100vh',
      }}
    >
      <Paper
        elevation={3}
        style={{ padding: 30, width: '100%', maxWidth: 400 }}
      >
        <Title order={4} align="center">
          Login
        </Title>
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label="Username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              required
            />

            <TextInput
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              // required
            />

            <Button type="submit" mt="sm">
              Login
            </Button>
          </Stack>
        </form>
      </Paper>
      {null}
    </Center>
  );
};

export default LoginForm;
