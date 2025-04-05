import React, { useState, useMemo } from 'react';
import API from '../../api';
import M3UProfile from './M3UProfile';
import usePlaylistsStore from '../../store/playlists';
import {
  Card,
  Checkbox,
  Flex,
  Modal,
  Button,
  Box,
  ActionIcon,
  Text,
} from '@mantine/core';
import { SquareMinus, SquarePen } from 'lucide-react';

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
      <Modal opened={isOpen} onClose={onClose} title="Profiles">
        {profiles
          // .filter((playlist) => playlist.is_default == false)
          .map((item) => (
            <Card
            // key={item.id}
            // sx={{
            //   display: 'flex',
            //   alignItems: 'center',
            //   marginBottom: 2,
            // }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Text>Max Streams: {item.max_streams}</Text>
                <Checkbox
                  label="Is Active"
                  checked={item.is_active}
                  onChange={() => toggleActive(item)}
                  color="primary"
                />
                <ActionIcon
                  onClick={() => editProfile(item)}
                  color="yellow.5"
                  variant="transparent"
                >
                  <SquarePen size="18" />
                </ActionIcon>
                <ActionIcon
                  onClick={() => deleteProfile(item.id)}
                  color="red.9"
                  variant="transparent"
                >
                  <SquareMinus size="18" />
                </ActionIcon>
              </Box>
            </Card>
          ))}

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={editProfile}
          >
            New
          </Button>
        </Flex>
      </Modal>

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
