import React, { useState, useEffect } from 'react';
import {
    Container,
    Title,
    Button,
    Table,
    Group,
    ActionIcon,
    Text,
    Image,
    Box,
    Center,
    Stack,
    Badge,
} from '@mantine/core';
import { SquarePen, Trash2, Plus, ExternalLink } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import useChannelsStore from '../store/channels';
import API from '../api';
import LogoForm from '../components/forms/Logo';
import ConfirmationDialog from '../components/ConfirmationDialog';

const LogosPage = () => {
    const { logos, fetchLogos } = useChannelsStore();
    const [logoFormOpen, setLogoFormOpen] = useState(false);
    const [editingLogo, setEditingLogo] = useState(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [logoToDelete, setLogoToDelete] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadLogos();
    }, []);

    const loadLogos = async () => {
        setLoading(true);
        try {
            await fetchLogos();
        } catch (error) {
            notifications.show({
                title: 'Error',
                message: 'Failed to load logos',
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCreateLogo = () => {
        setEditingLogo(null);
        setLogoFormOpen(true);
    };

    const handleEditLogo = (logo) => {
        setEditingLogo(logo);
        setLogoFormOpen(true);
    };

    const handleDeleteLogo = (logo) => {
        setLogoToDelete(logo);
        setDeleteConfirmOpen(true);
    };

    const confirmDeleteLogo = async () => {
        if (!logoToDelete) return;

        try {
            await API.deleteLogo(logoToDelete.id);
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
            setDeleteConfirmOpen(false);
            setLogoToDelete(null);
        }
    };

    const handleFormClose = () => {
        setLogoFormOpen(false);
        setEditingLogo(null);
        loadLogos(); // Refresh the logos list
    };

    const logosArray = Object.values(logos || {});

    const rows = logosArray.map((logo) => (
        <Table.Tr key={logo.id}>
            <Table.Td>
                <Center>
                    <Image
                        src={logo.cache_url}
                        alt={logo.name}
                        width={40}
                        height={30}
                        fit="contain"
                        fallbackSrc="/logo.png"
                    />
                </Center>
            </Table.Td>
            <Table.Td>
                <Text fw={500}>{logo.name}</Text>
            </Table.Td>
            <Table.Td>
                <Group spacing="xs" align="center">
                    <Text size="sm" color="dimmed" style={{ wordBreak: 'break-all', maxWidth: 300 }}>
                        {logo.url}
                    </Text>
                    {logo.url.startsWith('http') && (
                        <ActionIcon
                            size="sm"
                            variant="subtle"
                            onClick={() => window.open(logo.url, '_blank')}
                        >
                            <ExternalLink size={14} />
                        </ActionIcon>
                    )}
                </Group>
            </Table.Td>
            <Table.Td>
                <Group spacing="xs">
                    <ActionIcon
                        variant="subtle"
                        onClick={() => handleEditLogo(logo)}
                        color="blue"
                    >
                        <SquarePen size={16} />
                    </ActionIcon>
                    <ActionIcon
                        variant="subtle"
                        onClick={() => handleDeleteLogo(logo)}
                        color="red"
                    >
                        <Trash2 size={16} />
                    </ActionIcon>
                </Group>
            </Table.Td>
        </Table.Tr>
    ));

    return (
        <>
            <Container size="xl" py="md">
                <Group justify="space-between" mb="md">
                    <Title order={2}>Logos</Title>
                    <Button leftSection={<Plus size={16} />} onClick={handleCreateLogo}>
                        Add Logo
                    </Button>
                </Group>

                {loading ? (
                    <Center py="xl">
                        <Text>Loading logos...</Text>
                    </Center>
                ) : logosArray.length === 0 ? (
                    <Center py="xl">
                        <Stack align="center" spacing="md">
                            <Text size="lg" color="dimmed">No logos found</Text>
                            <Text size="sm" color="dimmed">Click "Add Logo" to create your first logo</Text>
                        </Stack>
                    </Center>
                ) : (
                    <Box>
                        <Text size="sm" color="dimmed" mb="sm">
                            Total: {logosArray.length} logo{logosArray.length !== 1 ? 's' : ''}
                        </Text>

                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Preview</Table.Th>
                                    <Table.Th>Name</Table.Th>
                                    <Table.Th>URL</Table.Th>
                                    <Table.Th>Actions</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>{rows}</Table.Tbody>
                        </Table>
                    </Box>
                )}
            </Container>

            <LogoForm
                logo={editingLogo}
                isOpen={logoFormOpen}
                onClose={handleFormClose}
            />

            <ConfirmationDialog
                opened={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                onConfirm={confirmDeleteLogo}
                title="Delete Logo"
                message={
                    logoToDelete ? (
                        <div>
                            Are you sure you want to delete the logo "{logoToDelete.name}"?
                            <br />
                            <Text size="sm" color="dimmed" mt="xs">
                                This action cannot be undone.
                            </Text>
                        </div>
                    ) : (
                        'Are you sure you want to delete this logo?'
                    )
                }
                confirmLabel="Delete"
                cancelLabel="Cancel"
            />
        </>
    );
};

export default LogosPage;
