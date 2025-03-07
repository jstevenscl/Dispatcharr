import { useEffect, useMemo, useRef, useState } from 'react';
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
import useStreamsStore from '../../store/streams';
import API from '../../api';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  PlaylistAdd as PlaylistAddIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { TableHelper } from '../../helpers';
import StreamForm from '../forms/Stream';
import usePlaylistsStore from '../../store/playlists';
import useChannelsStore from '../../store/channels';

const StreamsTable = ({}) => {
  const [rowSelection, setRowSelection] = useState([]);
  const [stream, setStream] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [moreActionsAnchorEl, setMoreActionsAnchorEl] = useState(null);
  const [filterValues, setFilterValues] = useState({});
  const [groupOptions, setGroupOptions] = useState([]);
  const [m3uOptions, setM3uOptions] = useState([]);
  const [actionsOpenRow, setActionsOpenRow] = useState(null);

  const { streams, isLoading: streamsLoading } = useStreamsStore();
  const { playlists } = usePlaylistsStore();
  const { channelsPageSelection } = useChannelsStore();

  const isMoreActionsOpen = Boolean(moreActionsAnchorEl);

  const handleFilterChange = (columnId, value) => {
    setFilterValues((prev) => {
      return {
        ...prev,
        [columnId]: value ? value.toLowerCase() : '',
      };
    });
  };

  useEffect(() => {
    setGroupOptions([...new Set(streams.map((stream) => stream.group_name))]);
    setM3uOptions([...new Set(playlists.map((playlist) => playlist.name))]);
  }, [streams, playlists]);

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
            label="Name"
            value={filterValues[column.id]}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => handleFilterChange(column.id, e.target.value)}
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
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => handleFilterChange(column.id, '')} // Clear text on click
                      edge="end"
                      size="small"
                      sx={{ p: 0 }}
                    >
                      <ClearIcon sx={{ fontSize: '1rem' }} />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        ),
        meta: {
          filterVariant: null,
        },
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
    [playlists, groupOptions, m3uOptions]
  );

  const rowVirtualizerInstanceRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

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
    // Get all selected streams from the table
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());

    setIsLoading(true);
    await API.createChannelsFromStreams(
      selected.map((sel) => ({
        stream_id: sel.original.id,
        channel_name: sel.original.name,
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
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    await API.deleteStreams(selected.map((stream) => stream.original.id));
    setIsLoading(false);
  };

  const closeStreamForm = () => {
    setStream(null);
    setModalOpen(false);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      rowVirtualizerInstanceRef.current?.scrollToIndex?.(0);
    } catch (error) {
      console.error(error);
    }
  }, [sorting]);

  const addStreamsToChannel = async () => {
    const channel = channelsPageSelection[0];
    const selectedRows = table.getSelectedRowModel().rows;
    await API.updateChannel({
      ...channel,
      streams: [
        ...new Set(
          channel.stream_ids.concat(selectedRows.map((row) => row.original.id))
        ),
      ],
    });
  };

  const addStreamToChannel = async (streamId) => {
    const channel = channelsPageSelection[0];
    await API.updateChannel({
      ...channel,
      streams: [...new Set(channel.stream_ids.concat([streamId]))],
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

  const filteredData = streams.filter((row) =>
    columns.every(({ accessorKey }) =>
      filterValues[accessorKey]
        ? row[accessorKey]?.toLowerCase().includes(filterValues[accessorKey])
        : true
    )
  );

  const table = useMaterialReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: filteredData,
    enablePagination: false,
    enableRowVirtualization: true,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: {
      isLoading: isLoading || streamsLoading,
      sorting,
      rowSelection,
    },
    rowVirtualizerInstanceRef,
    rowVirtualizerOptions: { overscan: 5 },
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
              channelsPageSelection[0]?.stream_ids.includes(row.original.id)
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
    muiTableContainerProps: {
      sx: {
        height: 'calc(100vh - 75px)',
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
              disabled={selectedRowCount == 0}
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
            Create Channels
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
            Add to Channel
          </Button>
        </Stack>
      );
    },
  });

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
