import React, { useState } from 'react';
import useUsersStore from '../store/users';
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import { SquareMinus, SquarePen, SquarePlus } from 'lucide-react';
import UserForm from '../components/forms/User';
import useAuthStore from '../store/auth';
import API from '../api';
import { USER_LEVELS, USER_LEVEL_LABELS } from '../constants';

const UsersPage = () => {
  const theme = useMantineTheme();

  const authUser = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);

  const [selectedUser, setSelectedUser] = useState(null);
  const [userModalOpen, setUserModalOpen] = useState(false);

  console.log(authUser);

  const closeUserModal = () => {
    setSelectedUser(null);
    setUserModalOpen(false);
  };

  const editUser = (user) => {
    setSelectedUser(user);
    setUserModalOpen(true);
  };

  const deleteUser = (id) => {
    API.deleteUser(id);
  };

  return (
    <>
      <Center>
        <Paper
          style={{
            minWidth: 600,
            padding: 10,
            margin: 20,
          }}
        >
          <Stack>
            <Box>
              <Button
                leftSection={<SquarePlus size={18} />}
                variant="light"
                size="xs"
                onClick={() => editUser()}
                p={5}
                color="green"
                style={{
                  borderWidth: '1px',
                  borderColor: 'green',
                  color: 'white',
                }}
              >
                Add User
              </Button>
            </Box>

            {users
              .sort((a, b) => a.id > b.id)
              .map((user) => {
                if (!user) {
                  return <></>;
                }

                return (
                  <Group justify="space-between">
                    <Box flex={1} style={{ alignContent: 'flex-start' }}>
                      {user.username}
                    </Box>

                    <Box flex={1} style={{ alignContent: 'flex-start' }}>
                      {user.email}
                    </Box>

                    {authUser.user_level == USER_LEVELS.ADMIN && (
                      <Group>
                        <Text>{USER_LEVEL_LABELS[user.user_level]}</Text>
                        <ActionIcon
                          size={18}
                          variant="transparent"
                          color={theme.tailwind.yellow[3]}
                          onClick={() => editUser(user)}
                        >
                          <SquarePen size="18" />
                        </ActionIcon>

                        <ActionIcon
                          size={18}
                          variant="transparent"
                          color={theme.tailwind.red[6]}
                          onClick={() => deleteUser(user.id)}
                          disabled={authUser.id === user.id}
                        >
                          <SquareMinus size="18" />
                        </ActionIcon>
                      </Group>
                    )}
                  </Group>
                );
              })}
          </Stack>
        </Paper>
      </Center>

      <UserForm
        user={selectedUser}
        isOpen={userModalOpen}
        onClose={closeUserModal}
      />
    </>
  );
};

export default UsersPage;
