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
} from '@mui/material';
import useStreamsStore from '../../store/streams';
import API from '../../api';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { TableHelper } from '../../helpers';
import StreamForm from '../forms/Stream';
import usePlaylistsStore from '../../store/playlists';

const StreamsTable = ({ selectedChannels }) => {
  const [rowSelection, setRowSelection] = useState([]);
  const [stream, setStream] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const { streams, isLoading: streamsLoading } = useStreamsStore();
  const { playlists } = usePlaylistsStore();

  const columns = useMemo(
    () => [
      { header: 'Name', accessorKey: 'name' },
      { header: 'Group', accessorKey: 'group_name' },
      {
        header: 'M3U',
        size: 100,
        accessorFn: (row) =>
          playlists.find((playlist) => playlist.id === row.m3u_account)?.name,
      },
    ],
    [playlists]
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

  const addStreamsToChannel = async (stream) => {
    const channel = selectedChannels[0];
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

  const table = useMaterialReactTable({
    ...TableHelper.defaultProperties,
    columns,
    data: streams,
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
    renderRowActions: ({ row }) => (
      <>
        <IconButton
          size="small"
          color="warning"
          onClick={() => editStream(row.original)}
          disabled={row.original.m3u_account ? true : false}
          sx={{ p: 0 }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          color="error"
          onClick={() => deleteStream(row.original.id)}
          sx={{ p: 0 }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          color="success"
          onClick={() => createChannelFromStream(row.original)}
          sx={{ p: 0 }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </>
    ),
    muiTableContainerProps: {
      sx: {
        height: 'calc(100vh - 75px)',
        overflowY: 'auto',
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
            disabled={selectedChannels.length != 1 || selectedRowCount == 0}
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
