import React, { useEffect, useMemo, useCallback, useState } from 'react';
import API from '../../api';
import UserForm from '../forms/User';
import useUsersStore from '../../store/users';
import useAuthStore from '../../store/auth';
import { USER_LEVELS, USER_LEVEL_LABELS } from '../../constants';
import useWarningsStore from '../../store/warnings';
import {
    SquarePlus,
    SquareMinus,
    SquarePen,
    EllipsisVertical,
} from 'lucide-react';
import {
    ActionIcon,
    Box,
    Text,
    Paper,
    Button,
    Flex,
    Group,
    useMantineTheme,
    Menu,
    UnstyledButton,
    LoadingOverlay,
    Stack,
} from '@mantine/core';
import { CustomTable, useTable } from './CustomTable';
import ConfirmationDialog from '../ConfirmationDialog';
import useLocalStorage from '../../hooks/useLocalStorage';

const UserRowActions = ({ theme, row, editUser, deleteUser }) => {
    const [tableSize, _] = useLocalStorage('table-size', 'default');
    const authUser = useAuthStore((s) => s.user);

    const onEdit = useCallback(() => {
        editUser(row.original);
    }, [row.original, editUser]);

    const onDelete = useCallback(() => {
        deleteUser(row.original.id);
    }, [row.original.id, deleteUser]);

    const iconSize =
        tableSize == 'default' ? 'sm' : tableSize == 'compact' ? 'xs' : 'md';

    return (
        <Box style={{ width: '100%', justifyContent: 'left' }}>
            <Group gap={2} justify="center">
                <ActionIcon
                    size={iconSize}
                    variant="transparent"
                    color={theme.tailwind.yellow[3]}
                    onClick={onEdit}
                    disabled={authUser.user_level !== USER_LEVELS.ADMIN}
                >
                    <SquarePen size="18" />
                </ActionIcon>

                <ActionIcon
                    size={iconSize}
                    variant="transparent"
                    color={theme.tailwind.red[6]}
                    onClick={onDelete}
                    disabled={authUser.user_level !== USER_LEVELS.ADMIN || authUser.id === row.original.id}
                >
                    <SquareMinus size="18" />
                </ActionIcon>
            </Group>
        </Box>
    );
};

const UsersTable = () => {
    const theme = useMantineTheme();

    /**
     * STORES
     */
    const users = useUsersStore((s) => s.users);
    const authUser = useAuthStore((s) => s.user);
    const isWarningSuppressed = useWarningsStore((s) => s.isWarningSuppressed);
    const suppressWarning = useWarningsStore((s) => s.suppressWarning);

    /**
     * useState
     */
    const [selectedUser, setSelectedUser] = useState(null);
    const [userModalOpen, setUserModalOpen] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [userToDelete, setUserToDelete] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Functions
     */
    const executeDeleteUser = useCallback(async (id) => {
        setIsLoading(true);
        await API.deleteUser(id);
        setIsLoading(false);
        setConfirmDeleteOpen(false);
    }, []);

    const editUser = useCallback(async (user = null) => {
        setSelectedUser(user);
        setUserModalOpen(true);
    }, []);

    const deleteUser = useCallback(async (id) => {
        const user = users.find((u) => u.id === id);
        setUserToDelete(user);
        setDeleteTarget(id);

        if (isWarningSuppressed('delete-user')) {
            return executeDeleteUser(id);
        }

        setConfirmDeleteOpen(true);
    }, [users, isWarningSuppressed, executeDeleteUser]);

    /**
     * useMemo
     */
    const columns = useMemo(
        () => [
            {
                header: 'Username',
                accessorKey: 'username',
                cell: ({ getValue }) => (
                    <Box
                        style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {getValue()}
                    </Box>
                ),
            },
            {
                header: 'Email',
                accessorKey: 'email',
                cell: ({ getValue }) => (
                    <Box
                        style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {getValue()}
                    </Box>
                ),
            },
            {
                header: 'User Level',
                accessorKey: 'user_level',
                size: 120,
                cell: ({ getValue }) => (
                    <Text size="sm">
                        {USER_LEVEL_LABELS[getValue()]}
                    </Text>
                ),
            },
            {
                id: 'actions',
                size: 80,
                header: 'Actions',
                cell: ({ row }) => (
                    <UserRowActions
                        theme={theme}
                        row={row}
                        editUser={editUser}
                        deleteUser={deleteUser}
                    />
                ),
            },
        ],
        [theme, editUser, deleteUser]
    );

    const closeUserForm = () => {
        setSelectedUser(null);
        setUserModalOpen(false);
    };

    const data = useMemo(() => {
        return users.sort((a, b) => a.id - b.id);
    }, [users]);

    const renderHeaderCell = (header) => {
        return (
            <Text size="sm" name={header.id}>
                {header.column.columnDef.header}
            </Text>
        );
    };

    const table = useTable({
        columns,
        data,
        allRowIds: data.map((user) => user.id),
        enablePagination: false,
        enableRowSelection: false,
        enableRowVirtualization: false,
        renderTopToolbar: false,
        manualSorting: false,
        manualFiltering: false,
        manualPagination: false,
        headerCellRenderFns: {
            actions: renderHeaderCell,
            username: renderHeaderCell,
            email: renderHeaderCell,
            user_level: renderHeaderCell,
        },
    });

    return (
        <>
            <Stack gap={0} style={{ padding: 0 }}>
                <Flex style={{ alignItems: 'center', paddingBottom: 10 }} gap={15}>
                    <Text
                        style={{
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500,
                            fontSize: '20px',
                            lineHeight: 1,
                            letterSpacing: '-0.3px',
                            color: 'gray.6',
                            marginBottom: 0,
                        }}
                    >
                        Users
                    </Text>
                </Flex>

                <Paper>
                    <Box
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            padding: 10,
                        }}
                    >
                        <Flex gap={6}>
                            <Button
                                leftSection={<SquarePlus size={18} />}
                                variant="light"
                                size="xs"
                                onClick={() => editUser()}
                                p={5}
                                color={theme.tailwind.green[5]}
                                style={{
                                    borderWidth: '1px',
                                    borderColor: theme.tailwind.green[5],
                                    color: 'white',
                                }}
                                disabled={authUser.user_level !== USER_LEVELS.ADMIN}
                            >
                                Add User
                            </Button>
                        </Flex>
                    </Box>
                </Paper>

                <Box
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: 600,
                        width: '100%',
                        overflow: 'hidden',
                    }}
                >
                    <Box
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            overflowX: 'auto',
                            border: 'solid 1px rgb(68,68,68)',
                            borderRadius: 'var(--mantine-radius-default)',
                        }}
                    >
                        <div style={{ minWidth: 700 }}>
                            <LoadingOverlay visible={isLoading} />
                            <CustomTable table={table} />
                        </div>
                    </Box>
                </Box>
            </Stack>

            <UserForm
                user={selectedUser}
                isOpen={userModalOpen}
                onClose={closeUserForm}
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

export default UsersTable;