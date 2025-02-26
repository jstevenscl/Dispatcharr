import React, { useState } from "react";
import useUserAgentsStore from "../store/userAgents";
import { Box } from "@mui/material";
import M3UsTable from "../components/tables/M3UsTable";
import UserAgentsTable from "../components/tables/UserAgentsTable";
import usePlaylistsStore from "../store/playlists";
import API from "../api";
import M3UForm from "../components/forms/M3U";

const M3UPage = () => {
  const isLoading = useUserAgentsStore((state) => state.isLoading);
  const error = useUserAgentsStore((state) => state.error);
  const playlists = usePlaylistsStore((state) => state.playlists);

  const [playlist, setPlaylist] = useState(null);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);

  const [userAgent, setUserAgent] = useState(null);
  const [userAgentModalOpen, setUserAgentModalOpen] = useState(false);

  const editUserAgent = async (userAgent = null) => {
    setUserAgent(userAgent);
    setUserAgentModalOpen(true);
  };

  const editPlaylist = async (playlist = null) => {
    setPlaylist(playlist);
    setPlaylistModalOpen(true);
  };

  const deleteUserAgent = async (ids) => {
    if (Array.isArray(ids)) {
      await API.deleteUserAgents(ids);
    } else {
      await API.deleteUserAgent(ids);
    }
  };

  const deletePlaylist = async (id) => {
    await API.deletePlaylist(id);
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <Box sx={{ flex: "1 1 50%", overflow: "hidden" }}>
        <M3UsTable />
      </Box>

      <Box sx={{ flex: "1 1 50%", overflow: "hidden" }}>
        <UserAgentsTable />
      </Box>

      <M3UForm
        playlist={playlist}
        isOpen={playlistModalOpen}
        onClose={() => setPlaylistModalOpen(false)}
      />
    </Box>
  );
};

export default M3UPage;
