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
import utils from '../../utils';
import StreamForm from '../forms/Stream';
import usePlaylistsStore from '../../store/playlists';

const Example = () => {
  const [rowSelection, setRowSelection] = useState([]);
  const [stream, setStream] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const { streams, isLoading: streamsLoading } = useStreamsStore();
  const { playlists } = usePlaylistsStore();

  const columns = useMemo(
    //column definitions...
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
      },
      {
        header: 'Group',
        accessorKey: 'group_name',
      },
      {
        header: 'M3U',
        size: 100,
        accessorFn: (row) =>
          playlists.find((playlist) => playlist.id === row.m3u_account)?.name,
      },
    ],
    [playlists]
  );

  //optionally access the underlying virtualizer instance
  const rowVirtualizerInstanceRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState([]);

  const createChannelFromStream = async (stream) => {
    await API.createChannelFromStream({
      channel_name: stream.name,
      channel_number: 0,
      stream_id: stream.id,
    });
  };

  // @TODO: bulk create is broken, returning a 404
  const createChannelsFromStreams = async () => {
    setIsLoading(true);
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    await utils.Limiter(
      4,
      selected.map((stream) => () => {
        return createChannelFromStream(stream.original);
      })
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
    const selected = table
      .getRowModel()
      .rows.filter((row) => row.getIsSelected());
    await API.deleteStreams(selected.map((stream) => stream.original.id));
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    //scroll to the top of the table when the sorting changes
    try {
      rowVirtualizerInstanceRef.current?.scrollToIndex?.(0);
    } catch (error) {
      console.error(error);
    }
  }, [sorting]);

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
    rowVirtualizerInstanceRef, //optional
    rowVirtualizerOptions: { overscan: 5 }, //optionally customize the row virtualizer
    enableRowActions: true,
    renderRowActions: ({ row }) => (
      <>
        <IconButton
          size="small" // Makes the button smaller
          color="warning" // Red color for delete actions
          onClick={() => editStream(row.original)}
          disabled={row.original.m3u_account}
          sx={{ p: 0 }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small" // Makes the button smaller
          color="error" // Red color for delete actions
          onClick={() => deleteStream(row.original.id)}
          sx={{ p: 0 }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small" // Makes the button smaller
          color="success" // Red color for delete actions
          onClick={() => createChannelFromStream(row.original)}
          sx={{ p: 0 }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </>
    ),
    muiTableContainerProps: {
      sx: {
        height: 'calc(100vh - 90px)', // Subtract padding to avoid cutoff
        overflowY: 'auto', // Internal scrolling for the table
      },
    },
    renderTopToolbarCustomActions: ({ table }) => (
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
        }}
      >
        <Typography>Streams</Typography>
        <Tooltip title="Add New Stream">
          <IconButton
            size="small" // Makes the button smaller
            color="success" // Red color for delete actions
            variant="contained"
            onClick={() => editStream()}
          >
            <AddIcon fontSize="small" /> {/* Small icon size */}
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete Streams">
          <IconButton
            size="small" // Makes the button smaller
            color="error" // Red color for delete actions
            variant="contained"
            onClick={deleteStreams}
          >
            <DeleteIcon fontSize="small" /> {/* Small icon size */}
          </IconButton>
        </Tooltip>
        <Button
          variant="contained"
          onClick={createChannelsFromStreams}
          size="small"
          // disabled={rowSelection.length === 0}
          sx={{
            marginLeft: 1,
          }}
        >
          Create Channels
        </Button>
      </Stack>
    ),
  });

  return (
    <Box
      sx={
        {
          // paddingTop: 2,
          // paddingLeft: 1,
          // paddingRight: 2,
          // paddingBottom: 2,
        }
      }
    >
      <MaterialReactTable table={table} />
      <StreamForm
        stream={stream}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </Box>
  );
};

export default Example;
