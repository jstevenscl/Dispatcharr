import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import {
  MaterialReactTable,
  useMaterialReactTable,
  MRT_ShowHideColumnsButton, // <-- import this
} from 'material-react-table';
import {
  Box,
  Stack,
  Typography,
  IconButton,
  Tooltip,
  Button,
  Menu,
  MenuItem,
  TextField,
  Autocomplete,
  InputAdornment,
  Paper,
} from '@mui/material';
import API from '../../api';
import { useTheme } from '@mui/material/styles';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  PlaylistAdd as PlaylistAddIcon,
  IndeterminateCheckBox,
  AddBox,
} from '@mui/icons-material';
import { TableHelper } from '../../helpers';
import StreamForm from '../forms/Stream';
import usePlaylistsStore from '../../store/playlists';
import useChannelsStore from '../../store/channels';
import { useDebounce } from '../../utils';
import { SquarePlus, ListPlus } from 'lucide-react';

const StreamsTable = ({}) => {
  const theme = useTheme();

  /**
   * useState
   */
  const [rowSelection, setRowSelection] = useState([]);
  const [stream, setStream] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [moreActionsAnchorEl, setMoreActionsAnchorEl] = useState(null);
  const [groupOptions, setGroupOptions] = useState([]);
  const [m3uOptions, setM3uOptions] = useState([]);
  const [actionsOpenRow, setActionsOpenRow] = useState(null);

  const [data, setData] = useState([]); // Holds fetched data
  const [rowCount, setRowCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);
  const [selectedStreamIds, setSelectedStreamIds] = useState([]);
  const [unselectedStreamIds, setUnselectedStreamIds] = useState([]);
  // const [allRowsSelected, setAllRowsSelected] = useState(false);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 25,
  });
  const [filters, setFilters] = useState({
    name: '',
    group_name: '',
    m3u_account: '',
  });
  const debouncedFilters = useDebounce(filters, 500);
  const hasData = data.length > 0;

  /**
   * Stores
   */
  const { playlists } = usePlaylistsStore();
  const { channelsPageSelection } = useChannelsStore();
  const channelSelectionStreams = useChannelsStore(
    (state) => state.channels[state.channelsPageSelection[0]?.id]?.streams
  );

  const isMoreActionsOpen = Boolean(moreActionsAnchorEl);

  // Access the row virtualizer instance (optional)
  const rowVirtualizerInstanceRef = useRef(null);

  const eligibleSelectedStreamId = selectedStreamIds.find(
    (id) =>
      channelsPageSelection.length === 1 &&
      !(
        channelSelectionStreams &&
        channelSelectionStreams.map((stream) => stream.id).includes(id)
      )
  );

  /**
   * useMemo
   */
  const columns = useMemo(
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
        muiTableHeadCellProps: {
          sx: { textAlign: 'center' }, // Center-align the header
        },
        Header: ({ column }) => (
          <TextField
            variant="standard"
            name="name"
            label="Name"
            value={filters.name || ''}
            onClick={(e) => e.stopPropagation()}
            onChange={handleFilterChange}
            size="small"
            margin="none"
            fullWidth
          />
        ),
      },
      {
        header: 'Group',
        accessorKey: 'group_name',
        Header: ({ column }) => (
          <Autocomplete
            disablePortal
            options={groupOptions}
            size="small"
            clearOnEscape
            onChange={(e, value) => {
              e.stopPropagation();
              handleGroupChange(value);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Group"
                size="small"
                variant="standard"
                onClick={(e) => e.stopPropagation()}
                sx={{
                  pb: 0.8,
                  '& .MuiInputBase-root': { fontSize: '0.875rem' },
                  '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                  width: '200px',
                }}
              />
            )}
          />
        ),
      },
      {
        header: 'M3U',
        size: 100,
        accessorFn: (row) =>
          playlists.find((playlist) => playlist.id === row.m3u_account)?.name,
        Header: ({ column }) => (
          <Autocomplete
            disablePortal
            options={playlists.map((playlist) => ({
              label: playlist.name,
              value: playlist.id,
            }))}
            size="small"
            clearOnEscape
            onChange={(e, value) => {
              e.stopPropagation();
              handleM3UChange(value);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="M3U"
                size="small"
                variant="standard"
                onClick={(e) => e.stopPropagation()}
                sx={{
                  pb: 0.8,
                  '& .MuiInputBase-root': { fontSize: '0.875rem' },
                  '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                  width: '200px',
                }}
              />
            )}
          />
        ),
      },
    ],
    [playlists, groupOptions, filters]
  );

  /**
   * Functions
   */
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleGroupChange = (value) => {
    setFilters((prev) => ({
      ...prev,
      group_name: value ? value.value : '',
    }));
  };

  const handleM3UChange = (value) => {
    setFilters((prev) => ({
      ...prev,
      m3u_account: value ? value.value : '',
    }));
  };

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
      const result = await API.queryStreams(params);
      setData(result.results);
      setRowCount(result.count);

      const newSelection = {};
      result.results.forEach((item, index) => {
        if (selectedStreamIds.includes(item.id)) {
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

    const groups = await API.getStreamGroups();
    setGroupOptions(groups);

    setIsLoading(false);
  }, [pagination, sorting, debouncedFilters]);

  useEffect(() => {
    console.log(pagination);
  }, [pagination]);

  // Fallback: Individual creation (optional)
  const createChannelFromStream = async (stream) => {
    await API.createChannelFromStream({
      channel_name: stream.name,
      channel_number: null,
      stream_id: stream.id,
    });
  };

  // Bulk creation: create channels from selected streams in one API call
  const createChannelsFromStreams = async () => {
    setIsLoading(true);
    await API.createChannelsFromStreams(
      selectedStreamIds.map((stream_id) => ({
        stream_id,
      }))
    );
    setIsLoading(false);
  };

  const editStream = async (stream = null) => {
    setStream(stream);
    setModalOpen(true);
  };

  const deleteStream = async (id) => {
    await API.deleteStream(id);
  };

  const deleteStreams = async () => {
    setIsLoading(true);
    await API.deleteStreams(selectedStreamIds);
    setIsLoading(false);
  };

  const closeStreamForm = () => {
    setStream(null);
    setModalOpen(false);
  };

  const addStreamsToChannel = async () => {
    const { streams, ...channel } = { ...channelsPageSelection[0] };
    await API.updateChannel({
      ...channel,
      stream_ids: [
        ...new Set(
          channelSelectionStreams
            .map((stream) => stream.id)
            .concat(selectedStreamIds)
        ),
      ],
    });
  };

  const addStreamToChannel = async (streamId) => {
    const { streams, ...channel } = { ...channelsPageSelection[0] };
    await API.updateChannel({
      ...channel,
      stream_ids: [
        ...new Set(
          channelSelectionStreams.map((stream) => stream.id).concat([streamId])
        ),
      ],
    });
  };

  const handleMoreActionsClick = (event, rowId) => {
    setMoreActionsAnchorEl(event.currentTarget);
    setActionsOpenRow(rowId);
  };

  const handleMoreActionsClose = () => {
    setMoreActionsAnchorEl(null);
    setActionsOpenRow(null);
  };

  const onRowSelectionChange = (updater) => {
    setRowSelection((prevRowSelection) => {
      const newRowSelection =
        typeof updater === 'function' ? updater(prevRowSelection) : updater;

      const updatedSelected = new Set([...selectedStreamIds]);
      table.getRowModel().rows.forEach((row) => {
        if (newRowSelection[row.id] === undefined || !newRowSelection[row.id]) {
          updatedSelected.delete(row.original.id);
        } else {
          updatedSelected.add(row.original.id);
        }
      });
      setSelectedStreamIds([...updatedSelected]);

      return newRowSelection;
    });
  };

  const onSelectAllChange = async (e) => {
    const selectAll = e.target.checked;
    if (selectAll) {
      // Get all stream IDs for current view
      const params = new URLSearchParams();
      Object.entries(debouncedFilters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      const ids = await API.getAllStreamIds(params);
      setSelectedStreamIds(ids);
    } else {
      setSelectedStreamIds([]);
    }

    const newSelection = {};
    table.getRowModel().rows.forEach((item, index) => {
      newSelection[index] = selectAll;
    });
    setRowSelection(newSelection);
  };

  const onPaginationChange = (updater) => {
    const newPagination = updater(pagination);
    if (JSON.stringify(newPagination) === JSON.stringify(pagination)) {
      // Prevent infinite re-render when there are no results
      return;
    }

    setPagination(updater);
  };

  const table = useMaterialReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data,
    enablePagination: true,
    manualPagination: true,
    enableTopToolbar: false, // completely removes MRT's built-in top toolbar
    enableRowVirtualization: true,
    renderTopToolbar: () => null, // Removes the entire top toolbar
    renderToolbarInternalActions: () => null, 
    rowVirtualizerInstanceRef,
    rowVirtualizerOptions: { overscan: 5 }, // optionally customize the row virtualizer
    manualSorting: true,
    enableBottomToolbar: true,
    enableStickyHeader: true,
    onPaginationChange: onPaginationChange,
    onSortingChange: setSorting,
    rowCount: rowCount,
    enableRowSelection: true,
    muiSelectAllCheckboxProps: {
      checked: selectedStreamIds.length === rowCount && rowCount > 0,
      indeterminate:
        selectedStreamIds.length > 0 && selectedStreamIds.length !== rowCount,
      onChange: onSelectAllChange,
    },
    onRowSelectionChange: onRowSelectionChange,
    initialState: {
      density: 'compact',
    },
    state: {
      isLoading,
      sorting,
      pagination,
      rowSelection,
    },
    enableRowActions: true,
    positionActionsColumn: 'first',

    enableHiding: false,

    // you can still use the custom toolbar callback if you like
    renderTopToolbarCustomActions: ({ table }) => {
      const selectedRowCount = table.getSelectedRowModel().rows.length;
      // optionally do something with selectedRowCount
    },

    renderRowActions: ({ row }) => (
      <>
        <Tooltip title="Add to Channel">
          <IconButton
            size="small"
            color="info"
            onClick={() => addStreamToChannel(row.original.id)}
            sx={{ py: 0, px: 0.5 }}
            disabled={
              channelsPageSelection.length !== 1 ||
              (channelSelectionStreams &&
                channelSelectionStreams
                  .map((stream) => stream.id)
                  .includes(row.original.id))
            }
          >
            <ListPlus size="18" fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Create New Channel">
          <IconButton
            size="small"
            color="success"
            onClick={() => createChannelFromStream(row.original)}
            sx={{ py: 0, px: 0.5 }}
          >
            <SquarePlus size="18" fontSize="small" />
          </IconButton>
        </Tooltip>

        <IconButton
          onClick={(event) => handleMoreActionsClick(event, row.original.id)}
          size="small"
          sx={{ py: 0, px: 0.5 }}
        >
          <MoreVertIcon />
        </IconButton>
        <Menu
          anchorEl={moreActionsAnchorEl}
          open={isMoreActionsOpen && actionsOpenRow === row.original.id}
          onClose={handleMoreActionsClose}
        >
          <MenuItem
            onClick={() => editStream(row.original.id)}
            disabled={row.original.m3u_account ? true : false}
          >
            Edit
          </MenuItem>
          <MenuItem onClick={() => deleteStream(row.original.id)}>
            Delete Stream
          </MenuItem>
        </Menu>
      </>
    ),
    muiPaginationProps: {
      size: 'small',
      rowsPerPageOptions: [25, 50, 100, 250, 500, 1000, 10000],
      labelRowsPerPage: 'Rows per page',
    },
    muiTableContainerProps: {
      sx: {
        height: 'calc(100vh - 145px)',
        overflowY: 'auto',
      },
    },
    displayColumnDefOptions: {
      'mrt-row-actions': {
        size: 68,
      },
      'mrt-row-select': {
        size: 50,
      },
    },
  });

  /**
   * useEffects
   */
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Scroll to the top of the table when sorting changes
    try {
      rowVirtualizerInstanceRef.current?.scrollToIndex?.(0);
    } catch (error) {
      console.error(error);
    }
  }, [sorting]);

  return (
    <Box>
      {/* Header Row */}
      <Box sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
        <Typography
          sx={{
            width: 88,
            height: 24,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: '20px',
            lineHeight: 1,
            letterSpacing: '-0.3px',
            color: theme.palette.text.secondary,
            mb: 0,
          }}
        >
          Streams
        </Typography>
      </Box>

      {/* Paper container with ghost state vs table */}
      <Paper
        sx={{
          bgcolor: theme.palette.background.paper,
          borderRadius: 2,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top toolbar: always visible */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: theme.palette.background.paper,
            justifyContent: 'flex-end',
            p: 1,
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Remove">
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  <IndeterminateCheckBox
                    sx={{ fontSize: 16, color: theme.palette.text.secondary }}
                  />
                }
                sx={{
                  borderColor: theme.palette.custom.borderDefault,
                  borderRadius: '4px',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  height: '25px',
                  opacity: 0.4,
                  color: theme.palette.text.secondary,
                  fontSize: '0.85rem',
                  px: 1,
                  py: 0.5,
                  '&:hover': {
                    borderColor: theme.palette.custom.borderHover,
                  },
                }}
              >
                Remove
              </Button>
            </Tooltip>
            <Tooltip title="Add to Channel">
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={
                    <AddBox
                      sx={{ fontSize: 16, color: theme.palette.text.secondary }}
                    />
                  }
                  disabled={
                    channelsPageSelection.length !== 1 ||
                    !eligibleSelectedStreamId
                  }
                  onClick={() => {
                    if (eligibleSelectedStreamId) {
                      addStreamToChannel(eligibleSelectedStreamId);
                    }
                  }}
                  sx={{
                    minWidth: '57px',
                    height: '25px',
                    borderRadius: '4px',
                    borderColor: theme.palette.custom.successBorder,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    backgroundColor: theme.palette.custom.successBg,
                    color: '#fff',
                    fontSize: '0.85rem',
                    px: 1,
                    py: 0.5,
                    '&:hover': {
                      backgroundColor: theme.palette.custom.successBgHover,
                    },
                  }}
                >
                  Add to Channel
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Create Channels">
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  <AddBox
                    sx={{ fontSize: 16, color: theme.palette.text.secondary }}
                  />
                }
                disabled={selectedStreamIds.length === 0}
                sx={{
                  minWidth: '57px',
                  height: '25px',
                  borderRadius: '4px',
                  borderColor: theme.palette.custom.successBorder,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  backgroundColor: theme.palette.custom.successBg,
                  color: '#fff',
                  fontSize: '0.85rem',
                  px: 1,
                  py: 0.5,
                  '&:hover': {
                    backgroundColor: theme.palette.custom.successBgHover,
                  },
                }}
                onClick={() => createChannelsFromStreams()}
              >
                Create Channels
              </Button>
            </Tooltip>
            <Tooltip title="Add Channel">
              <Button
                variant="contained"
                size="small"
                onClick={() => editStream()}
                startIcon={
                  <AddBox
                    sx={{
                      fontSize: 16,
                      color: theme.palette.custom.successIcon,
                    }}
                  />
                }
                sx={{
                  minWidth: '57px',
                  height: '25px',
                  borderRadius: '4px',
                  borderColor: theme.palette.custom.successBorder,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  backgroundColor: theme.palette.custom.successBg,
                  color: '#fff',
                  fontSize: '0.85rem',
                  px: 1,
                  py: 0.5,
                  '&:hover': {
                    backgroundColor: theme.palette.custom.successBgHover,
                  },
                }}
              >
                Add
              </Button>
            </Tooltip>

            {/* Show/Hide Columns Button added to top bar */}
            <Tooltip title="Show/Hide Columns">
              <MRT_ShowHideColumnsButton table={table} />
            </Tooltip>
          </Box>
        </Box>

        {/* Main content */}
        <Box
          sx={{
            flex: 1,
            position: 'relative',
            bgcolor: theme.palette.background.paper,
          }}
        >
          <StreamForm stream={stream} isOpen={modalOpen} onClose={closeStreamForm} />
          {hasData ? (
            <Box>
              <MaterialReactTable table={table} />
            </Box>
          ) : (
            // Ghost state placeholder, shown when there is no data
            <Box
              sx={{
                position: 'absolute',
                top: '25%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '420px',
                height: '247px',
                border: '1px solid #52525C',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{
                  fontWeight: 400,
                  fontSize: '20px',
                  lineHeight: '28px',
                  letterSpacing: '-0.3px',
                  color: '#D4D4D8',
                  mb: 1,
                }}
              >
                Getting started
              </Typography>
              <Typography
                sx={{
                  fontWeight: 400,
                  fontSize: '16px',
                  lineHeight: '24px',
                  letterSpacing: '-0.2px',
                  color: '#9FA3A9',
                  width: '372px',
                  mb: 2,
                }}
              >
                In order to get started, add your M3U or start adding custom streams.
              </Typography>
              <Button
                variant="contained"
                sx={{
                  minWidth: '127px',
                  height: '25px',
                  borderRadius: '4px',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  color: theme.palette.text.secondary,
                  borderColor: theme.palette.custom.borderHover,
                  backgroundColor: '#1f1f23',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 400,
                  fontSize: '0.85rem',
                  letterSpacing: '-0.2px',
                  textTransform: 'none',
                  px: 1,
                  py: 0.5,
                  '&:hover': {
                    borderColor: theme.palette.custom.borderDefault,
                    backgroundColor: '#17171B',
                  },
                }}
              >
                Add M3U
              </Button>
              <Typography sx={{ fontSize: '14px', color: '#71717B', mb: 1 }}>
                or
              </Typography>
              <Button
                variant="contained"
                sx={{
                  minWidth: '127px',
                  height: '25px',
                  borderRadius: '4px',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  color: theme.palette.text.secondary,
                  borderColor: theme.palette.custom.borderHover,
                  backgroundColor: '#1f1f23',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 400,
                  fontSize: '0.85rem',
                  letterSpacing: '-0.2px',
                  textTransform: 'none',
                  px: 1,
                  py: 0.5,
                  '&:hover': {
                    borderColor: theme.palette.custom.borderDefault,
                    backgroundColor: '#17171B',
                  },
                }}
              >
                Add Individual Stream
              </Button>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default StreamsTable;
