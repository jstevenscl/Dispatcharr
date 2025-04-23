import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import useChannelsStore from '../../store/channels';
import { notifications } from '@mantine/notifications';
import API from '../../api';
import ChannelForm from '../forms/Channel';
import RecordingForm from '../forms/Recording';
import { useDebounce } from '../../utils';
import logo from '../../images/logo.png';
import useVideoStore from '../../store/useVideoStore';
import useSettingsStore from '../../store/settings';
import {
  Tv2,
  ScreenShare,
  Scroll,
  SquareMinus,
  CirclePlay,
  SquarePen,
  Binary,
  ArrowDown01,
  SquarePlus,
  Copy,
  CircleCheck,
  ScanEye,
  EllipsisVertical,
  ArrowUpNarrowWide,
  ArrowUpDown,
  ArrowDownWideNarrow,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import ghostImage from '../../images/ghost.svg';
import {
  Box,
  TextInput,
  Popover,
  ActionIcon,
  Select,
  Button,
  Paper,
  Flex,
  Text,
  Tooltip,
  Group,
  useMantineTheme,
  Center,
  Switch,
  Menu,
  MultiSelect,
  Pagination,
  NativeSelect,
  Checkbox,
  UnstyledButton,
  CopyButton,
} from '@mantine/core';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';
import './table.css';
import useChannelsTableStore from '../../store/channelsTable';
import ChannelTableStreams from './ChannelTableStreams';
import useLocalStorage from '../../hooks/useLocalStorage';

const m3uUrlBase = `${window.location.protocol}//${window.location.host}/output/m3u`;
const epgUrlBase = `${window.location.protocol}//${window.location.host}/output/epg`;
const hdhrUrlBase = `${window.location.protocol}//${window.location.host}/hdhr`;

const CreateProfilePopover = React.memo(() => {
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState('');
  const theme = useMantineTheme();

  const setOpen = () => {
    setName('');
    setOpened(!opened);
  };

  const submit = async () => {
    await API.addChannelProfile({ name });
    setName('');
    setOpened(false);
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpen}
      position="bottom"
      withArrow
      shadow="md"
    >
      <Popover.Target>
        <ActionIcon
          variant="transparent"
          color={theme.tailwind.green[5]}
          onClick={setOpen}
        >
          <SquarePlus />
        </ActionIcon>
      </Popover.Target>

      <Popover.Dropdown>
        <Group>
          <TextInput
            placeholder="Profile Name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            size="xs"
          />

          <ActionIcon
            variant="transparent"
            color={theme.tailwind.green[5]}
            size="sm"
            onClick={submit}
          >
            <CircleCheck />
          </ActionIcon>
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
});

const ChannelEnabledSwitch = React.memo(
  ({ rowId, selectedProfileId, toggleChannelEnabled }) => {
    // Directly extract the channels set once to avoid re-renders on every change.
    const isEnabled = useChannelsStore(
      useCallback(
        (state) =>
          selectedProfileId === '0' ||
          state.profiles[selectedProfileId]?.channels.has(rowId),
        [rowId, selectedProfileId]
      )
    );

    const handleToggle = useCallback(() => {
      toggleChannelEnabled([rowId], !isEnabled);
    }, [rowId, isEnabled, toggleChannelEnabled]);

    return (
      <Center style={{ width: '100%' }}>
        <Switch
          size="xs"
          checked={isEnabled}
          onChange={handleToggle}
          disabled={selectedProfileId === '0'}
        />
      </Center>
    );
  }
);

const ChannelRowActions = React.memo(
  ({
    theme,
    row,
    editChannel,
    deleteChannel,
    handleWatchStream,
    createRecording,
    getChannelURL,
  }) => {
    const onEdit = useCallback(() => {
      editChannel(row.original);
    }, []);

    const onDelete = useCallback(() => {
      deleteChannel(row.original.id);
    }, []);

    const onPreview = useCallback(() => {
      handleWatchStream(row.original);
    }, []);

    const onRecord = useCallback(() => {
      createRecording(row.original);
    }, []);

    return (
      <Box style={{ width: '100%', justifyContent: 'left' }}>
        <Center>
          <ActionIcon
            size="xs"
            variant="transparent"
            color={theme.tailwind.yellow[3]}
            onClick={onEdit}
          >
            <SquarePen size="18" />
          </ActionIcon>

          <ActionIcon
            size="xs"
            variant="transparent"
            color={theme.tailwind.red[6]}
            onClick={onDelete}
          >
            <SquareMinus size="18" />
          </ActionIcon>

          <ActionIcon
            size="xs"
            variant="transparent"
            color={theme.tailwind.green[5]}
            onClick={onPreview}
          >
            <CirclePlay size="18" />
          </ActionIcon>

          <Menu>
            <Menu.Target>
              <ActionIcon variant="transparent" size="sm">
                <EllipsisVertical size="18" />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Item leftSection={<Copy size="14" />}>
                <CopyButton value={getChannelURL(row.original)}>
                  {({ copied, copy }) => (
                    <UnstyledButton variant="unstyled" size="xs" onClick={copy}>
                      <Text size="xs">{copied ? 'Copied!' : 'Copy URL'}</Text>
                    </UnstyledButton>
                  )}
                </CopyButton>
              </Menu.Item>
              <Menu.Item
                onClick={onRecord}
                leftSection={
                  <div
                    style={{
                      borderRadius: '50%',
                      width: '10px',
                      height: '10px',
                      display: 'flex',
                      backgroundColor: 'red',
                    }}
                  ></div>
                }
              >
                <Text size="xs">Record</Text>
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Center>
      </Box>
    );
  }
);

const ChannelsTable = ({}) => {
  const data = useChannelsTableStore((s) => s.channels);
  const rowCount = useChannelsTableStore((s) => s.count);
  const pageCount = useChannelsTableStore((s) => s.pageCount);
  const setSelectedTableIds = useChannelsTableStore(
    (s) => s.setSelectedChannelIds
  );
  const channels = useChannelsStore((s) => s.channels);
  const profiles = useChannelsStore((s) => s.profiles);
  const selectedProfileId = useChannelsStore((s) => s.selectedProfileId);
  const setSelectedProfileId = useChannelsStore((s) => s.setSelectedProfileId);
  const channelGroups = useChannelsStore((s) => s.channelGroups);
  const logos = useChannelsStore((s) => s.logos);
  const [tablePrefs, setTablePrefs] = useLocalStorage('channel-table-prefs', {
    pageSize: 50,
  });

  const selectedProfileChannels = useChannelsStore(
    (s) => s.profiles[selectedProfileId]?.channels
  );
  const selectedProfileChannelIds = useMemo(
    () => new Set(selectedProfileChannels),
    [selectedProfileChannels]
  );

  const activeGroupIds = new Set(
    Object.values(channels).map((channel) => channel.channel_group_id)
  );
  const groupOptions = Object.values(channelGroups)
    .filter((group) => activeGroupIds.has(group.id))
    .map((group) => group.name);

  const env_mode = useSettingsStore((s) => s.environment.env_mode);

  const [channel, setChannel] = useState(null);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [recordingModalOpen, setRecordingModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(
    profiles[selectedProfileId]
  );
  const [paginationString, setPaginationString] = useState('');
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: tablePrefs.pageSize,
  });
  const [initialDataCount, setInitialDataCount] = useState(null);
  const [filters, setFilters] = useState({
    name: '',
    channel_group: '',
  });
  const debouncedFilters = useDebounce(filters, 500);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChannelIds, setSelectedChannelIds] = useState([]);
  const [sorting, setSorting] = useState([
    { id: 'channel_number', desc: false },
  ]);
  const [expandedRowId, setExpandedRowId] = useState(null);

  const [hdhrUrl, setHDHRUrl] = useState(hdhrUrlBase);
  const [epgUrl, setEPGUrl] = useState(epgUrlBase);
  const [m3uUrl, setM3UUrl] = useState(m3uUrlBase);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    params.append('page', pagination.pageIndex + 1);
    params.append('page_size', pagination.pageSize);

    // Apply sorting
    if (sorting.length > 0) {
      const sortField = sorting[0].id;
      const sortDirection = sorting[0].desc ? '-' : '';
      params.append('ordering', `${sortDirection}${sortField}`);
    }

    // Apply debounced filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    const results = await API.queryChannels(params);

    const startItem = pagination.pageIndex * pagination.pageSize + 1; // +1 to start from 1, not 0
    const endItem = Math.min(
      (pagination.pageIndex + 1) * pagination.pageSize,
      results.count
    );

    if (initialDataCount === null) {
      setInitialDataCount(results.count);
    }

    // Generate the string
    setPaginationString(`${startItem} to ${endItem} of ${results.count}`);
    setTablePrefs({
      pageSize: pagination.pageSize,
    });
  }, [pagination, sorting, debouncedFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // const theme = useTheme();
  const theme = useMantineTheme();

  const showVideo = useVideoStore((s) => s.showVideo);

  useEffect(() => {
    setSelectedProfile(profiles[selectedProfileId]);

    const profileString =
      selectedProfileId != '0' ? `/${profiles[selectedProfileId].name}` : '';
    setHDHRUrl(`${hdhrUrlBase}${profileString}`);
    setEPGUrl(`${epgUrlBase}${profileString}`);
    setM3UUrl(`${m3uUrlBase}${profileString}`);
  }, [selectedProfileId]);

  const stopPropagation = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const handleFilterChange = useCallback((e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
    setPagination({
      pageIndex: 0,
      pageSize: pagination.pageSize,
    });
  }, []);

  const handleGroupChange = (value) => {
    setFilters((prev) => ({
      ...prev,
      channel_group: value ? value : '',
    }));
    setPagination({
      pageIndex: 0,
      pageSize: pagination.pageSize,
    });
  };

  const hdhrUrlRef = useRef(null);
  const m3uUrlRef = useRef(null);
  const epgUrlRef = useRef(null);

  const editChannel = async (ch = null) => {
    setChannel(ch);
    setChannelModalOpen(true);
  };

  const deleteChannel = async (id) => {
    setRowSelection([]);
    if (selectedChannelIds.length > 0) {
      return deleteChannels();
    }
    await API.deleteChannel(id);
    API.requeryChannels();
  };

  const createRecording = (channel) => {
    setChannel(channel);
    setRecordingModalOpen(true);
  };

  const getChannelURL = (channel) => {
    const uri = `/proxy/ts/stream/${channel.uuid}`;
    let channelUrl = `${window.location.protocol}//${window.location.host}${uri}`;
    if (env_mode == 'dev') {
      channelUrl = `${window.location.protocol}//${window.location.hostname}:5656${uri}`;
    }

    return channelUrl;
  };

  function handleWatchStream(channel) {
    showVideo(getChannelURL(channel));
  }

  const onRowSelectionChange = (updater) => {
    setRowSelection((prevRowSelection) => {
      const newRowSelection =
        typeof updater === 'function' ? updater(prevRowSelection) : updater;

      const updatedSelected = new Set([...selectedChannelIds]);
      getRowModel().rows.forEach((row) => {
        if (newRowSelection[row.id] === undefined || !newRowSelection[row.id]) {
          updatedSelected.delete(row.original.id);
        } else {
          updatedSelected.add(row.original.id);
        }
      });
      const newSelection = [...updatedSelected];
      setSelectedChannelIds(newSelection);
      setSelectedTableIds(newSelection);

      return newRowSelection;
    });
  };

  const onSelectAllChange = async (e) => {
    const selectAll = e.target.checked;
    if (selectAll) {
      // Get all channel IDs for current view
      const params = new URLSearchParams();
      Object.entries(debouncedFilters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      const ids = await API.getAllChannelIds(params);
      setSelectedTableIds(ids);
      setSelectedChannelIds(ids);
    } else {
      setSelectedTableIds([]);
      setSelectedChannelIds([]);
    }

    const newSelection = {};
    getRowModel().rows.forEach((item, index) => {
      newSelection[index] = selectAll;
    });
    setRowSelection(newSelection);
  };

  const onPageSizeChange = (e) => {
    setPagination({
      ...pagination,
      pageSize: e.target.value,
    });
  };

  const onPageIndexChange = (pageIndex) => {
    if (!pageIndex || pageIndex > pageCount) {
      return;
    }

    setPagination({
      ...pagination,
      pageIndex: pageIndex - 1,
    });
  };

  const toggleChannelEnabled = useCallback(
    async (channelIds, enabled) => {
      if (channelIds.length == 1) {
        await API.updateProfileChannel(
          channelIds[0],
          selectedProfileId,
          enabled
        );
      } else {
        await API.updateProfileChannels(channelIds, selectedProfileId, enabled);
      }
    },
    [selectedProfileId]
  );

  const EnabledHeaderSwitch = useCallback(() => {
    let enabled = false;
    for (const id of selectedChannelIds) {
      if (selectedProfileChannelIds.has(id)) {
        enabled = true;
        break;
      }
    }

    const toggleSelected = () => {
      toggleChannelEnabled(selectedChannelIds, !enabled);
    };

    return <Switch size="xs" checked={enabled} onChange={toggleSelected} />;
  }, [selectedChannelIds, selectedProfileChannelIds, data]);

  // (Optional) bulk delete, but your endpoint is @TODO
  const deleteChannels = async () => {
    setIsLoading(true);
    await API.deleteChannels(selectedChannelIds);
    await API.requeryChannels();
    setSelectedChannelIds([]);
    setRowSelection([]);
    setIsLoading(false);
  };

  // ─────────────────────────────────────────────────────────
  // The "Assign Channels" button logic
  // ─────────────────────────────────────────────────────────
  const assignChannels = async () => {
    try {
      // Get row order from the table
      const rowOrder = getRowModel().rows.map((row) => row.original.id);

      // Call our custom API endpoint
      setIsLoading(true);
      const result = await API.assignChannelNumbers(rowOrder);
      setIsLoading(false);

      // We might get { message: "Channels have been auto-assigned!" }
      notifications.show({
        title: result.message || 'Channels assigned',
        color: 'green.5',
      });

      // Refresh the channel list
      // await fetchChannels();
      API.requeryChannels();
    } catch (err) {
      console.error(err);
      notifications.show({
        title: 'Failed to assign channels',
        color: 'red.5',
      });
    }
  };

  const matchEpg = async () => {
    try {
      // Hit our new endpoint that triggers the fuzzy matching Celery task
      await API.matchEpg();

      notifications.show({
        title: 'EPG matching task started!',
      });
    } catch (err) {
      notifications.show(`Error: ${err.message}`);
    }
  };

  const closeChannelForm = () => {
    setChannel(null);
    setChannelModalOpen(false);
  };

  const closeRecordingForm = () => {
    // setChannel(null);
    setRecordingModalOpen(false);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  const handleCopy = async (textToCopy, ref) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      notifications.show({
        title: 'Copied!',
        // style: { width: '200px', left: '200px' },
      });
    } catch (err) {
      const inputElement = ref.current; // Get the actual input

      if (inputElement) {
        inputElement.focus();
        inputElement.select();

        // For older browsers
        document.execCommand('copy');
        notifications.show({ title: 'Copied!' });
      }
    }
  };

  // Example copy URLs
  const copyM3UUrl = () => {
    handleCopy(m3uUrl, m3uUrlRef);
  };
  const copyEPGUrl = () => {
    handleCopy(epgUrl, epgUrlRef);
  };
  const copyHDHRUrl = () => {
    handleCopy(hdhrUrl, hdhrUrlRef);
  };

  const deleteProfile = async (id) => {
    await API.deleteChannelProfile(id);
  };

  const onSortingChange = (column) => {
    const sortField = sorting[0]?.id;
    const sortDirection = sorting[0]?.desc;

    if (sortField == column) {
      if (sortDirection == false) {
        setSorting([
          {
            id: column,
            desc: true,
          },
        ]);
      } else {
        setSorting([]);
      }
    } else {
      setSorting([
        {
          id: column,
          desc: false,
        },
      ]);
    }
  };

  const renderProfileOption = ({ option, checked }) => {
    return (
      <Group justify="space-between" style={{ width: '100%' }}>
        <Box>{option.label}</Box>
        {option.value != '0' && (
          <ActionIcon
            size="xs"
            variant="transparent"
            color={theme.tailwind.red[6]}
            onClick={(e) => {
              e.stopPropagation();
              deleteProfile(option.value);
            }}
          >
            <SquareMinus />
          </ActionIcon>
        )}
      </Group>
    );
  };

  const columns = useMemo(
    () => [
      {
        id: 'expand',
        size: 20,
        enableSorting: false,
        enableColumnFilter: false,
      },
      {
        id: 'select',
        size: 30,
        enableSorting: false,
        enableColumnFilter: false,
      },
      {
        id: 'enabled',
        size: 45,
        cell: ({ row }) => {
          return (
            <ChannelEnabledSwitch
              rowId={row.original.id}
              selectedProfileId={selectedProfileId}
              toggleChannelEnabled={toggleChannelEnabled}
            />
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'channel_number',
        size: 30,
        header: () => <Flex justify="flex-end">#</Flex>,
        cell: ({ getValue }) => (
          <Flex justify="flex-end" style={{ width: '100%' }}>
            <Text size="xs">{getValue()}</Text>
          </Flex>
        ),
      },
      {
        id: 'name',
        accessorKey: 'name',
        cell: ({ getValue }) => (
          <Box
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              // position: 'absolute',
              // left: 0,
              // top: 0,
            }}
          >
            <Text size="sm">{getValue()}</Text>
          </Box>
        ),
        style: {
          justifyContent: 'left',
        },
      },
      {
        accessorFn: (row) =>
          row.channel_group_id ? channelGroups[row.channel_group_id].name : '',
        id: 'channel_group',
        cell: ({ getValue }) => (
          <Box
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <Text size="xs">{getValue()}</Text>
          </Box>
        ),
      },
      {
        id: 'logo',
        accessorFn: (row) => logos[row.logo_id] ?? logo,
        size: 75,
        header: '',
        cell: ({ getValue }) => {
          const value = getValue();
          const src = value?.cache_url || logo;
          return (
            <Center style={{ width: '100%' }}>
              <img
                src={src}
                alt="logo"
                style={{ maxHeight: 18, maxWidth: 55 }}
              />
            </Center>
          );
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        size: 75,
        header: '',
        cell: ({ row }) => (
          <ChannelRowActions
            theme={theme}
            row={row}
            editChannel={editChannel}
            deleteChannel={deleteChannel}
            handleWatchStream={handleWatchStream}
            createRecording={createRecording}
            getChannelURL={getChannelURL}
          />
        ),
        enableSorting: false,
      },
    ],
    [selectedProfileId, data]
  );

  const { getHeaderGroups, getRowModel } = useReactTable({
    data,
    columns: columns,
    defaultColumn: {
      size: undefined,
      minSize: 0,
    },
    pageCount,
    state: {
      data,
      rowCount,
      sorting,
      filters,
      pagination,
      rowSelection,
    },
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: true,
    onRowSelectionChange: onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // debugTable: true,
  });

  const rows = getRowModel().rows;

  const onRowExpansion = (row) => {
    let isExpanded = false;
    setExpandedRowId((prev) => {
      isExpanded = prev === row.original.id ? null : row.original.id;
      return isExpanded;
    });
    setRowSelection({ [row.index]: true });
    setSelectedChannelIds([row.original.id]);
    setSelectedTableIds([row.original.id]);
  };

  const renderHeaderCell = (header) => {
    let sortingIcon = ArrowUpDown;
    if (sorting[0]?.id == header.id) {
      if (sorting[0].desc === false) {
        sortingIcon = ArrowUpNarrowWide;
      } else {
        sortingIcon = ArrowDownWideNarrow;
      }
    }

    switch (header.id) {
      case 'select':
        return ChannelRowSelectHeader({
          selectedChannelIds,
        });

      case 'enabled':
        if (selectedProfileId !== '0' && selectedChannelIds.length > 0) {
          // return EnabledHeaderSwitch();
        }
        return (
          <Center style={{ width: '100%' }}>
            <ScanEye size="16" />
          </Center>
        );

      case 'channel_number':
        return (
          <Flex gap={2}>
            #
            <Center>
              {React.createElement(sortingIcon, {
                onClick: () => onSortingChange('channel_number'),
                size: 14,
              })}
            </Center>
          </Flex>
        );

      case 'name':
        return (
          <Flex gap="sm">
            <TextInput
              name="name"
              placeholder="Name"
              value={filters.name || ''}
              onClick={(e) => e.stopPropagation()}
              onChange={handleFilterChange}
              size="xs"
              variant="unstyled"
              className="table-input-header"
            />
            <Center>
              {React.createElement(sortingIcon, {
                onClick: () => onSortingChange('name'),
                size: 14,
              })}
            </Center>
          </Flex>
        );

      case 'channel_group':
        return (
          <MultiSelect
            placeholder="Group"
            variant="unstyled"
            data={groupOptions}
            size="xs"
            searchable
            clearable
            onClick={stopPropagation}
            onChange={handleGroupChange}
            style={{ width: '100%' }}
          />
        );

      default:
        return flexRender(header.column.columnDef.header, header.getContext());
    }
  };

  const renderBodyCell = (cell) => {
    switch (cell.column.id) {
      case 'select':
        return ChannelRowSelectCell({ row: cell.row });

      case 'expand':
        return ChannelExpandCell({ row: cell.row });

      default:
        return flexRender(cell.column.columnDef.cell, cell.getContext());
    }
  };

  const ChannelExpandCell = useCallback(
    ({ row }) => {
      const isExpanded = expandedRowId === row.original.id;

      return (
        <Center
          style={{ width: '100%', cursor: 'pointer' }}
          onClick={() => {
            onRowExpansion(row);
          }}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </Center>
      );
    },
    [expandedRowId]
  );

  const ChannelRowSelectCell = useCallback(
    ({ row }) => {
      return (
        <Center style={{ width: '100%' }}>
          <Checkbox
            size="xs"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        </Center>
      );
    },
    [rows]
  );

  const ChannelRowSelectHeader = useCallback(
    ({ selectedChannelIds }) => {
      return (
        <Center style={{ width: '100%' }}>
          <Checkbox
            size="xs"
            checked={
              rowCount == 0 ? false : selectedChannelIds.length == rowCount
            }
            indeterminate={
              selectedChannelIds.length > 0 &&
              selectedChannelIds.length !== rowCount
            }
            onChange={onSelectAllChange}
          />
        </Center>
      );
    },
    [rows]
  );

  return (
    <Box>
      {/* Header Row: outside the Paper */}
      <Flex style={{ alignItems: 'center', paddingBottom: 10 }} gap={15}>
        <Text
          w={88}
          h={24}
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: '20px',
            lineHeight: 1,
            letterSpacing: '-0.3px',
            color: 'gray.6', // Adjust this to match MUI's theme.palette.text.secondary
            marginBottom: 0,
          }}
        >
          Channels
        </Text>
        <Flex
          style={{
            display: 'flex',
            alignItems: 'center',
            marginLeft: 10,
          }}
        >
          <Text
            w={37}
            h={17}
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 400,
              fontSize: '14px',
              lineHeight: 1,
              letterSpacing: '-0.3px',
              color: 'gray.6', // Adjust this to match MUI's theme.palette.text.secondary
            }}
          >
            Links:
          </Text>

          <Group gap={5} style={{ paddingLeft: 10 }}>
            <Popover withArrow shadow="md">
              <Popover.Target>
                <Button
                  leftSection={<Tv2 size={18} />}
                  size="compact-sm"
                  p={5}
                  color="green"
                  variant="subtle"
                  style={{
                    borderColor: theme.palette.custom.greenMain,
                    color: theme.palette.custom.greenMain,
                  }}
                >
                  HDHR
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <Group>
                  <TextInput ref={hdhrUrlRef} value={hdhrUrl} size="small" />
                  <ActionIcon
                    onClick={copyHDHRUrl}
                    size="sm"
                    variant="transparent"
                    color="gray.5"
                  >
                    <Copy size="18" fontSize="small" />
                  </ActionIcon>
                </Group>
              </Popover.Dropdown>
            </Popover>

            <Popover withArrow shadow="md">
              <Popover.Target>
                <Button
                  leftSection={<ScreenShare size={18} />}
                  size="compact-sm"
                  p={5}
                  variant="subtle"
                  style={{
                    borderColor: theme.palette.custom.indigoMain,
                    color: theme.palette.custom.indigoMain,
                  }}
                >
                  M3U
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <Group>
                  <TextInput ref={m3uUrlRef} value={m3uUrl} size="small" />
                  <ActionIcon
                    onClick={copyM3UUrl}
                    size="sm"
                    variant="transparent"
                    color="gray.5"
                  >
                    <Copy size="18" fontSize="small" />
                  </ActionIcon>
                </Group>
              </Popover.Dropdown>
            </Popover>

            <Popover withArrow shadow="md">
              <Popover.Target>
                <Button
                  leftSection={<Scroll size={18} />}
                  size="compact-sm"
                  p={5}
                  variant="subtle"
                  color="gray.5"
                  style={{
                    borderColor: theme.palette.custom.greyBorder,
                    color: theme.palette.custom.greyBorder,
                  }}
                >
                  EPG
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <Group>
                  <TextInput ref={epgUrlRef} value={epgUrl} size="small" />
                  <ActionIcon
                    onClick={copyEPGUrl}
                    size="sm"
                    variant="transparent"
                    color="gray.5"
                  >
                    <Copy size="18" fontSize="small" />
                  </ActionIcon>
                </Group>
              </Popover.Dropdown>
            </Popover>
          </Group>
        </Flex>
      </Flex>

      {/* Paper container: contains top toolbar and table (or ghost state) */}
      <Paper
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 58px)',
          backgroundColor: '#27272A',
        }}
      >
        {/* Top toolbar with Remove, Assign, Auto-match, and Add buttons */}
        <Group justify="space-between">
          <Group gap={5} style={{ paddingLeft: 10 }}>
            <Select
              size="xs"
              value={selectedProfileId}
              onChange={setSelectedProfileId}
              data={Object.values(profiles).map((profile) => ({
                label: profile.name,
                value: `${profile.id}`,
              }))}
              renderOption={renderProfileOption}
            />

            <Tooltip label="Create Profile">
              <CreateProfilePopover />
            </Tooltip>
          </Group>

          <Box
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: 10,
            }}
          >
            <Flex gap={6}>
              <Button
                leftSection={<SquareMinus size={18} />}
                variant="default"
                size="xs"
                onClick={deleteChannels}
                disabled={selectedChannelIds.length == 0}
              >
                Remove
              </Button>

              <Tooltip label="Assign Channel #s">
                <Button
                  leftSection={<ArrowDown01 size={18} />}
                  variant="default"
                  size="xs"
                  onClick={assignChannels}
                  p={5}
                >
                  Assign
                </Button>
              </Tooltip>

              <Tooltip label="Auto-Match EPG">
                <Button
                  leftSection={<Binary size={18} />}
                  variant="default"
                  size="xs"
                  onClick={matchEpg}
                  p={5}
                >
                  Auto-Match
                </Button>
              </Tooltip>

              <Button
                leftSection={<SquarePlus size={18} />}
                variant="light"
                size="xs"
                onClick={() => editChannel()}
                p={5}
                color={theme.tailwind.green[5]}
                style={{
                  borderWidth: '1px',
                  borderColor: theme.tailwind.green[5],
                  color: 'white',
                }}
              >
                Add
              </Button>
            </Flex>
          </Box>
        </Group>

        {/* Table or ghost empty state inside Paper */}
        <Box>
          {initialDataCount === 0 && data.length === 0 && (
            <Box
              style={{
                paddingTop: 20,
                bgcolor: theme.palette.background.paper,
              }}
            >
              <Center>
                <Box
                  style={{
                    textAlign: 'center',
                    width: '55%',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 400,
                      fontSize: '20px',
                      lineHeight: '28px',
                      letterSpacing: '-0.3px',
                      color: theme.palette.text.secondary,
                      mb: 1,
                    }}
                  >
                    It’s recommended to create channels after adding your M3U or
                    streams.
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 400,
                      fontSize: '16px',
                      lineHeight: '24px',
                      letterSpacing: '-0.2px',
                      color: theme.palette.text.secondary,
                      mb: 2,
                    }}
                  >
                    You can still create channels without streams if you’d like,
                    and map them later.
                  </Text>
                  <Button
                    leftSection={<SquarePlus size={18} />}
                    variant="light"
                    size="xs"
                    onClick={() => editChannel()}
                    color="gray"
                    style={{
                      marginTop: 20,
                      borderWidth: '1px',
                      borderColor: 'gray',
                      color: 'white',
                    }}
                  >
                    Create Channel
                  </Button>
                </Box>
              </Center>

              <Center>
                <Box
                  component="img"
                  src={ghostImage}
                  alt="Ghost"
                  style={{
                    paddingTop: 30,
                    width: '120px',
                    height: 'auto',
                    opacity: 0.2,
                    pointerEvents: 'none',
                  }}
                />
              </Center>
            </Box>
          )}
        </Box>

        {data.length > 0 && (
          <Box
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - 110px)',
            }}
          >
            <Box
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                border: 'solid 1px rgb(68,68,68)',
                borderRadius: 'var(--mantine-radius-default)',
              }}
            >
              <Box
                className="divTable table-striped"
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box
                  className="thead"
                  style={{
                    position: 'sticky',
                    top: 0,
                    backgroundColor: '#3E3E45',
                    zIndex: 10,
                  }}
                >
                  {getHeaderGroups().map((headerGroup) => (
                    <Box
                      className="tr"
                      key={headerGroup.id}
                      style={{ display: 'flex', width: '100%' }}
                    >
                      {headerGroup.headers.map((header) => {
                        const width = header.getSize();
                        return (
                          <Box
                            className="th"
                            key={header.id}
                            style={{
                              flex: header.column.columnDef.size
                                ? '0 0 auto'
                                : '1 1 0',
                              width: header.column.columnDef.size
                                ? header.getSize()
                                : undefined,
                              minWidth: 0,
                            }}
                          >
                            <Flex
                              align="center"
                              style={{
                                ...(header.column.columnDef.style &&
                                  header.column.columnDef.style),
                                height: '100%',
                              }}
                            >
                              {renderHeaderCell(header)}
                            </Flex>
                          </Box>
                        );
                      })}
                    </Box>
                  ))}
                </Box>
                <Box className="tbody">
                  {getRowModel().rows.map((row) => (
                    <Box>
                      <Box
                        key={row.id}
                        className="tr"
                        style={{
                          display: 'flex',
                          width: '100%',
                          ...(row.getIsSelected() && {
                            backgroundColor: '#163632',
                          }),
                        }}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const width = cell.column.getSize();
                          return (
                            <Box
                              className="td"
                              key={cell.id}
                              style={{
                                flex: cell.column.columnDef.size
                                  ? '0 0 auto'
                                  : '1 1 0',
                                width: cell.column.columnDef.size
                                  ? cell.column.getSize()
                                  : undefined,
                                minWidth: 0,
                              }}
                            >
                              <Flex align="center" style={{ height: '100%' }}>
                                {renderBodyCell(cell)}
                              </Flex>
                            </Box>
                          );
                        })}
                      </Box>
                      {row.original.id === expandedRowId && (
                        <Box
                          key={row.id}
                          className="tr"
                          style={{ display: 'flex', width: '100%' }}
                        >
                          <ChannelTableStreams
                            channel={row.original}
                            isExpanded={true}
                          />
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>

            <Box
              style={{
                position: 'sticky',
                bottom: 0,
                zIndex: 3,
                backgroundColor: '#27272A',
              }}
            >
              <Group
                gap={5}
                justify="center"
                style={{
                  padding: 8,
                  borderTop: '1px solid #666',
                }}
              >
                <Text size="xs">Page Size</Text>
                <NativeSelect
                  size="xxs"
                  value={pagination.pageSize}
                  data={['25', '50', '100', '250']}
                  onChange={onPageSizeChange}
                  style={{ paddingRight: 20 }}
                />
                <Pagination
                  total={pageCount}
                  value={pagination.pageIndex + 1}
                  onChange={onPageIndexChange}
                  size="xs"
                  withEdges
                  style={{ paddingRight: 20 }}
                />
                <Text size="xs">{paginationString}</Text>
              </Group>
            </Box>
          </Box>
        )}
      </Paper>

      <ChannelForm
        channel={channel}
        isOpen={channelModalOpen}
        onClose={closeChannelForm}
      />

      <RecordingForm
        channel={channel}
        isOpen={recordingModalOpen}
        onClose={closeRecordingForm}
      />
    </Box>
  );
};

export default ChannelsTable;
