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
import { TableHelper } from '../../helpers';
import { useDebounce } from '../../utils';
import logo from '../../images/logo.png';
import useVideoStore from '../../store/useVideoStore';
import useSettingsStore from '../../store/settings';
import usePlaylistsStore from '../../store/playlists';
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
  CircleEllipsis,
  CopyMinus,
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
  Grid,
  Group,
  useMantineTheme,
  Center,
  Switch,
  Menu,
  MultiSelect,
  Pagination,
  NativeSelect,
  Table,
  Checkbox,
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

const ChannelStreams = React.memo(({ channel, isExpanded }) => {
  const channelStreams = useChannelsStore(
    (state) => state.channels[channel.id]?.streams
  );
  const { playlists } = usePlaylistsStore();

  const removeStream = async (stream) => {
    const newStreamList = channelStreams.filter((s) => s.id !== stream.id);
    await API.updateChannel({
      ...channel,
      stream_ids: newStreamList.map((s) => s.id),
    });
  };

  const channelStreamsTable = useReactTable({
    ...TableHelper.defaultProperties,
    data: channelStreams,
    columns: useMemo(
      () => [
        {
          size: 400,
          header: 'Name',
          accessorKey: 'name',
          Cell: ({ cell }) => (
            <div
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {cell.getValue()}
            </div>
          ),
        },
        {
          size: 100,
          header: 'M3U',
          accessorFn: (row) =>
            playlists.find((playlist) => playlist.id === row.m3u_account)?.name,
          Cell: ({ cell }) => (
            <div
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {cell.getValue()}
            </div>
          ),
        },
      ],
      [playlists]
    ),
    displayColumnDefOptions: {
      'mrt-row-actions': {
        size: 10,
      },
    },
    enableKeyboardShortcuts: false,
    enableColumnFilters: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    enableTableHead: false,
    columnFilterDisplayMode: 'popover',
    enablePagination: false,
    enableRowVirtualization: true,
    enableColumnHeaders: false,
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    initialState: {
      density: 'compact',
    },
    enableRowActions: true,
    enableRowOrdering: true,
    mantineTableHeadRowProps: {
      style: { display: 'none' },
    },
    mantineTableBodyCellProps: {
      style: {
        // py: 0,
        padding: 4,
        borderColor: '#444',
        color: '#E0E0E0',
        fontSize: '0.85rem',
      },
    },
    mantineRowDragHandleProps: ({ table }) => ({
      onDragEnd: async () => {
        const { draggingRow, hoveredRow } = table.getState();

        if (hoveredRow && draggingRow) {
          channelStreams.splice(
            hoveredRow.index,
            0,
            channelStreams.splice(draggingRow.index, 1)[0]
          );

          const { streams: _, ...channelUpdate } = channel;

          API.updateChannel({
            ...channelUpdate,
            stream_ids: channelStreams.map((stream) => stream.id),
          });
        }
      },
    }),
    renderRowActions: ({ row }) => (
      <Tooltip label="Remove stream">
        <ActionIcon
          size="sm"
          color="red.9"
          variant="transparent"
          onClick={() => removeStream(row.original)}
        >
          <SquareMinus size="18" fontSize="small" />
        </ActionIcon>
      </Tooltip>
    ),
  });

  if (!isExpanded) {
    return <></>;
  }

  return (
    <Box style={{ width: '100%' }}>
      <MantineReactTable table={channelStreamsTable} />
    </Box>
  );
});

const m3uUrlBase = `${window.location.protocol}//${window.location.host}/output/m3u`;
const epgUrlBase = `${window.location.protocol}//${window.location.host}/output/epg`;
const hdhrUrlBase = `${window.location.protocol}//${window.location.host}/hdhr`;

const CreateProfilePopover = React.memo(({}) => {
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
  }) => {
    const onEdit = useCallback(() => {
      editChannel(row.original);
    }, []);

    const onDelete = useCallback(() => {
      deleteChannel(row.original.id);
    }, []);

    const onPreview = useCallback(() => {
      handleWatchStream(row.original.uuid);
    }, []);

    const onRecord = useCallback(() => {
      createRecording(row.original);
    }, []);

    return (
      <Box style={{ width: '100%', justifyContent: 'left' }}>
        <Center>
          <Tooltip label="Edit Channel">
            <ActionIcon
              size="xs"
              variant="transparent"
              color={theme.tailwind.yellow[3]}
              onClick={onEdit}
            >
              <SquarePen size="18" />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Delete Channel">
            <ActionIcon
              size="xs"
              variant="transparent"
              color={theme.tailwind.red[6]}
              onClick={onDelete}
            >
              <SquareMinus size="18" />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Preview Channel">
            <ActionIcon
              size="xs"
              variant="transparent"
              color={theme.tailwind.green[5]}
              onClick={onPreview}
            >
              <CirclePlay size="18" />
            </ActionIcon>
          </Tooltip>

          <Menu>
            <Menu.Target>
              <ActionIcon variant="transparent" size="sm">
                <EllipsisVertical size="18" />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
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
                Record
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Center>
      </Box>
    );
  }
);

