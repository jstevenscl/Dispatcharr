import React, { useState, useMemo } from 'react';
import {
  Typography,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Button,
  Box,
  Switch,
  IconButton,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import API from '../../api';
import M3UProfile from './M3UProfile';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import usePlaylistsStore from '../../store/playlists';

const M3UProfiles = ({ playlist = null, isOpen, onClose }) => {
  const profiles = usePlaylistsStore((state) => state.profiles[playlist.id]);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profile, setProfile] = useState(null);

  const editProfile = (profile = null) => {
    if (profile) {
      setProfile(profile);
    }

    setProfileEditorOpen(true);
  };

  const deleteProfile = async (id) => {
    await API.deleteM3UProfile(playlist.id, id);
  };

  const toggleActive = async (values) => {
    await API.updateM3UProfile(playlist.id, {
      ...values,
      is_active: !values.is_active,
    });
  };

  const closeEditor = () => {
    setProfile(null);
    setProfileEditorOpen(false);
  };

  if (!isOpen || !profiles) {
    return <></>;
  }

  return (
    <>
      <Dialog open={isOpen} onClose={onClose}>
        <DialogTitle
          sx={{
            backgroundColor: 'primary.main',
            color: 'primary.contrastText',
          }}
        >
          Profiles
        </DialogTitle>
        <DialogContent>
          <List>
            {profiles
              .filter((playlist) => playlist.is_default == false)
              .map((item) => (
                <ListItem
                  key={item.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 2,
                  }}
                >
                  <ListItemText
                    primary={item.name}
                    secondary={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body2" sx={{ marginRight: 2 }}>
                          Max Streams: {item.max_streams}
                        </Typography>
                        <Switch
                          checked={item.is_active}
                          onChange={() => toggleActive(item)}
                          color="primary"
                          inputProps={{ 'aria-label': 'active switch' }}
                        />
                        <IconButton
                          onClick={() => editProfile(item)}
                          color="warning"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => deleteProfile(item.id)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
          </List>
        </DialogContent>

        <DialogActions>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={editProfile}
          >
            New
          </Button>
        </DialogActions>
      </Dialog>

      <M3UProfile
        m3u={playlist}
        profile={profile}
        isOpen={profileEditorOpen}
        onClose={closeEditor}
      />
    </>
  );
};

export default M3UProfiles;
