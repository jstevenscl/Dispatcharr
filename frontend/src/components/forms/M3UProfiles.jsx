import React, { useState, useMemo, useEffect } from 'react';
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
  NumberInput,
  useMantineTheme,
  Center,
  Group,
  Switch,
} from '@mantine/core';
import { SquareMinus, SquarePen } from 'lucide-react';

const M3UProfiles = ({ playlist = null, isOpen, onClose }) => {
  const theme = useMantineTheme();

  const allProfiles = usePlaylistsStore((s) => s.profiles);

  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    setProfiles(allProfiles[playlist.id]);
  }, [allProfiles]);

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

  const modifyMaxStreams = async (value, item) => {
    await API.updateM3UProfile(playlist.id, {
      ...item,
      max_streams: value,
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
              key={item.id} // Uncomment/add key prop to fix the list warning
            // sx={{
            //   display: 'flex',
            //   alignItems: 'center',
            //   marginBottom: 2,
            // }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Group justify="space-between">
                  <Text fw={600}>{item.name}</Text>
                  <Switch
                    checked={item.is_active}
                    onChange={() => toggleActive(item)}
                    disabled={item.is_default}
                    style={{ paddingTop: 6 }}
                  />
                </Group>

                <Flex gap="sm">
                  <NumberInput
                    label="Max Streams"
                    value={item.max_streams}
                    disabled={item.is_default}
                    onChange={(value) => modifyMaxStreams(value, item)}
                    style={{ flex: 1 }}
                  />

                  {!item.is_default && (
                    <Group
                      align="flex-end"
                      gap="xs"
                      style={{ paddingBottom: 8 }}
                    >
                      <ActionIcon
                        size="sm"
                        variant="transparent"
                        color={theme.tailwind.yellow[3]}
                        onClick={() => editProfile(item)}
                      >
                        <SquarePen size="=20" />
                      </ActionIcon>

                      <ActionIcon
                        color={theme.tailwind.red[6]}
                        onClick={() => deleteProfile(item.id)}
                        size="small"
                        variant="transparent"
                      >
                        <SquareMinus size="20" />
                      </ActionIcon>
                    </Group>
                  )}
                </Flex>
              </Box>
            </Card>
          ))}

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={editProfile}
            style={{ width: '100%' }}
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
