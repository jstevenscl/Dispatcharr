import React from 'react';
import ReactDOM from 'react-dom/client'; // Import the "react-dom/client" for React 18
import './index.css';  // Optional styles
import App from './App';  // Import your App component
import useAuthStore from './store/auth';
import useChannelsStore from './store/channels';
import useStreamsStore from './store/streams';
import useUserAgentsStore from './store/userAgents';
import usePlaylistsStore from './store/playlists';
import useEPGsStore from './store/epgs';

// Create a root element
const root = ReactDOM.createRoot(document.getElementById('root'));

const authStore = useAuthStore.getState();
const channelsStore = useChannelsStore.getState();
const streamsStore = useStreamsStore.getState();
const userAgentsStore = useUserAgentsStore.getState();
const playlistsStore = usePlaylistsStore.getState();
const epgsStore = useEPGsStore.getState()

await authStore.initializeAuth();

console.log(authStore)
// if (authStore.isAuthenticated) {
  await Promise.all([
    authStore.initializeAuth(),
    channelsStore.fetchChannels(),
    channelsStore.fetchChannelGroups(),
    streamsStore.fetchStreams(),
    userAgentsStore.fetchUserAgents(),
    playlistsStore.fetchPlaylists(),
    epgsStore.fetchEPGs(),
  ])
// }

// Render your app using the "root.render" method
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
