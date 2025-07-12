import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    Tv,
    Trash
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
import useChannelsStore from '../../store/channels';
import API from '../../api';

// Move GroupItem outside to prevent recreation on every render
const GroupItem = React.memo(({
    group,
    editingGroup,
    editName,
    onEditNameChange,
    onSaveEdit,
    onCancelEdit,
    onEdit,
    onDelete,
    groupUsage,
    canEditGroup,
    canDeleteGroup
}) => {
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

    return (
        <Group justify="space-between" p="sm" style={{
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            backgroundColor: editingGroup === group.id ? '#f8f9fa' : 'transparent'
        }}>
            <Stack gap={4} style={{ flex: 1 }}>
                {editingGroup === group.id ? (
                    <TextInput
                        value={editName}
                        onChange={onEditNameChange}
                        size="sm"
                        onKeyPress={(e) => e.key === 'Enter' && onSaveEdit()}
                        autoFocus
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
                        <ActionIcon color="green" size="sm" onClick={onSaveEdit}>
                            <Check size={14} />
                        </ActionIcon>
                        <ActionIcon color="gray" size="sm" onClick={onCancelEdit}>
                            <X size={14} />
                        </ActionIcon>
                    </>
                ) : (
                    <>
                        <ActionIcon
                            color="blue"
                            size="sm"
                            onClick={() => onEdit(group)}
                            disabled={!canEditGroup(group)}
                        >
                            <SquarePen size={14} />
                        </ActionIcon>
                        <ActionIcon
                            color="red"
                            size="sm"
                            onClick={() => onDelete(group)}
                            disabled={!canDeleteGroup(group)}
                        >
                            <Trash2 size={14} />
                        </ActionIcon>
                    </>
                )}
            </Group>
        </Group>
    );
});

const GroupManager = React.memo(({ isOpen, onClose }) => {
    const channelGroups = useChannelsStore((s) => s.channelGroups);
    const canEditChannelGroup = useChannelsStore((s) => s.canEditChannelGroup);
    const canDeleteChannelGroup = useChannelsStore((s) => s.canDeleteChannelGroup);
    const [editingGroup, setEditingGroup] = useState(null);
    const [editName, setEditName] = useState('');
    const [newGroupName, setNewGroupName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [groupUsage, setGroupUsage] = useState({});
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCleaningUp, setIsCleaningUp] = useState(false);

    // Memoize the channel groups array to prevent unnecessary re-renders
    const channelGroupsArray = useMemo(() =>
        Object.values(channelGroups),
        [channelGroups]
    );

    // Memoize sorted groups to prevent re-sorting on every render
    const sortedGroups = useMemo(() =>
        channelGroupsArray.sort((a, b) => a.name.localeCompare(b.name)),
        [channelGroupsArray]
    );

    // Filter groups based on search term
    const filteredGroups = useMemo(() => {
        if (!searchTerm.trim()) return sortedGroups;
        return sortedGroups.filter(group =>
            group.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [sortedGroups, searchTerm]);

    // Fetch group usage information when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchGroupUsage();
        }
    }, [isOpen]);

    const fetchGroupUsage = useCallback(async () => {
        setLoading(true);
        try {
            // Use the actual channel group data that already has the flags
            const usage = {};

            Object.values(channelGroups).forEach(group => {
                usage[group.id] = {
                    hasChannels: group.hasChannels ?? false,
                    hasM3UAccounts: group.hasM3UAccounts ?? false,
                    canEdit: group.canEdit ?? true,
                    canDelete: group.canDelete ?? true
                };
            });

            setGroupUsage(usage);
        } catch (error) {
            console.error('Error fetching group usage:', error);
        } finally {
            setLoading(false);
        }
    }, [channelGroups]);

    const handleEdit = useCallback((group) => {
        setEditingGroup(group.id);
        setEditName(group.name);
    }, []);

    const handleSaveEdit = useCallback(async () => {
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
    }, [editName, editingGroup]);

    const handleCancelEdit = useCallback(() => {
        setEditingGroup(null);
        setEditName('');
    }, []);

    const handleCreate = useCallback(async () => {
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
    }, [newGroupName]);

    const handleDelete = useCallback(async (group) => {
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
    }, [groupUsage, fetchGroupUsage]);

    const handleNewGroupNameChange = useCallback((e) => {
        setNewGroupName(e.target.value);
    }, []);

    const handleEditNameChange = useCallback((e) => {
        setEditName(e.target.value);
    }, []);

    const handleSearchChange = useCallback((e) => {
        setSearchTerm(e.target.value);
    }, []);

    const handleCleanup = useCallback(async () => {
        setIsCleaningUp(true);
        try {
            const result = await API.cleanupUnusedChannelGroups();

            notifications.show({
                title: 'Cleanup Complete',
                message: `Successfully deleted ${result.deleted_count} unused groups`,
                color: 'green',
            });

            fetchGroupUsage(); // Refresh usage data
        } catch (error) {
            notifications.show({
                title: 'Cleanup Failed',
                message: 'Failed to cleanup unused groups',
                color: 'red',
            });
        } finally {
            setIsCleaningUp(false);
        }
    }, [fetchGroupUsage]);

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
                    <Group justify="space-between" align="center">
                        <Text size="sm" fw={600}>Create New Group</Text>
                        <Button
                            leftSection={<Trash size={16} />}
                            variant="light"
                            size="sm"
                            color="orange"
                            onClick={handleCleanup}
                            loading={isCleaningUp}
                        >
                            Cleanup Unused
                        </Button>
                    </Group>
                    <Group>
                        {isCreating ? (
                            <>
                                <TextInput
                                    placeholder="Enter group name"
                                    value={newGroupName}
                                    onChange={handleNewGroupNameChange}
                                    style={{ flex: 1 }}
                                    onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
                                    autoFocus
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
                    <Group justify="space-between" align="center">
                        <Text size="sm" fw={600}>
                            Existing Groups ({filteredGroups.length}{searchTerm && ` of ${sortedGroups.length}`})
                        </Text>
                        <TextInput
                            placeholder="Search groups..."
                            value={searchTerm}
                            onChange={handleSearchChange}
                            size="sm"
                            style={{ width: '200px' }}
                            rightSection={searchTerm && (
                                <ActionIcon
                                    size="sm"
                                    variant="subtle"
                                    onClick={() => setSearchTerm('')}
                                >
                                    <X size={14} />
                                </ActionIcon>
                            )}
                        />
                    </Group>

                    {loading ? (
                        <Text size="sm" c="dimmed">Loading group information...</Text>
                    ) : filteredGroups.length === 0 ? (
                        <Text size="sm" c="dimmed">
                            {searchTerm ? 'No groups found matching your search' : 'No groups found'}
                        </Text>
                    ) : (
                        <Stack gap="xs">
                            {filteredGroups.map((group) => (
                                <GroupItem
                                    key={group.id}
                                    group={group}
                                    editingGroup={editingGroup}
                                    editName={editName}
                                    onEditNameChange={handleEditNameChange}
                                    onSaveEdit={handleSaveEdit}
                                    onCancelEdit={handleCancelEdit}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                    groupUsage={groupUsage}
                                    canEditGroup={canEditChannelGroup}
                                    canDeleteGroup={canDeleteChannelGroup}
                                />
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
});
export default GroupManager;
