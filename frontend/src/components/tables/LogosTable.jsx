import React, { useMemo, useCallback, useState } from 'react';
import API from '../../api';
import LogoForm from '../forms/Logo';
import useChannelsStore from '../../store/channels';
import useLocalStorage from '../../hooks/useLocalStorage';
import {
    SquarePlus,
    SquareMinus,
    SquarePen,
    ExternalLink,
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
    LoadingOverlay,
    Stack,
    Image,
    Center,
} from '@mantine/core';
import { CustomTable, useTable } from './CustomTable';
import ConfirmationDialog from '../ConfirmationDialog';
import { notifications } from '@mantine/notifications';

const LogoRowActions = ({ theme, row, editLogo, deleteLogo }) => {
    const [tableSize, _] = useLocalStorage('table-size', 'default');

    const onEdit = useCallback(() => {
        editLogo(row.original);
    }, [row.original, editLogo]);

    const onDelete = useCallback(() => {
        deleteLogo(row.original.id);
    }, [row.original.id, deleteLogo]);

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
                >
                    <SquarePen size="18" />
                </ActionIcon>

                <ActionIcon
                    size={iconSize}
                    variant="transparent"
                    color={theme.tailwind.red[6]}
                    onClick={onDelete}
                >
                    <SquareMinus size="18" />
                </ActionIcon>
            </Group>
        </Box>
    );
};

const LogosTable = () => {
    const theme = useMantineTheme();

    /**
     * STORES
     */
    const { logos, fetchLogos } = useChannelsStore();

    /**
     * useState
     */
    const [selectedLogo, setSelectedLogo] = useState(null);
    const [logoModalOpen, setLogoModalOpen] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [logoToDelete, setLogoToDelete] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Functions
     */
    const executeDeleteLogo = useCallback(async (id) => {
        setIsLoading(true);
        try {
            await API.deleteLogo(id);
            await fetchLogos();
            notifications.show({
                title: 'Success',
                message: 'Logo deleted successfully',
                color: 'green',
            });
        } catch (error) {
            notifications.show({
                title: 'Error',
                message: 'Failed to delete logo',
                color: 'red',
            });
        } finally {
            setIsLoading(false);
            setConfirmDeleteOpen(false);
        }
    }, [fetchLogos]);

    const editLogo = useCallback(async (logo = null) => {
        setSelectedLogo(logo);
        setLogoModalOpen(true);
    }, []);

    const deleteLogo = useCallback(async (id) => {
        const logosArray = Object.values(logos || {});
        const logo = logosArray.find((l) => l.id === id);
        setLogoToDelete(logo);
        setDeleteTarget(id);
        setConfirmDeleteOpen(true);
    }, [logos]);

    /**
     * useMemo
     */
    const columns = useMemo(
        () => [
            {
                header: 'Preview',
                accessorKey: 'cache_url',
                size: 80,
                enableSorting: false,
                cell: ({ getValue, row }) => (
                    <Center style={{ width: '100%' }}>
                        <Image
                            src={getValue()}
                            alt={row.original.name}
                            width={40}
                            height={30}
                            fit="contain"
                            fallbackSrc="/logo.png"
                        />
                    </Center>
                ),
            },
            {
                header: 'Name',
                accessorKey: 'name',
                size: 200,
                cell: ({ getValue }) => (
                    <Text fw={500} size="sm">
                        {getValue()}
                    </Text>
                ),
            },
            {
                header: 'URL',
                accessorKey: 'url',
                cell: ({ getValue }) => (
                    <Group gap={4} style={{ alignItems: 'center' }}>
                        <Box
                            style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: 300,
                            }}
                        >
                            <Text size="sm" c="dimmed">
                                {getValue()}
                            </Text>
                        </Box>
                        {getValue()?.startsWith('http') && (
                            <ActionIcon
                                size="xs"
                                variant="transparent"
                                color="gray"
                                onClick={() => window.open(getValue(), '_blank')}
                            >
                                <ExternalLink size={12} />
                            </ActionIcon>
                        )}
                    </Group>
                ),
            },
            {
                id: 'actions',
                size: 80,
                header: 'Actions',
                enableSorting: false,
                cell: ({ row }) => (
                    <LogoRowActions
                        theme={theme}
                        row={row}
                        editLogo={editLogo}
                        deleteLogo={deleteLogo}
                    />
                ),
            },
        ],
        [theme, editLogo, deleteLogo]
    );

    const closeLogoForm = () => {
        setSelectedLogo(null);
        setLogoModalOpen(false);
        fetchLogos(); // Refresh the logos list
    };

    const data = useMemo(() => {
        const logosArray = Object.values(logos || {});
        return logosArray.sort((a, b) => a.id - b.id);
    }, [logos]);

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
        allRowIds: data.map((logo) => logo.id),
        enablePagination: false,
        enableRowSelection: false,
        enableRowVirtualization: false,
        renderTopToolbar: false,
        manualSorting: false,
        manualFiltering: false,
        manualPagination: false,
        headerCellRenderFns: {
            actions: renderHeaderCell,
            cache_url: renderHeaderCell,
            name: renderHeaderCell,
            url: renderHeaderCell,
        },
    });

    return (
        <>
            <Box
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '0px',
                    minHeight: '100vh',
                }}
            >
                <Stack gap="md" style={{ maxWidth: '1200px', width: '100%' }}>
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
                            Logos
                        </Text>
                        <Text size="sm" c="dimmed">
                            ({data.length} logo{data.length !== 1 ? 's' : ''})
                        </Text>
                    </Flex>

                    <Paper
                        style={{
                            backgroundColor: '#27272A',
                            border: '1px solid #3f3f46',
                            borderRadius: 'var(--mantine-radius-md)',
                        }}
                    >
                        {/* Top toolbar */}
                        <Box
                            style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                padding: '16px',
                                borderBottom: '1px solid #3f3f46',
                            }}
                        >
                            <Button
                                leftSection={<SquarePlus size={18} />}
                                variant="light"
                                size="xs"
                                onClick={() => editLogo()}
                                p={5}
                                color={theme.tailwind.green[5]}
                                style={{
                                    borderWidth: '1px',
                                    borderColor: theme.tailwind.green[5],
                                    color: 'white',
                                }}
                            >
                                Add Logo
                            </Button>
                        </Box>

                        {/* Table container */}
                        <Box
                            style={{
                                position: 'relative',
                                overflow: 'auto',
                                borderRadius: '0 0 var(--mantine-radius-md) var(--mantine-radius-md)',
                            }}
                        >
                            <div style={{ minWidth: '700px' }}>
                                <LoadingOverlay visible={isLoading} />
                                <CustomTable table={table} />
                            </div>
                        </Box>
                    </Paper>
                </Stack>
            </Box>

            <LogoForm
                logo={selectedLogo}
                isOpen={logoModalOpen}
                onClose={closeLogoForm}
            />

            <ConfirmationDialog
                opened={confirmDeleteOpen}
                onClose={() => setConfirmDeleteOpen(false)}
                onConfirm={() => executeDeleteLogo(deleteTarget)}
                title="Delete Logo"
                message={
                    logoToDelete ? (
                        <div>
                            Are you sure you want to delete the logo "{logoToDelete.name}"?
                            <br />
                            <Text size="sm" c="dimmed" mt="xs">
                                This action cannot be undone.
                            </Text>
                        </div>
                    ) : (
                        'Are you sure you want to delete this logo?'
                    )
                }
                confirmLabel="Delete"
                cancelLabel="Cancel"
                size="md"
            />
        </>
    );
};

export default LogosTable;
