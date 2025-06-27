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
import ConfirmationDialog from '../components/ConfirmationDialog';
import useWarningsStore from '../store/warnings';

const UsersPage = () => {
  const theme = useMantineTheme();

  const authUser = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);

  const [selectedUser, setSelectedUser] = useState(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);

  const isWarningSuppressed = useWarningsStore((s) => s.isWarningSuppressed);
  const suppressWarning = useWarningsStore((s) => s.suppressWarning);

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
    // Get user details for the confirmation dialog
    const user = users.find((u) => u.id === id);
    setUserToDelete(user);
    setDeleteTarget(id);

    // Skip warning if it's been suppressed
    if (isWarningSuppressed('delete-user')) {
      return executeDeleteUser(id);
    }

    setConfirmDeleteOpen(true);
  };

  const executeDeleteUser = async (id) => {
    await API.deleteUser(id);
    setConfirmDeleteOpen(false);
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
      </Center>      <UserForm
        user={selectedUser}
        isOpen={userModalOpen}
        onClose={closeUserModal}
      />

      <ConfirmationDialog
        opened={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => executeDeleteUser(deleteTarget)}
        title="Confirm User Deletion"
        message={
          userToDelete ? (
            <div style={{ whiteSpace: 'pre-line' }}>
              {`Are you sure you want to delete the following user?

Username: ${userToDelete.username}
Email: ${userToDelete.email}
User Level: ${USER_LEVEL_LABELS[userToDelete.user_level]}

This action cannot be undone.`}
            </div>
          ) : (
            'Are you sure you want to delete this user? This action cannot be undone.'
          )
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        actionKey="delete-user"
        onSuppressChange={suppressWarning}
        size="md"
      />
    </>
  );
};

export default UsersPage;