const ChannelsTable = React.memo(({}) => {
  const {
    channels,
    isLoading: channelsLoading,
    fetchChannels,
    setChannelsPageSelection,
    profiles,
    selectedProfileId,
    setSelectedProfileId,
    channelsPageSelection,
    channelGroups,
  } = useChannelsStore();

  const selectedProfileChannels = useChannelsStore(
    (s) => s.profiles[selectedProfileId]?.channels
  );
  const selectedProfileChannelIds = useMemo(
    () => new Set(selectedProfileChannels),
    [selectedProfileChannels]
  );

  const groupOptions = Object.values(channelGroups).map((group) => group.name);

  const {
    environment: { env_mode },
  } = useSettingsStore();

  const [channel, setChannel] = useState(null);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [recordingModalOpen, setRecordingModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(
    profiles[selectedProfileId]
  );
  const [data, setData] = useState([]); // Holds fetched data
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [paginationString, setPaginationString] = useState('');
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 50,
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
    { id: 'name', desc: false },
  ]);

  const [hdhrUrl, setHDHRUrl] = useState(hdhrUrlBase);
  const [epgUrl, setEPGUrl] = useState(epgUrlBase);
  const [m3uUrl, setM3UUrl] = useState(m3uUrlBase);

  const [textToCopy, setTextToCopy] = useState('');

  // const theme = useTheme();
  const theme = useMantineTheme();

  const { showVideo } = useVideoStore();

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
  }, []);

  const handleGroupChange = (value) => {
    setFilters((prev) => ({
      ...prev,
      channel_group: value ? value : '',
    }));
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
  };

  const createRecording = (channel) => {
    setChannel(channel);
    setRecordingModalOpen(true);
  };

  function handleWatchStream(channelNumber) {
    let vidUrl = `/proxy/ts/stream/${channelNumber}`;
    if (env_mode == 'dev') {
      vidUrl = `${window.location.protocol}//${window.location.hostname}:5656${vidUrl}`;
    }
    showVideo(vidUrl);
  }

  const fetchData = useCallback(async () => {
    setIsLoading(true);

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
    Object.entries(debouncedFilters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    try {
      const result = await API.queryChannels(params);
      setData(result.results);
      setRowCount(result.count);
      setPageCount(Math.ceil(result.count / pagination.pageSize));

      // Calculate the starting and ending item indexes
      const startItem = pagination.pageIndex * pagination.pageSize + 1; // +1 to start from 1, not 0
      const endItem = Math.min(
        (pagination.pageIndex + 1) * pagination.pageSize,
        result.count
      );

      if (initialDataCount === null) {
        setInitialDataCount(result.count);
      }

      // Generate the string
      setPaginationString(`${startItem} to ${endItem} of ${result.count}`);

      const newSelection = {};
      result.results.forEach((item, index) => {
        if (selectedChannelIds.includes(item.id)) {
          newSelection[index] = true;
        }
      });

      // ✅ Only update rowSelection if it's different
      if (JSON.stringify(newSelection) !== JSON.stringify(rowSelection)) {
        setRowSelection(newSelection);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }

    setIsLoading(false);
  }, [pagination, sorting, debouncedFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      setSelectedChannelIds([...updatedSelected]);

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
      setSelectedChannelIds(ids);
    } else {
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
  }, [selectedChannelIds, selectedProfileChannelIds, fetchData]);

  // (Optional) bulk delete, but your endpoint is @TODO
  const deleteChannels = async () => {
    setIsLoading(true);
    await API.deleteChannels(selectedChannelIds);
    fetchData();
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
      fetchData();
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
        accessorFn: (row) => row.channel_group?.name || '',
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
        accessorKey: 'logo',
        size: 75,
        header: '',
        cell: ({ getValue }) => {
          const value = getValue();
          const src = value?.cache_url || logo;
          return (
            <Center>
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
          />
        ),
        enableSorting: false,
      },
    ],
    [selectedProfileId]
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
      sorting,
      filters,
      pagination,
      rowSelection,
    },
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: true,
    // onPaginationChange: setPagination,
    // onSortingChange: setSorting,
    // onColumnFiltersChange: setFilters,
    onRowSelectionChange: onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // debugTable: true,
  });

  const rows = getRowModel().rows;

  const renderHeaderCell = (header) => {
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

      case 'name':
        return (
          <TextInput
            name="name"
            placeholder="Name"
            value={filters.name || ''}
            onClick={(e) => e.stopPropagation()}
            onChange={handleFilterChange}
            size="xs"
            variant="unstyled"
            className="table-input-header"
            style={{ width: '100%' }}
          />
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
          height: 'calc(100vh - 60px)',
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
          {initialDataCount === 0 && (
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

        {initialDataCount > 0 && (
          <Box
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              paddingBottom: '56px',
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
                striped
                highlightOnHover
                stickyHeader
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box
                  class="thead"
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
                    <Box
                      key={row.id}
                      className="tr"
                      style={{ display: 'flex', width: '100%' }}
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
                              {cell.column.id === 'select'
                                ? ChannelRowSelectCell({ row: cell.row })
                                : flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext()
                                  )}
                            </Flex>
                          </Box>
                        );
                      })}
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
                style={{ padding: 8, borderTop: '1px solid #666' }}
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
});

export default ChannelsTable;
