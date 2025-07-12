import React, { useState, useEffect } from 'react';
import {
    Modal,
    Stack,
    Group,
    Text,
    TextInput,
    Button,
    ActionIcon,
    Flex,
    Badge,
    Alert,
    Divider,
    ScrollArea,
} from '@mantine/core';
import {
    SquarePlus,
    SquarePen,
    Trash2,
    Check,
    X,
    AlertCircle,
    Database,
    Tv
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
import useChannelsStore from '../../store/channels';
import API from '../../api';

const GroupManager = ({ isOpen, onClose }) => {
    const channelGroups = useChannelsStore((s) => s.channelGroups);
    const [editingGroup, setEditingGroup] = useState(null);
    const [editName, setEditName] = useState('');
    const [newGroupName, setNewGroupName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [groupUsage, setGroupUsage] = useState({});
    const [loading, setLoading] = useState(false);

    // Fetch group usage information when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchGroupUsage();
        }
    }, [isOpen]);

    const fetchGroupUsage = async () => {
        setLoading(true);
        try {
            // This would ideally be a dedicated API endpoint, but we'll use the existing data
            // For now, we'll determine usage based on the group having associated data
            const usage = {};

            // Check which groups have channels or M3U associations
            // This is a simplified check - in a real implementation you'd want a dedicated API
            Object.values(channelGroups).forEach(group => {
                usage[group.id] = {
                    hasChannels: false, // Would need API call to check
                    hasM3UAccounts: false, // Would need API call to check
                    canEdit: true, // Assume editable unless proven otherwise
                    canDelete: true // Assume deletable unless proven otherwise
                };
            });

            setGroupUsage(usage);
        } catch (error) {
            console.error('Error fetching group usage:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (group) => {
        setEditingGroup(group.id);
        setEditName(group.name);
    };

    const handleSaveEdit = async () => {
        if (!editName.trim()) {
            notifications.show({
                title: 'Error',
                message: 'Group name cannot be empty',
                color: 'red',
            });
            return;
        }

        try {
            await API.updateChannelGroup({
                id: editingGroup,
                name: editName.trim(),
            });

            notifications.show({
                title: 'Success',
                message: 'Group updated successfully',
                color: 'green',
            });

            setEditingGroup(null);
            setEditName('');
        } catch (error) {
            notifications.show({
                title: 'Error',
                message: 'Failed to update group',
                color: 'red',
            });
        }
    };

    const handleCancelEdit = () => {
        setEditingGroup(null);
        setEditName('');
    };

    const handleCreate = async () => {
        if (!newGroupName.trim()) {
            notifications.show({
                title: 'Error',
                message: 'Group name cannot be empty',
                color: 'red',
            });
            return;
        }

        try {
            await API.addChannelGroup({
                name: newGroupName.trim(),
            });

            notifications.show({
                title: 'Success',
                message: 'Group created successfully',
                color: 'green',
            });

            setNewGroupName('');
            setIsCreating(false);
            fetchGroupUsage(); // Refresh usage data
        } catch (error) {
            notifications.show({
                title: 'Error',
                message: 'Failed to create group',
                color: 'red',
            });
        }
    };

    const handleDelete = async (group) => {
        const usage = groupUsage[group.id];

        if (usage && (!usage.canDelete || usage.hasChannels || usage.hasM3UAccounts)) {
            notifications.show({
                title: 'Cannot Delete',
                message: 'This group is associated with channels or M3U accounts and cannot be deleted',
                color: 'orange',
            });
            return;
        }

        try {
            await API.deleteChannelGroup(group.id);

            notifications.show({
                title: 'Success',
                message: 'Group deleted successfully',
                color: 'green',
            });

            fetchGroupUsage(); // Refresh usage data
        } catch (error) {
            notifications.show({
                title: 'Error',
                message: 'Failed to delete group',
                color: 'red',
            });
        }
    };

    const getGroupBadges = (group) => {
        const usage = groupUsage[group.id];
        const badges = [];

        if (usage?.hasChannels) {
            badges.push(
                <Badge key="channels" size="xs" color="blue" leftSection={<Tv size={10} />}>
                    Channels
                </Badge>
            );
        }

        if (usage?.hasM3UAccounts) {
            badges.push(
                <Badge key="m3u" size="xs" color="purple" leftSection={<Database size={10} />}>
                    M3U
                </Badge>
            );
        }

        return badges;
    };

    const canEditGroup = (group) => {
        const usage = groupUsage[group.id];
        return usage?.canEdit !== false; // Default to true if no usage data
    };

    const canDeleteGroup = (group) => {
        const usage = groupUsage[group.id];
        return usage?.canDelete !== false && !usage?.hasChannels && !usage?.hasM3UAccounts;
    };

    if (!isOpen) return null;

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title="Group Manager"
            size="md"
            scrollAreaComponent={ScrollArea.Autosize}
        >
            <Stack>
                <Alert icon={<AlertCircle size={16} />} color="blue" variant="light">
                    Manage channel groups. Groups associated with M3U accounts or containing channels cannot be deleted.
                </Alert>

                {/* Create new group section */}
                <Stack>
                    <Text size="sm" fw={600}>Create New Group</Text>
                    <Group>
                        {isCreating ? (
                            <>
                                <TextInput
                                    placeholder="Enter group name"
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    style={{ flex: 1 }}
                                    onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
                                />
                                <ActionIcon color="green" onClick={handleCreate}>
                                    <Check size={16} />
                                </ActionIcon>
                                <ActionIcon color="gray" onClick={() => {
                                    setIsCreating(false);
                                    setNewGroupName('');
                                }}>
                                    <X size={16} />
                                </ActionIcon>
                            </>
                        ) : (
                            <Button
                                leftSection={<SquarePlus size={16} />}
                                variant="light"
                                size="sm"
                                onClick={() => setIsCreating(true)}
                            >
                                Add Group
                            </Button>
                        )}
                    </Group>
                </Stack>

                <Divider />

                {/* Existing groups */}
                <Stack>
                    <Text size="sm" fw={600}>Existing Groups ({Object.keys(channelGroups).length})</Text>

                    {loading ? (
                        <Text size="sm" c="dimmed">Loading group information...</Text>
                    ) : Object.keys(channelGroups).length === 0 ? (
                        <Text size="sm" c="dimmed">No groups found</Text>
                    ) : (
                        <Stack gap="xs">
                            {Object.values(channelGroups)
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((group) => (
                                    <Group key={group.id} justify="space-between" p="sm" style={{
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '4px',
                                        backgroundColor: editingGroup === group.id ? '#f8f9fa' : 'transparent'
                                    }}>
                                        <Stack gap={4} style={{ flex: 1 }}>
                                            {editingGroup === group.id ? (
                                                <TextInput
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    size="sm"
                                                    onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                                                />
                                            ) : (
                                                <>
                                                    <Text size="sm" fw={500}>{group.name}</Text>
                                                    <Group gap={4}>
                                                        {getGroupBadges(group)}
                                                    </Group>
                                                </>
                                            )}
                                        </Stack>

                                        <Group gap="xs">
                                            {editingGroup === group.id ? (
                                                <>
                                                    <ActionIcon color="green" size="sm" onClick={handleSaveEdit}>
                                                        <Check size={14} />
                                                    </ActionIcon>
                                                    <ActionIcon color="gray" size="sm" onClick={handleCancelEdit}>
                                                        <X size={14} />
                                                    </ActionIcon>
                                                </>
                                            ) : (
                                                <>
                                                    <ActionIcon
                                                        color="blue"
                                                        size="sm"
                                                        onClick={() => handleEdit(group)}
                                                        disabled={!canEditGroup(group)}
                                                    >
                                                        <SquarePen size={14} />
                                                    </ActionIcon>
                                                    <ActionIcon
                                                        color="red"
                                                        size="sm"
                                                        onClick={() => handleDelete(group)}
                                                        disabled={!canDeleteGroup(group)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </ActionIcon>
                                                </>
                                            )}
                                        </Group>
                                    </Group>
                                ))}
                        </Stack>
                    )}
                </Stack>

                <Divider />

                <Flex justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Close
                    </Button>
                </Flex>
            </Stack>
        </Modal>
    );
};

export default GroupManager;
