import { useEffect, useMemo, useCallback, useState } from 'react';
import {
  MaterialReactTable,
  useMaterialReactTable,
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
} from '@mui/material';
import API from '../../api';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  PlaylistAdd as PlaylistAddIcon,
} from '@mui/icons-material';
import { TableHelper } from '../../helpers';
import StreamForm from '../forms/Stream';
import usePlaylistsStore from '../../store/playlists';
import useChannelsStore from '../../store/channels';
import { useDebounce } from '../../utils';

const StreamsTable = ({}) => {
  /**
   * useState
   */
  const [rowSelection, setRowSelection] = useState([]);
  const [stream, setStream] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [moreActionsAnchorEl, setMoreActionsAnchorEl] = useState(null);
  const [filterValues, setFilterValues] = useState({});
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

  /**
   * Stores
   */
  const { playlists } = usePlaylistsStore();
  const { channelsPageSelection } = useChannelsStore();
  const channelSelectionStreams = useChannelsStore(
    (state) => state.channels[state.channelsPageSelection[0]?.id]?.streams
  );

  const isMoreActionsOpen = Boolean(moreActionsAnchorEl);

  /**
   * useMemos
   */
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
            value={filters[column.id]}
            onClick={(e) => e.stopPropagation()}
            onChange={handleFilterChange}
            size="small"
            margin="none"
            fullWidth
            sx={
              {
                // '& .MuiInputBase-root': { fontSize: '0.875rem' }, // Text size
                // '& .MuiInputLabel-root': { fontSize: '0.75rem' }, // Label size
                // width: '200px', // Optional: Adjust width
              }
            }
            // slotProps={{
            //   input: {
            //     endAdornment: (
            //       <InputAdornment position="end">
            //         <IconButton
            //           onClick={() => handleFilterChange(column.id, '')} // Clear text on click
            //           edge="end"
            //           size="small"
            //           sx={{ p: 0 }}
            //         >
            //           <ClearIcon sx={{ fontSize: '1rem' }} />
            //         </IconButton>
            //       </InputAdornment>
            //     ),
            //   },
            // }}
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
            sx={{ width: 300 }}
            clearOnEscape
            onChange={(event, newValue) =>
              handleFilterChange(column.id, newValue)
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Group"
                size="small"
                variant="standard"
                onClick={(e) => e.stopPropagation()}
                sx={{
                  pb: 0.8,
                  '& .MuiInputBase-root': { fontSize: '0.875rem' }, // Text size
                  '& .MuiInputLabel-root': { fontSize: '0.75rem' }, // Label size
                  width: '200px', // Optional: Adjust width
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
            options={m3uOptions}
            size="small"
            sx={{ width: 300 }}
            clearOnEscape
            onChange={(event, newValue) =>
              handleFilterChange(column.id, newValue)
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="M3U"
                size="small"
                variant="standard"
                onClick={(e) => e.stopPropagation()}
                sx={{
                  pb: 0.8,
                  '& .MuiInputBase-root': { fontSize: '0.875rem' }, // Text size
                  '& .MuiInputLabel-root': { fontSize: '0.75rem' }, // Label size
                  width: '200px', // Optional: Adjust width
                }}
              />
            )}
          />
        ),
      },
    ],
    [playlists, groupOptions, m3uOptions, filters]
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

    setIsLoading(false);
  }, [pagination, sorting, debouncedFilters]);

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
      table.getRowModel().rows.map((row) => {
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
      const ids = await API.getAllStreamIds();
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

  const table = useMaterialReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data,
    enablePagination: true,
    manualPagination: true,
    manualSorting: true,
    enableBottomToolbar: true,
    enableStickyHeader: true,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    rowCount: rowCount,
    enableRowSelection: true,
    muiSelectAllCheckboxProps: {
      checked: selectedStreamIds.length == rowCount,
      indeterminate:
        selectedStreamIds.length > 0 && selectedStreamIds.length != rowCount,
      onChange: onSelectAllChange,
    },
    onRowSelectionChange: onRowSelectionChange,
    onSortingChange: setSorting,
    state: {
      isLoading: isLoading,
      sorting,
      pagination,
      rowSelection,
    },
    enableRowActions: true,
    positionActionsColumn: 'first',
    renderRowActions: ({ row }) => (
      <>
        <Tooltip title="Add to Channel">
          <IconButton
            size="small"
            color="info"
            onClick={() => addStreamToChannel(row.original.id)}
            sx={{ py: 0, px: 0.5 }}
            disabled={
              channelsPageSelection.length != 1 ||
              (channelSelectionStreams &&
                channelSelectionStreams
                  .map((stream) => stream.id)
                  .includes(row.original.id))
            }
          >
            <PlaylistAddIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Create New Channel">
          <IconButton
            size="small"
            color="success"
            onClick={() => createChannelFromStream(row.original)}
            sx={{ py: 0, px: 0.5 }}
          >
            <AddIcon fontSize="small" />
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
          open={isMoreActionsOpen && actionsOpenRow == row.original.id}
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
      rowsPerPageOptions: [25, 50, 100, 250, 500],
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
    renderTopToolbarCustomActions: ({ table }) => {
      const selectedRowCount = table.getSelectedRowModel().rows.length;

      return (
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Typography>Streams</Typography>
          <Tooltip title="Add New Stream">
            <IconButton
              size="small"
              color="success"
              variant="contained"
              onClick={() => editStream()}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete Streams">
            <IconButton
              size="small"
              color="error"
              variant="contained"
              onClick={deleteStreams}
              disabled={setSelectedStreamIds == 0 || unselectedStreamIds == 0}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            onClick={createChannelsFromStreams}
            size="small"
            sx={{ marginLeft: 1 }}
            disabled={selectedRowCount == 0}
          >
            CREATE CHANNELS
          </Button>
          <Button
            variant="contained"
            onClick={addStreamsToChannel}
            size="small"
            sx={{ marginLeft: 1 }}
            disabled={
              channelsPageSelection.length != 1 || selectedRowCount == 0
            }
          >
            ADD TO CHANNEL
          </Button>
        </Stack>
      );
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

  return (
    <Box>
      <MaterialReactTable table={table} />
      <StreamForm
        stream={stream}
        isOpen={modalOpen}
        onClose={closeStreamForm}
      />
    </Box>
  );
};

export default StreamsTable;
